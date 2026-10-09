import { useCallback, useEffect, useRef, useState } from "react";
import {
  getMessagesAfter,
  getMessagesBefore,
  MESSAGE_LIMIT,
  sendMessages,
  subscribeToMessages,
  type Message,
} from "./api";
import { toAppError, type AppError } from "../../lib/errors";

export type ChatMessage = Message & {
  status: "sent" | "sending" | "failed";
  error?: AppError;
};

function toSent(message: Message): ChatMessage {
  return { ...message, status: "sent" };
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  if (incoming.every((m) => byId.get(m.id)?.status === "sent")) return current;
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

const CATCH_UP_OVERLAP_MS = 30_000;
const CATCH_UP_MAX_PAGES = 5;

function newestConfirmedAt(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].status === "sent") return messages[i].created_at;
  }
  return null;
}

function oldestConfirmedAt(messages: ChatMessage[]): string | null {
  const first = messages[0];
  return first?.status === "sent" ? first.created_at : null;
}

export function useMessages(conversationId: string, myUserId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [connection, setConnection] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const messagesRef = useRef<ChatMessage[]>([]);
  const loadedRef = useRef(false);
  const syncIdRef = useRef(0);
  const prevConnectionRef = useRef(connection);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<AppError | null>(null);
  const loadingOlderRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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
        if (batch.length < MESSAGE_LIMIT) return;

        const last = batch[batch.length - 1];
        if (last.id === lastId) break;
        lastId = last.id;
        after = last.created_at;
      }

      const latest = await getMessagesBefore(conversationId);
      if (syncIdRef.current !== syncId || latest.length === 0) return;
      const oldestKept = new Date(latest[0].created_at).getTime();
      setMessages((prev) =>
        mergeMessages(
          prev.filter((m) => m.status !== "sent" || new Date(m.created_at).getTime() >= oldestKept),
          latest.map(toSent)
        )
      );
      setHasMore(latest.length === MESSAGE_LIMIT);
    } catch (err) {
      if (syncIdRef.current === syncId) {
        setError(toAppError(err));
      }
    }
  }, [conversationId]);

  const loadOlder = useCallback(async () => {
    const cursor = oldestConfirmedAt(messagesRef.current);
    if (loadingOlderRef.current || !hasMore || !cursor) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    setOlderError(null);
    const syncId = syncIdRef.current;
    try {
      const page = await getMessagesBefore(conversationId, cursor);
      if (syncIdRef.current !== syncId) return;

      const known = new Set(messagesRef.current.map((m) => m.id));
      setMessages((prev) => mergeMessages(prev, page.map(toSent)));
      setHasMore(page.length === MESSAGE_LIMIT && page.some((m) => !known.has(m.id)));
    } catch (err) {
      setOlderError(toAppError(err));
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [conversationId, hasMore]);

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
        if (cancelled) return;
        subscribed = isSubscribed;

        if (!isSubscribed) {
          syncIdRef.current++;
          setConnection("reconnecting");
          return;
        }
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
    getMessagesBefore(conversationId)
      .then((history) => {
        if (!cancelled) {
          loadedRef.current = true;
          setHasMore(history.length === MESSAGE_LIMIT);
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
        const stored = await sendMessages(id, conversationId, myUserId, content);
        setMessages((prev) => mergeMessages(prev, [toSent(stored)]));
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

  useEffect(() => {
    const wasLive = prevConnectionRef.current === "live";
    prevConnectionRef.current = connection;
    if (connection !== "live" || wasLive) return;

    for (const m of messagesRef.current) {
      if (m.status === "failed" && m.error?.code === "NETWORK") {
        retry(m);
      }
    }
  }, [connection, retry]);

  return {
    messages,
    error,
    loading,
    reconnecting: connection === "reconnecting",
    loadingOlder,
    olderError,
    reload,
    loadOlder,
    send,
    retry,
  };
}
