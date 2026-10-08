import { useCallback, useEffect, useRef, useState } from "react";
import { getMessages, sendMessages, subscribeToMessages, type Message } from "./api";
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

export function useMessages(conversationId: string, myUserId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  // "connecting" is the first join; "reconnecting" means the channel dropped.
  const [connection, setConnection] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const chainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = subscribeToMessages(
      conversationId,
      (message) => {
        if (!cancelled) {
          setMessages((prev) => mergeMessages(prev, [toSent(message)]));
        }
      },
      (subscribed) => {
        // Removing the channel in cleanup reports "not subscribed" too.
        if (!cancelled) {
          setConnection(subscribed ? "live" : "reconnecting");
        }
      }
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    getMessages(conversationId)
      .then((history) => {
        if (!cancelled) {
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

  const reload = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

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
