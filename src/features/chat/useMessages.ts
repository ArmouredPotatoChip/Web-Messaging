import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getMessagesAfter,
  getMessagesBefore,
  MESSAGE_LIMIT,
  sendMessages,
  subscribeToMessages,
  type Message,
} from "./api";
import { toAppError, type AppError } from "../../lib/errors";

export type OutboxMessage = Message &
  ({ status: "sending" } | { status: "failed"; error: AppError });

export type ChatMessage = (Message & { status: "sent" }) | OutboxMessage;

function mergeConfirmed(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  if (incoming.every((m) => byId.has(m.id))) return current;
  for (const m of incoming) {
    byId.set(m.id, m);
  }

  return [...byId.values()].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

function toChatMessages(confirmed: Message[], outbox: OutboxMessage[]): ChatMessage[] {
  const confirmedIds = new Set(confirmed.map((m) => m.id));
  return [
    ...confirmed.map((m): ChatMessage => ({ ...m, status: "sent" })),
    ...outbox.filter((m) => !confirmedIds.has(m.id)),
  ];
}

const CATCH_UP_OVERLAP_MS = 30_000;
const CATCH_UP_MAX_PAGES = 5;

export function useMessages(conversationId: string, myUserId: string) {
  const [confirmed, setConfirmed] = useState<Message[]>([]);
  const [outbox, setOutbox] = useState<OutboxMessage[]>([]);
  const [error, setError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const confirmedRef = useRef<Message[]>([]);
  const outboxRef = useRef<OutboxMessage[]>([]);
  const loadedRef = useRef(false);
  const syncIdRef = useRef(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<AppError | null>(null);
  const loadingOlderRef = useRef(false);

  const messages = useMemo(() => toChatMessages(confirmed, outbox), [confirmed, outbox]);

  useEffect(() => {
    confirmedRef.current = confirmed;
    outboxRef.current = outbox;
  }, [confirmed, outbox]);

  const reload = useCallback(async () => {
    const syncId = ++syncIdRef.current;
    const cursor = confirmedRef.current[confirmedRef.current.length - 1]?.created_at;

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
        setConfirmed((prev) => mergeConfirmed(prev, batch));
        if (batch.length < MESSAGE_LIMIT) return;

        const last = batch[batch.length - 1];
        if (last.id === lastId) break;
        lastId = last.id;
        after = last.created_at;
      }

      const latest = await getMessagesBefore(conversationId);
      if (syncIdRef.current !== syncId || latest.length === 0) return;
      const oldestKept = new Date(latest[0].created_at).getTime();
      setConfirmed((prev) =>
        mergeConfirmed(
          prev.filter((m) => new Date(m.created_at).getTime() >= oldestKept),
          latest
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
    const cursor = confirmedRef.current[0]?.created_at;
    if (loadingOlderRef.current || !hasMore || !cursor) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    setOlderError(null);
    const syncId = syncIdRef.current;
    try {
      const page = await getMessagesBefore(conversationId, cursor);
      if (syncIdRef.current !== syncId) return;

      const known = new Set(confirmedRef.current.map((m) => m.id));
      setConfirmed((prev) => mergeConfirmed(prev, page));
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

    setLoading(true);
    setError(null);
    getMessagesBefore(conversationId)
      .then((history) => {
        if (!cancelled) {
          loadedRef.current = true;
          setHasMore(history.length === MESSAGE_LIMIT);
          setConfirmed((prev) => mergeConfirmed(prev, history));
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
        setConfirmed((prev) => mergeConfirmed(prev, [stored]));
        setOutbox((prev) => prev.filter((m) => m.id !== id));
      } catch (err) {
        const appError = toAppError(err);
        setOutbox((prev) =>
          prev.map((m): OutboxMessage => (m.id === id ? { ...m, status: "failed", error: appError } : m))
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

  const queueSend = useCallback(
    (id: string, content: string) => {
      const local: OutboxMessage = {
        id,
        content,
        conversation_id: conversationId,
        sender_id: myUserId,
        created_at: new Date().toISOString(),
        status: "sending",
      };
      setOutbox((prev) => [...prev.filter((m) => m.id !== id), local]);
      enqueue(id, content);
    },
    [conversationId, myUserId, enqueue]
  );

  const send = useCallback((content: string) => queueSend(crypto.randomUUID(), content), [queueSend]);
  const retry = useCallback((m: ChatMessage) => queueSend(m.id, m.content), [queueSend]);

  useEffect(() => {
    let cancelled = false;
    let subscribed = false;

    const unsubscribe = subscribeToMessages(
      conversationId,
      (message) => {
        if (!cancelled) {
          setConfirmed((prev) => mergeConfirmed(prev, [message]));
        }
      },
      (isSubscribed) => {
        if (cancelled) return;
        subscribed = isSubscribed;

        if (!isSubscribed) {
          syncIdRef.current++;
          setReconnecting(true);
          return;
        }
        reload().finally(() => {
          if (cancelled || !subscribed) return;
          setReconnecting(false);
          for (const m of outboxRef.current) {
            if (m.status === "failed" && m.error.code === "NETWORK") {
              retry(m);
            }
          }
        });
      }
    );
    return () => {
      cancelled = true;
      syncIdRef.current++;
      unsubscribe();
    };
  }, [conversationId, reload, retry]);

  return {
    messages,
    error,
    loading,
    reconnecting,
    loadingOlder,
    olderError,
    reload,
    loadOlder,
    send,
    retry,
  };
}
