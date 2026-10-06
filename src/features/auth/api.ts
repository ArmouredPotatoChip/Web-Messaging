import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";

export async function signUp(email: string, password: string, username: string) {
    const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {data: {username}},
    });

    if (error) {
        // Supabase Auth returns 500 when the profile trigger fails (username taken
        // or invalid). supabase-js drops the error code for 5xx, so tag it here.
        if (error.status === 500) throw Object.assign(error, { hint: "SIGNUP_FAILED" });
        throw error;
    }
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
    const { data, error } = await supabase.rpc("is_username_available", {
        p_username: username,
    });

    if (error) throw error;
    return data;
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