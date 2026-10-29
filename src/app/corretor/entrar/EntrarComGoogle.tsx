"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import s from "../campoDeAcesso.module.css";

/**
 * "Entrar com Google" (29/10/2026). Só aparece com
 * `NEXT_PUBLIC_LOGIN_GOOGLE=sim`: o provedor precisa estar ligado no painel
 * do Supabase antes (sem isso o Google devolve erro e a pessoa ficaria
 * presa num botão quebrado). Quem pode entrar é decidido na volta
 * (`/auth/google`): só quem já tem conta.
 */
export function EntrarComGoogle({ next }: { next?: string }) {
  const [indo, setIndo] = useState(false);
  if (process.env.NEXT_PUBLIC_LOGIN_GOOGLE !== "sim") return null;

  async function entrar() {
    setIndo(true);
    const volta = new URL("/auth/google", window.location.origin);
    if (next) volta.searchParams.set("next", next);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: volta.toString(), queryParams: { prompt: "select_account" } },
    });
    if (error) setIndo(false);
  }

  return (
    <>
      <div className={s.divisor}>
        <span>ou</span>
      </div>
      <button type="button" onClick={entrar} disabled={indo} className={s.botaoGoogle}>
        <svg viewBox="0 0 24 24" aria-hidden className="size-5">
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z" />
          <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.9l4-3.1Z" />
          <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
        </svg>
        {indo ? "Abrindo o Google…" : "Entrar com Google"}
      </button>
    </>
  );
}
