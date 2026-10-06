import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { onAuthChange } from "./api";

export function useSession() {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthChange((s) => {
            setSession(s);
            setLoading(false);
        });
        return unsubscribe;
    }, []);
    return {session, loading};
}