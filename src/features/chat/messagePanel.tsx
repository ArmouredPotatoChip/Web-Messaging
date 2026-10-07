import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMessages } from "./useMessages";

type Props = {
  conversationId: string;
  myUserId: string;
  otherUsername: string;
};

export function MessagePanel({ conversationId, myUserId, otherUsername }: Props) {
  const { messages, error, loading, reload, send, retry } = useMessages(conversationId, myUserId);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to the newest message whenever the list changes.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;

    // The message shows up right away as "sending"; its status lives in useMessages.
    send(content);
    setText("");
  }

  return (
    <section className="flex flex-1 flex-col">
      <header className="border-b bg-white p-3 font-semibold">{otherUsername}</header>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
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

        <div ref={bottomRef} />
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