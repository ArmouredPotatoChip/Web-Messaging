import { useEffect, useRef, useState, type FormEvent } from "react";
import { sendMessages } from "./api";
import { useMessages } from "./useMessages";

type Props = {
  conversationId: string;
  myUserId: string;
  otherUsername: string;
};

export function MessagePanel({ conversationId, myUserId, otherUsername }: Props) {
  const { messages, error } = useMessages(conversationId);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to the newest message whenever the list changes.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;

    setSending(true);
    setSendError(null);
    try {
      await sendMessages(conversationId, myUserId, content);
      setText("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex flex-1 flex-col">
      <header className="border-b bg-white p-3 font-semibold">{otherUsername}</header>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {error && <p className="text-sm text-red-600">{error}</p>}

        {messages.map((m) => {
          const isMine = m.sender_id === myUserId;
          return (
            <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                  isMine ? "bg-blue-600 text-white" : "bg-white shadow"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
                <p className={`mt-1 text-[10px] ${isMine ? "text-blue-100" : "text-gray-400"}`}>
                  {new Date(m.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t bg-white p-3">
        {sendError && <p className="mb-2 text-xs text-red-600">{sendError}</p>}
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
            disabled={sending || !text.trim()}
            className="rounded bg-blue-600 px-4 text-sm text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </section>
  );
}