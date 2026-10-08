import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useMessages } from "./useMessages";

const AT_BOTTOM_PX = 40;
const LOAD_OLDER_WITHIN_PX = 200;

type Props = {
  conversationId: string;
  myUserId: string;
  otherUsername: string;
};

export function MessagePanel({ conversationId, myUserId, otherUsername }: Props) {
  const { messages, error, loading, reconnecting, loadingOlder, olderError, reload, loadOlder, send, retry } =
    useMessages(conversationId, myUserId);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const prevLastIdRef = useRef<string | undefined>(undefined);
  const prevFirstIdRef = useRef<string | undefined>(undefined);
  // Measured from the bottom, because that distance survives messages being added above.
  const fromBottomRef = useRef(0);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    fromBottomRef.current = el.scrollHeight - el.scrollTop;
    // After a failed load, only "Try again" retries.
    if (el.scrollTop < LOAD_OLDER_WITHIN_PX && !olderError) {
      loadOlder();
    }
  }

  // Before paint, so a corrected position is never seen as a jump.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const first = messages[0];
    const last = messages[messages.length - 1];
    const wasEmpty = prevLastIdRef.current === undefined;
    const sentByMe = last?.id !== prevLastIdRef.current && last?.sender_id === myUserId;
    const prepended = first?.id !== prevFirstIdRef.current;
    prevLastIdRef.current = last?.id;
    prevFirstIdRef.current = first?.id;

    const wasAtBottom = fromBottomRef.current - el.clientHeight < AT_BOTTOM_PX;

    if (sentByMe || wasAtBottom) {
      // Smooth only from the bottom: a long smooth scroll would pass through the load zone.
      el.scrollTo({ top: el.scrollHeight, behavior: wasAtBottom && !wasEmpty ? "smooth" : "auto" });
      fromBottomRef.current = el.clientHeight;
      return;
    }
    if (prepended) {
      el.scrollTop = el.scrollHeight - fromBottomRef.current;
    }
    // A message added below changes the height without a scroll event.
    fromBottomRef.current = el.scrollHeight - el.scrollTop;
  }, [messages, myUserId]);

  // A page that does not fill the panel produces no scroll event.
  useEffect(() => {
    const el = listRef.current;
    if (el && el.scrollTop < LOAD_OLDER_WITHIN_PX && !olderError) {
      loadOlder();
    }
  }, [messages, olderError, loadOlder]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;

    // No await or catch: send() shows the message at once and tracks its own status.
    send(content);
    setText("");
  }

  return (
    <section className="flex flex-1 flex-col">
      <header className="border-b bg-white p-3 font-semibold">{otherUsername}</header>

      {reconnecting && (
        <p className="border-b bg-amber-50 px-3 py-1 text-xs text-amber-800">Reconnecting...</p>
      )}

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 space-y-2 overflow-y-auto p-4 [overflow-anchor:none]"
      >
        <p className="h-5 text-center text-xs text-gray-500">
          {loadingOlder && "Loading older messages..."}
        </p>

        {olderError && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm">
            <p className="font-medium text-red-700">Couldn't load older messages</p>
            <p className="text-red-600">{olderError.message}</p>
            {olderError.retryable && (
              <button onClick={loadOlder} disabled={loadingOlder} className="mt-2 text-red-700 underline disabled:opacity-50">
                Try again
              </button>
            )}
          </div>
        )}

        {loading && messages.length === 0 && (
          <p className="text-sm text-gray-500">Loading messages...</p>
        )}

        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm">
            <p className="font-medium text-red-700">Couldn't load messages</p>
            <p className="text-red-600">{error.message}</p>
            {error.retryable && (
              <button onClick={reload} disabled={loading} className="mt-2 text-red-700 underline disabled:opacity-50">
                Try again
              </button>
            )}
          </div>
        )}

        {messages.map((m) => {
          const isMine = m.sender_id === myUserId;
          return (
            <div key={m.id} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                  isMine ? "bg-blue-600 text-white" : "bg-white shadow"
                } ${m.status === "sent" ? "" : "opacity-70"}`}
              >
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
                <p className={`mt-1 text-[10px] ${isMine ? "text-blue-100" : "text-gray-400"}`}>
                  {m.status === "sending" && "Sending..."}
                  {m.status === "failed" && "Not sent"}
                  {m.status === "sent" &&
                    new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                </p>
              </div>
              {m.status === "failed" && (
                <div className="mt-1 max-w-[70%] text-right text-xs text-red-600">
                  <p className="font-medium">Couldn't send</p>
                  <p>{m.error?.message}</p>
                  {m.error?.retryable && (
                    <button type="button" onClick={() => retry(m)} className="underline">
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="border-t bg-white p-3">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border p-2 text-sm"
            placeholder="Type a message..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4000}
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="rounded bg-blue-600 px-4 text-sm text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </section>
  );
}