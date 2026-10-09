import { useCallback, useEffect, useRef, useState } from "react";
import { listConversations, type ConversationSummary, subscribeToNewConversations } from "./api";
import { toAppError, type AppError } from "../../lib/errors";

export function useConversations(myUserId: string, onSubscribed: () => void) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [error, setError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);

  const reloadIdRef = useRef(0);

  const reload = useCallback(async () => {
    const reloadId = ++reloadIdRef.current;
    setLoading(true);
    try {
      const list = await listConversations(myUserId);
      if (reloadIdRef.current !== reloadId) return;
      setConversations(list);
      setError(null);
    } catch (err) {
      if (reloadIdRef.current === reloadId) {
        setError(toAppError(err));
      }
    } finally {
      if (reloadIdRef.current === reloadId) {
        setLoading(false);
      }
    }
  }, [myUserId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = subscribeToNewConversations(
      myUserId,
      () => {
        reload();
      },
      (subscribed) => {
        if (!cancelled) {
          setReconnecting(!subscribed);
          if (subscribed) {
            reload();
            onSubscribed();
          }
        }
      }
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [myUserId, reload, onSubscribed]);

  return { conversations, error, loading, reconnecting, reload };
}