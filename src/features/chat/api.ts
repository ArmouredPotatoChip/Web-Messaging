import { supabase } from "../../lib/supabase";
import { Database } from "../../lib/database.types";

export type Message = Database["public"]["Tables"]["messages"]["Row"];

const MESSAGE_LIMIT = 50;

export type ConversationSummary = {
    id: string;
    otherUsername: string;
}

export async function listConversations(myUserId: string): Promise<ConversationSummary[]> {
    const { data, error } = await supabase
    .from("conversations")
    .select("id, created_at, conversation_members(user_id, profiles(username))")
    .order("created_at", {ascending: false});

    if(error) throw error;

    return data.map((c) => {
        const other = c.conversation_members.find((m) => m.user_id !== myUserId);
        return{
            id: c.id,
            otherUsername: other?.profiles?.username ?? "unknown",
        };
    });
}

export async function startConversation(username: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_direct_conversation", {
    other_username: username.trim(),
  });

  if (error) throw error;
  return data;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
    const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", {ascending: false})
        .limit(MESSAGE_LIMIT);

    if (error) throw error;

    return data.reverse();
}

export async function sendMessages(
    id: string,
    conversationId: string,
    senderId: string,
    content: string
): Promise<"inserted" | "already_stored"> {
    const {error} = await supabase.from("messages").insert({
        id,
        conversation_id: conversationId,
        sender_id: senderId,
        content,
    });
    // 23505 = an earlier attempt with this id already stored the message.
    if (error?.code === "23505") return "already_stored";
    if (error) throw error;
    return "inserted";
}


export function subscribeToMessages(
  conversationId: string,
  onNewMessage: (message: Message) => void,
  onStatus: (subscribed: boolean) => void
): () => void {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onNewMessage(payload.new as Message)
    )
    // Fires on the first join and again on every rejoin after a dropped connection.
    .subscribe((status) => onStatus(status === "SUBSCRIBED"));

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToNewConversations( myUserId: string,
  onNewConversation: () => void,
  onStatus: (subscribed: boolean) => void
): () => void {
  const channel = supabase
    .channel(`conversation_members:${myUserId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "conversation_members",
        filter: `user_id=eq.${myUserId}`,
      },
      () => onNewConversation()
    )
    .subscribe((status) => onStatus(status === "SUBSCRIBED"));

  return () => {
    supabase.removeChannel(channel);
  };
}
