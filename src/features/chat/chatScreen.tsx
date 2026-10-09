import { useState } from "react";
import { signOut } from "../auth/api";
import { startConversation } from "./api";
import { Sidebar } from "./sideBar";
import { useConversations } from "./useConversations";
import { useOutbox, type OutboxMessage } from "./useOutbox";
import { MessagePanel} from "./messagePanel";
import { toAppError, type AppError } from "../../lib/errors";
import { ErrorNotice } from "../../ErrorNotice";

type Props = {
  myUserId: string;
};

const NO_UNSENT: OutboxMessage[] = [];

export function ChatScreen({ myUserId }: Props) {
  const { outbox, send, retry, retryNetworkFailures, subscribeToDelivered } = useOutbox(myUserId);
  const { conversations, error, loading, reconnecting, reload } = useConversations(myUserId, retryNetworkFailures);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<AppError | null>(null);

  async function handleSignOut() {
    setSignOutError(null);
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      setSignOutError(toAppError(err));
    } finally {
      setSigningOut(false);
    }
  }

async function handleStart(username: string) {
    const id = await startConversation(username);
    await reload();
    setSelectedId(id);
  }
  
const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="flex flex-col">
        <Sidebar
          conversations={conversations}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onStart={handleStart}
          loadError={error}
          loading={loading}
          reconnecting={reconnecting}
          onRetry={reload}
        />
        {signOutError && (
          <ErrorNotice
            variant="inline"
            className="border-r border-t bg-white p-3 text-xs"
            context="Couldn't sign out"
            error={signOutError}
            onRetry={handleSignOut}
            busy={signingOut}
          />
        )}
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="border-r border-t bg-white p-3 text-left text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >
          {signingOut ? "Signing out..." : "Exit"}
        </button>
      </div>

      {selected ? (
        <MessagePanel
            key={selected.id}
            conversationId={selected.id}
            myUserId={myUserId}
            otherUsername={selected.otherUsername}
            outbox={outbox[selected.id] ?? NO_UNSENT}
            send={send}
            retry={retry}
            subscribeToDelivered={subscribeToDelivered}
        />) : (
        <main className="flex flex-1 items-center justify-center text-gray-500">
            Select a conversation
        </main>
        )}
    </div>
  );
}