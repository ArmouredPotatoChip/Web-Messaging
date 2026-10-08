import { supabase } from "../../lib/supabase";
import { Database } from "../../lib/database.types";

export type Message = Database["public"]["Tables"]["messages"]["Row"];

export const MESSAGE_LIMIT = 50;

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

// The cursor row is included: rows sharing its timestamp would be skipped otherwise.
export async function getMessagesBefore(conversationId: string, before?: string): Promise<Message[]> {
    let query = supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId);

    if (before) {
        query = query.lte("created_at", before);
    }

    const { data, error } = await query
        .order("created_at", {ascending: false})
        .order("id", {ascending: false})
        .limit(MESSAGE_LIMIT);

    if (error) throw error;

    return data.reverse();
}

// The cursor row is included: rows sharing its timestamp would be skipped otherwise.
export async function getMessagesAfter(conversationId: string, after: string): Promise<Message[]> {
    const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .gte("created_at", after)
        .order("created_at", {ascending: true})
        // Keeps the order stable when two messages share a timestamp.
        .order("id", {ascending: true})
        .limit(MESSAGE_LIMIT);

    if (error) throw error;

    return data;
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
    .channel(`messages:${conversationId}`, {
      // Holds SUBSCRIBED until the server is streaming, so the catch-up cannot run too early.
      config: { postgres_changes_options: { wait: true } },
    })
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
    .channel(`conversation_members:${myUserId}`, {
      config: { postgres_changes_options: { wait: true } },
    })
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
