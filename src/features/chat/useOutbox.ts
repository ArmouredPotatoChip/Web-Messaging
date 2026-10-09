import { useCallback, useEffect, useRef, useState } from "react";
import { sendMessages, type Message } from "./api";
import { toAppError, type AppError } from "../../lib/errors";

export type OutboxMessage = Message &
  ({ status: "sending" } | { status: "failed"; error: AppError });

export type SubscribeToDelivered = (
  conversationId: string,
  onDelivered: (message: Message) => void
) => () => void;

type Outbox = Record<string, OutboxMessage[]>;

const NO_ENTRIES: OutboxMessage[] = [];

export function useOutbox(myUserId: string) {
  const [outbox, setOutbox] = useState<Outbox>({});
  const outboxRef = useRef<Outbox>({});
  const chainsRef = useRef(new Map<string, Promise<void>>());
  const listenersRef = useRef(new Map<string, (message: Message) => void>());

  useEffect(() => {
    outboxRef.current = outbox;
  }, [outbox]);

  const update = useCallback(
    (conversationId: string, change: (entries: OutboxMessage[]) => OutboxMessage[]) => {
      setOutbox((prev) => ({ ...prev, [conversationId]: change(prev[conversationId] ?? NO_ENTRIES) }));
    },
    []
  );

  const deliver = useCallback(
    async (conversationId: string, id: string, content: string) => {
      let stored: Message;
      try {
        stored = await sendMessages(id, conversationId, myUserId, content);
      } catch (err) {
        const appError = toAppError(err);
        update(conversationId, (entries) =>
          entries.map((m): OutboxMessage => (m.id === id ? { ...m, status: "failed", error: appError } : m))
        );
        return;
      }
      listenersRef.current.get(conversationId)?.(stored);
      update(conversationId, (entries) => entries.filter((m) => m.id !== id));
    },
    [myUserId, update]
  );

  const enqueue = useCallback(
    (conversationId: string, id: string, content: string) => {
      const previous = chainsRef.current.get(conversationId) ?? Promise.resolve();
      chainsRef.current.set(
        conversationId,
        previous
          .then(() => deliver(conversationId, id, content))
          .catch((err) => console.error("send chain:", err))
      );
    },
    [deliver]
  );

  const queueSend = useCallback(
    (conversationId: string, id: string, content: string) => {
      const local: OutboxMessage = {
        id,
        content,
        conversation_id: conversationId,
        sender_id: myUserId,
        created_at: new Date().toISOString(),
        status: "sending",
      };
      update(conversationId, (entries) => [...entries.filter((m) => m.id !== id), local]);
      enqueue(conversationId, id, content);
    },
    [myUserId, update, enqueue]
  );

  const send = useCallback(
    (conversationId: string, content: string) => queueSend(conversationId, crypto.randomUUID(), content),
    [queueSend]
  );

  const retry = useCallback(
    (m: Message) => queueSend(m.conversation_id, m.id, m.content),
    [queueSend]
  );

  const retryNetworkFailures = useCallback(() => {
    for (const entries of Object.values(outboxRef.current)) {
      for (const m of entries) {
        if (m.status === "failed" && m.error.code === "NETWORK") {
          retry(m);
        }
      }
    }
  }, [retry]);

  const subscribeToDelivered = useCallback<SubscribeToDelivered>((conversationId, onDelivered) => {
    listenersRef.current.set(conversationId, onDelivered);
    return () => {
      if (listenersRef.current.get(conversationId) === onDelivered) {
        listenersRef.current.delete(conversationId);
      }
    };
  }, []);

  return { outbox, send, retry, retryNetworkFailures, subscribeToDelivered };
}
