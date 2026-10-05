import { useEffect, useState } from "react";
import { getMessages, subscribeToMessages, type Message } from "./api";

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = subscribeToMessages(conversationId, (message) => {
      if (!cancelled) {
        setMessages((prev) => mergeMessages(prev, [message]));
      }
    });
    getMessages(conversationId)
      .then((history) => {
        if (!cancelled) {
          setMessages((prev) => mergeMessages(prev, history));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load messages.");
        }
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [conversationId]);

  return { messages, error };
}