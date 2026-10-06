import { useCallback, useEffect, useState } from "react";
import { getMessages, subscribeToMessages, type Message } from "./api";
import { toAppError, type AppError } from "../../lib/errors";

function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) {
    byId.set(m.id, m);
  }
  return [...byId.values()].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

export function useMessages(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(true);
  // Bumped by "Try again" to re-run the history load without touching the subscription.
  const [attempt, setAttempt] = useState(0);

  // Realtime: new messages arrive over the WebSocket.
  useEffect(() => {
    let cancelled = false;

    const unsubscribe = subscribeToMessages(conversationId, (message) => {
      if (!cancelled) {
        setMessages((prev) => mergeMessages(prev, [message]));
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [conversationId]);

  // History: loaded over HTTP, again on every retry.
  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    getMessages(conversationId)
      .then((history) => {
        if (!cancelled) {
          setMessages((prev) => mergeMessages(prev, history));
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

  return { messages, error, loading, reload };
}
