import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error("Supabase connection info missing in .env");
}

export const supabase = createClient<Database>(url, key, {
  // Default is 25 s. A dead connection is noticed after one to two intervals,
  // so 5 s shows "Reconnecting..." within about 10 s.
  realtime: { heartbeatIntervalMs: 5000 },
});