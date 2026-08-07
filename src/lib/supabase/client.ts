"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";
import { supabasePublishableKey, supabaseUrl } from "./env";

/** Cliente Supabase para Client Components. */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabasePublishableKey());
}
