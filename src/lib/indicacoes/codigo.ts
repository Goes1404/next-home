// O código do "indique e ganhe" (0247, 29/10/2026).
//
// Módulo PURO (o `proxy.ts` e a rota `/i/<codigo>` também o importam): o
// formato do código, o cookie que guarda a indicação por 30 dias e o link e
// a mensagem que o gestor compartilha. Quem decide se o código existe é o
// banco, na hora de registrar a indicação (`indicacao.ts`); aqui só o
// formato, para lixo não virar cookie nem consulta.

/** O cookie que leva a indicação do link até a contratação. */
export const COOKIE_DE_INDICACAO = "astro_indicacao";

/** 30 dias, como o cookie do link do corretor (`proxy.ts`). */
export const DIAS_DO_COOKIE_DE_INDICACAO = 30;

export const OPCOES_DO_COOKIE_DE_INDICACAO = {
  maxAge: DIAS_DO_COOKIE_DE_INDICACAO * 24 * 60 * 60,
  path: "/",
  sameSite: "lax",
  httpOnly: true,
} as const;

/** O parâmetro da página de contratação: `/astro/contratar?indicacao=<codigo>`. */
export const PARAMETRO_DE_INDICACAO = "indicacao";

/** O mesmo formato do CHECK da 0247: minúsculas e dígitos, 6 a 32. */
const FORMATO = /^[a-z0-9]{6,32}$/;

/**
 * O código limpo, ou `null`. Aceita maiúsculas e espaços nas pontas (quem
 * digita o código à mão), nada além disso.
 */
export function normalizarCodigoDeIndicacao(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const limpo = bruto.trim().toLowerCase();
  return FORMATO.test(limpo) ? limpo : null;
}

/**
 * Qual código vale na contratação: o do endereço (`?indicacao=`) vence o do
 * cookie, porque é o link que a pessoa acabou de abrir. Os dois inválidos:
 * nenhum.
 */
export function codigoQueVale(parametro: unknown, cookie: unknown): string | null {
  return normalizarCodigoDeIndicacao(parametro) ?? normalizarCodigoDeIndicacao(cookie);
}

/** O link curto que o gestor compartilha. `base` sem barra no fim. */
export function linkDeIndicacao(codigo: string, base: string): string {
  return `${base.replace(/\/+$/, "")}/i/${codigo}`;
}

/** O texto pronto do botão de WhatsApp (neutro: serve a qualquer ramo). */
export function mensagemDeIndicacao(nomeDaConta: string, link: string): string {
  // Sem artigo: a conta pode ser uma empresa ("Imob Sol") ou uma pessoa.
  const quem = nomeDaConta.trim() ? ` ${nomeDaConta.trim()} usa e recomenda.` : "";
  return `Oi! Conheça o CRM da Astro Soluções: atende os clientes no WhatsApp com IA, organiza o funil e a agenda.${quem} Teste grátis por 7 dias: ${link}`;
}

/** O link do WhatsApp sem destinatário (a pessoa escolhe para quem mandar). */
export function linkDoWhatsAppDeIndicacao(mensagem: string): string {
  return `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
}
