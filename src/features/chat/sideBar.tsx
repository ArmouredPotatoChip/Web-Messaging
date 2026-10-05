import { useState, type FormEvent } from "react";
import type { ConversationSummary } from "./api";

type Props = {
  conversations: ConversationSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStart: (username: string) => Promise<void>;
};

export function Sidebar({ conversations, selectedId, onSelect, onStart }: Props) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) return; // buraya bir geri bildirim verilmesi lağzım

    setError(null);
    setBusy(true);
    try {
      await onStart(username);
      setUsername("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sohbet başlatılamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex w-64 flex-col border-r bg-white">
      <form onSubmit={handleSubmit} className="space-y-2 border-b p-3">
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border p-2 text-sm"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-blue-600 px-3 text-sm text-white disabled:opacity-50"
          >
            Start Convo
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>

      <ul className="flex-1 overflow-y-auto">
        {conversations.length === 0 && (
          <li className="p-3 text-sm text-gray-500">No chats yet.</li>
        )}
        {conversations.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              className={`w-full p-3 text-left text-sm hover:bg-gray-100 ${
                c.id === selectedId ? "bg-gray-100 font-semibold" : ""
              }`}
            >
              {c.otherUsername}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}