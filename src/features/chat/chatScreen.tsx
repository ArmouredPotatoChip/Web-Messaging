import { useState } from "react";
import { signOut } from "../auth/api";
import { startConversation } from "./api";
import { Sidebar } from "./sideBar";
import { useConversations } from "./useConversations";
import { MessagePanel} from "./messagePanel";

type Props = {
  myUserId: string;
};

export function ChatScreen({ myUserId }: Props) {
  const { conversations, error, reload } = useConversations(myUserId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
        />
        <button
          onClick={() => signOut()}
          className="border-r border-t bg-white p-3 text-left text-sm text-gray-600 hover:bg-gray-100"
        >
          Exit
        </button>
      </div>

      {selected ? (
        <MessagePanel
            key={selected.id}
            conversationId={selected.id}
            myUserId={myUserId}
            otherUsername={selected.otherUsername}
        />) : (
        <main className="flex flex-1 items-center justify-center text-gray-500">
            {error ? <p className="text-red-600">{error}</p> : "Select a conversation"}
        </main>
        )}
    </div>
  );
}