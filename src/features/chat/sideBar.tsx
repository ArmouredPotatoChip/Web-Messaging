import { useState, type FormEvent } from "react";
import type { ConversationSummary } from "./api";
import { toAppError, type AppError } from "../../lib/errors";

type Props = {
  conversations: ConversationSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStart: (username: string) => Promise<void>;
  loadError: AppError | null;
  loading: boolean;
  reconnecting: boolean;
  onRetry: () => void;
};

export function Sidebar({ conversations, selectedId, onSelect, onStart, loadError, loading, reconnecting, onRetry }: Props) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<AppError | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setError(null);
    setInputError(null);

    if (!username.trim()) {
      setInputError("Enter a username.");
      return;
    }

    setBusy(true);
    try {
      await onStart(username);
      setUsername("");
    } catch (err) {
      setError(toAppError(err));
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    start();
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
        {inputError && <p className="text-xs text-red-600">{inputError}</p>}
        {error && (
          <div className="text-xs text-red-600">
            <p className="font-medium">Couldn't start conversation</p>
            <p>{error.message}</p>
            {error.retryable && (
              <button type="button" onClick={start} disabled={busy} className="underline disabled:opacity-50">
                Try again
              </button>
            )}
          </div>
        )}
      </form>

      {reconnecting && (
        <p className="border-b bg-amber-50 px-3 py-1 text-xs text-amber-800">Reconnecting...</p>
      )}

      <ul className="flex-1 overflow-y-auto">
        {loadError && (
          <li className="m-3 rounded border border-red-200 bg-red-50 p-3 text-sm">
            <p className="font-medium text-red-700">Couldn't load conversations</p>
            <p className="text-red-600">{loadError.message}</p>
            {loadError.retryable && (
              <button onClick={onRetry} disabled={loading} className="mt-2 text-red-700 underline disabled:opacity-50">
                Try again
              </button>
            )}
          </li>
        )}

        {!loadError && loading && conversations.length === 0 && (
          <li className="p-3 text-sm text-gray-500">Loading conversations...</li>
        )}

        {!loadError && !loading && conversations.length === 0 && (
          <li className="p-3 text-sm text-gray-500">No conversations yet.</li>
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