"use server";

import { cookies } from "next/headers";
import { COOKIE_TEMA, type Tema } from "@/lib/tema";

/**
 * Grava a escolha de tema do visitante — chamada pelo seletor no cliente.
 * `null` apaga o cookie e devolve o controle para `prefers-color-scheme`.
 *
 * Um ano de validade: quem escolheu não deveria ter que escolher de novo a
 * cada visita, e tema não é dado sensível o bastante para expirar cedo.
 */
export async function definirTema(tema: Tema | null): Promise<void> {
  const store = await cookies();
  if (tema === null) {
    store.delete(COOKIE_TEMA);
    return;
  }
  store.set(COOKIE_TEMA, tema, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
