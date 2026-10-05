import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";

export async function signUp(email: string, password: string, username: string) {
    const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {data: {username}},
    });

    if(error){
        if(error.message.includes("Database error saving new user")){
            throw new Error("This username already exists")
        }
        throw error;
    }
}

export async function signIn(email: string, password: string) {
    const {error} = await supabase.auth.signInWithPassword({ email, password});
    if (error) throw error;
}

export async function signOut() {
    const {error} = await supabase.auth.signOut();
    if (error) throw error;
}

export function onAuthChange(callback: (session: Session | null) => void){
    const {data} = supabase.auth.onAuthStateChange((_event, session) => {
        callback(session);
    });

    return () => data.subscription.unsubscribe();
}