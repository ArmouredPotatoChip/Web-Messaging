import { useCallback, useEffect, useRef, useState } from "react";
import {
  getMessages,
  getMessagesAfter,
  MESSAGE_LIMIT,
  sendMessages,
  subscribeToMessages,
  type Message,
} from "./api";
import { toAppError, type AppError } from "../../lib/errors";

// status and error exist only in client state, never in the database.
export type ChatMessage = Message & {
  status: "sent" | "sending" | "failed";
  error?: AppError;
};

function toSent(message: Message): ChatMessage {
  return { ...message, status: "sent" };
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) {
    byId.set(m.id, m);
  }
  
  return [...byId.values()].sort((a, b) => {
    const aPending = a.status !== "sent";
    const bPending = b.status !== "sent";
    if (aPending !== bPending) return aPending ? 1 : -1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

// Catch-up starts this far before the cursor: created_at is taken when an insert
// starts, so a row can become visible with a slightly older timestamp.
const CATCH_UP_OVERLAP_MS = 30_000;
const CATCH_UP_MAX_PAGES = 5;

// The catch-up cursor. Local messages are skipped: their created_at is the client clock.
function newestConfirmedAt(messages: ChatMessage[]): string | null {
  // mergeMessages keeps confirmed messages first, oldest to newest.
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].status === "sent") return messages[i].created_at;
  }
  return null;
}

export function useMessages(conversationId: string, myUserId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  // "connecting" is the first join; "reconnecting" means the channel dropped.
  const [connection, setConnection] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  // Latest list, for callbacks that must not re-run on every new message.
  const messagesRef = useRef<ChatMessage[]>([]);
  // True once the history load has succeeded; before that there is nothing to catch up from.
  const loadedRef = useRef(false);
  // Bumped by every resync, drop and unmount, so an older catch-up loop stops.
  const syncIdRef = useRef(0);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Resync over HTTP: catch up from the newest confirmed message, or load the
  // latest page when there is nothing to catch up from.
  const reload = useCallback(async () => {
    const syncId = ++syncIdRef.current;
    const cursor = newestConfirmedAt(messagesRef.current);

    if (!cursor || !loadedRef.current) {
      setAttempt((n) => n + 1);
      return;
    }

    setError(null);
    let after = new Date(new Date(cursor).getTime() - CATCH_UP_OVERLAP_MS).toISOString();
    let lastId: string | null = null;
    try {
      for (let page = 0; page < CATCH_UP_MAX_PAGES; page++) {
        const batch = await getMessagesAfter(conversationId, after);
        if (syncIdRef.current !== syncId) return;
        setMessages((prev) => mergeMessages(prev, batch.map(toSent)));
        // A short page means we reached the newest message.
        if (batch.length < MESSAGE_LIMIT) return;

        const last = batch[batch.length - 1];
        // Same last row twice = no progress (a full page sharing one timestamp).
        if (last.id === lastId) break;
        lastId = last.id;
        // The raw server string keeps microseconds; a Date round-trip would drop them.
        after = last.created_at;
      }

      // Too far behind: restart from the latest page. Drop only confirmed messages
      // older than that page; newer ones arrived live while it was loading.
      const latest = await getMessages(conversationId);
      if (syncIdRef.current !== syncId || latest.length === 0) return;
      const oldestKept = new Date(latest[0].created_at).getTime();
      setMessages((prev) =>
        mergeMessages(
          prev.filter((m) => m.status !== "sent" || new Date(m.created_at).getTime() >= oldestKept),
          latest.map(toSent)
        )
      );
    } catch (err) {
      if (syncIdRef.current === syncId) {
        setError(toAppError(err));
      }
    }
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;
    let subscribed = false;

    const unsubscribe = subscribeToMessages(
      conversationId,
      (message) => {
        if (!cancelled) {
          setMessages((prev) => mergeMessages(prev, [toSent(message)]));
        }
      },
      (isSubscribed) => {
        // Removing the channel in cleanup reports "not subscribed" too.
        if (cancelled) return;
        subscribed = isSubscribed;

        if (!isSubscribed) {
          syncIdRef.current++;
          setConnection("reconnecting");
          return;
        }
        // Events missed while disconnected are not replayed. The banner stays
        // until the catch-up has settled.
        reload().finally(() => {
          if (!cancelled && subscribed) {
            setConnection("live");
          }
        });
      }
    );
    return () => {
      cancelled = true;
      syncIdRef.current++;
      unsubscribe();
    };
  }, [conversationId, reload]);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    getMessages(conversationId)
      .then((history) => {
        if (!cancelled) {
          loadedRef.current = true;
          setMessages((prev) => mergeMessages(prev, history.map(toSent)));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(toAppError(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, attempt]);

  const deliver = useCallback(
    async (id: string, content: string) => {
      try {
        const result = await sendMessages(id, conversationId, myUserId, content);
        if (result === "already_stored") {
          const latest = await getMessages(conversationId);
          setMessages((prev) => mergeMessages(prev, latest.map(toSent)));
        }
      } catch (err) {
        const appError = toAppError(err);
        setMessages((prev) =>
          prev.map((m): ChatMessage =>
            m.id === id && m.status === "sending" ? { ...m, status: "failed", error: appError } : m
          )
        );
      }
    },
    [conversationId, myUserId]
  );

  const enqueue = useCallback(
    (id: string, content: string) => {
      chainRef.current = chainRef.current
        .then(() => deliver(id, content))
        .catch((err) => console.error("send chain:", err));
    },
    [deliver]
  );

  const send = useCallback(
    (content: string) => {
      const local: ChatMessage = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        sender_id: myUserId,
        content,
        created_at: new Date().toISOString(),
        status: "sending",
      };
      setMessages((prev) => mergeMessages(prev, [local]));
      enqueue(local.id, content);
    },
    [conversationId, myUserId, enqueue]
  );

  const retry = useCallback(
    (message: ChatMessage) => {
      const again: ChatMessage = {
        ...message,
        status: "sending",
        error: undefined,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => mergeMessages(prev, [again]));
      enqueue(message.id, message.content);
    },
    [enqueue]
  );

  return { messages, error, loading, reconnecting: connection === "reconnecting", reload, send, retry };
}
