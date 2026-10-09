import { useState } from "react";
import { startConversation } from "./api";
import { Sidebar } from "./sideBar";
import { useConversations } from "./useConversations";
import { useOutbox, type OutboxMessage } from "./useOutbox";
import { MessagePanel} from "./messagePanel";

type Props = {
  myUserId: string;
};

const NO_UNSENT: OutboxMessage[] = [];

export function ChatScreen({ myUserId }: Props) {
  const { outbox, send, retry, retryNetworkFailures, subscribeToDelivered } = useOutbox(myUserId);
  const { conversations, error, loading, reconnecting, reload } = useConversations(myUserId, retryNetworkFailures);
  const [selectedId, setSelectedId] = useState<string | null>(null);

async function handleStart(username: string) {
    const id = await startConversation(username);
    await reload();
    setSelectedId(id);
  }
  
const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-screen bg-gray-50">
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