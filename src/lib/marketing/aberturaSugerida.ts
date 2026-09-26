import { contemValor } from "@/lib/whatsapp/semValores";

/**
 * Duas aberturas de campanha sugeridas pela IA, para o teste A/B (26/09/2026).
 *
 * O número que motiva: 88 disparos entregues, 1 resposta (31/08). Quem decide
 * se alguém responde é a primeira mensagem, e o corretor escrevia do zero. O
 * placar do A/B já existe (`testeAB.ts`); faltava ter DUAS boas para comparar.
 *
 * O que a IA recebe é a régua MEDIDA da casa, não "escreva uma mensagem
 * persuasiva": a corretora que fecha negócio escreve ~47 caracteres por
 * mensagem, uma ideia por vez, e termina com pergunta concreta. E as duas
 * versões precisam ser DIFERENTES de verdade (ângulos distintos), senão o
 * teste compara duas vezes a mesma coisa.
 *
 * A validação vale depois da IA, por código: sem valor (a regra comercial
 * "a IA não fala valores" vale também aqui), curta, com `{nome}` e
 * terminando em pergunta. Sugestão reprovada não chega à tela.
 */

export const TETO_ABERTURA = 220;

/** Quantas vencedoras do próprio corretor entram como exemplo. */
export const EXEMPLOS_VENCEDORES = 3;

export function promptDeAberturas(
  p: {
    imovel: string;
    bairro?: string | null;
    cidade?: string | null;
    estagio?: string | null;
    publico: string;
  },
  /**
   * Aberturas que JÁ VENCERAM um A/B deste corretor (0121). É o dado mais
   * forte que existe sobre o que a carteira dele responde — mais que a
   * régua geral. Entram como tom a seguir, não como texto a copiar: a
   * versão nova precisa ser do imóvel de agora.
   */
  vencedoras: string[] = [],
): string {
  const onde = [p.bairro, p.cidade].filter(Boolean).join(", ");
  const exemplos = vencedoras
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, EXEMPLOS_VENCEDORES);
  return [
    "Você escreve a PRIMEIRA mensagem de WhatsApp de uma corretora de imóveis para um lead da carteira dela.",
    `Imóvel: ${p.imovel}${onde ? ` (${onde})` : ""}${p.estagio ? `, ${p.estagio}` : ""}.`,
    `Quem vai receber: ${p.publico}.`,
    "",
    "Regras (medidas em conversas reais que viraram visita):",
    "- no máximo 2 frases curtas, até 180 caracteres no total;",
    "- comece pelo nome usando exatamente {nome};",
    "- UMA ideia só, e termine com UMA pergunta fácil de responder (sim/não ou escolha);",
    "- sem valor, preço, parcela, desconto ou condição de pagamento;",
    "- sem urgência falsa (\"últimas horas\", \"imperdível\"), sem emoji em excesso, sem markdown;",
    "- tom de gente, não de anúncio.",
    "",
    ...(exemplos.length > 0
      ? [
          "Aberturas desta corretora que VENCERAM testes anteriores (siga o tom e o tamanho; não copie o texto):",
          ...exemplos.map((e) => `- ${e}`),
          "",
        ]
      : []),
    "Escreva DUAS versões com ângulos DIFERENTES (ex.: uma pergunta sobre o momento dele, outra oferecendo algo concreto como fotos ou visita ao decorado).",
    'Responda só JSON: {"a": "...", "b": "..."}',
  ].join("\n");
}

/** O motivo de recusar uma sugestão, ou `null` se ela serve. */
export function problemaDaAbertura(texto: string): string | null {
  const t = texto.trim();
  if (!t) return "vazia";
  if (t.length > TETO_ABERTURA) return "longa demais";
  if (!t.includes("{nome}")) return "sem o nome";
  if (!/\?\s*[\p{Emoji_Presentation}\p{Extended_Pictographic}]*\s*$/u.test(t)) return "não termina em pergunta";
  if (contemValor(t)) return "fala valor";
  if (/\*\*|^#|^- /m.test(t)) return "markdown";
  return null;
}

export function aberturasDoJson(json: unknown): { a: string; b: string } | null {
  if (!json || typeof json !== "object") return null;
  const { a, b } = json as Record<string, unknown>;
  if (typeof a !== "string" || typeof b !== "string") return null;
  const limpaA = a.trim();
  const limpaB = b.trim();
  if (problemaDaAbertura(limpaA) || problemaDaAbertura(limpaB)) return null;
  if (limpaA.toLowerCase() === limpaB.toLowerCase()) return null;
  return { a: limpaA, b: limpaB };
}
