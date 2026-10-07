import { useCallback, useEffect, useState } from "react";
import { listConversations, type ConversationSummary, subscribeToNewConversations } from "./api";
import { toAppError, type AppError } from "../../lib/errors";

export function useConversations(myUserId: string) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [error, setError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setConversations(await listConversations(myUserId));
      setError(null);
    } catch (err) {
      setError(toAppError(err));
    } finally {
      setLoading(false);
    }
  }, [myUserId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const unsubscribe = subscribeToNewConversations(myUserId, () => {
      reload();
    });
    return unsubscribe;
  }, [myUserId, reload]);

  return { conversations, error, loading, reload };
}