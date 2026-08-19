import { cookies } from "next/headers";

/**
 * Tema visual escolhido pelo visitante.
 *
 * São três estados, não dois: "claro", "escuro" e — a ausência de cookie —
 * seguir o sistema operacional. O terceiro é o padrão e não tem valor próprio
 * de propósito: sem cookie, nada é carimbado no `<html>` e quem decide é o
 * `@media (prefers-color-scheme: light)` do globals.css, que funciona mesmo
 * sem JavaScript.
 */
export const COOKIE_TEMA = "tema";

export type Tema = "claro" | "escuro";

/**
 * O tema explicitamente escolhido, ou `null` para "seguir o sistema".
 *
 * Ler no servidor só é barato porque toda rota deste site já é dinâmica (o
 * `proxy.ts` e o cookie de corretor ativo garantem isso). É o que permite
 * carimbar `data-tema` já na primeira resposta e dispensar o script de
 * anti-flash que sites estáticos precisam ter.
 *
 * Valor desconhecido no cookie vira `null` em vez de erro: um cookie
 * adulterado deve cair no padrão, não derrubar a página.
 */
export async function getTemaEscolhido(): Promise<Tema | null> {
  const valor = (await cookies()).get(COOKIE_TEMA)?.value;
  return valor === "claro" || valor === "escuro" ? valor : null;
}

/**
 * Cor que o navegador usa na própria barra (Chrome no Android, Safari no iOS).
 * Precisa acompanhar o fundo da página, senão a moldura do navegador fica de
 * um tema e o conteúdo do outro.
 *
 * São os mesmos valores de `--color-fundo` em cada leitura, escritos à mão
 * porque `<meta>` não lê variável CSS.
 */
export const COR_DA_BARRA: Record<Tema, string> = {
  escuro: "#040b0a",
  claro: "#edf2f0",
};
