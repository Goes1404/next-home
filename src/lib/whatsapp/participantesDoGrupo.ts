// Quem está num grupo de WhatsApp, lido da resposta da Evolution
// (`GET /group/participants/{instance}?groupJid=`), e a comparação de números
// que reconhece o corretor dentro do grupo dele (spec 6.4).
//
// Puro: sem rede nem banco. O WhatsApp está trocando o número do participante
// por um id `@lid` em grupos; por isso cada participante carrega o id cru E o
// número quando a Evolution o entrega junto. É esse par número↔lid (e só ele)
// que autoriza guardar o `@lid` do corretor.

export type ParticipanteDoGrupo = {
  /** Id cru do participante, com o sufixo (`@lid` ou `@s.whatsapp.net`). */
  id: string;
  /** Só dígitos; `null` quando a Evolution não entregou o número. */
  numero: string | null;
  /**
   * O `@lid` da pessoa, quando conhecido: o próprio `id` se ele for `@lid`,
   * ou o campo `lid` que a Baileys manda junto de um id com número.
   */
  lid: string | null;
};

/**
 * Dígitos de um JID de pessoa (`@s.whatsapp.net` ou `@c.us`). `null` para
 * `@lid`, `@g.us`, vazio ou o que não for número. O sufixo de aparelho
 * (`5511...:12@s.whatsapp.net`) é descartado.
 */
export function numeroDoJid(jid: string | null | undefined): string | null {
  if (typeof jid !== "string") return null;
  const achou = /^(\d+)(?::\d+)?@(?:s\.whatsapp\.net|c\.us)$/.exec(jid.trim());
  return achou ? achou[1] : null;
}

/** O `@lid` só vale com o sufixo; qualquer outra coisa não é um par confiável. */
function lidDoCampo(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  return /^\d+@lid$/.test(texto) ? texto : null;
}

/** Campos em que a Evolution põe o número quando o `id` é `@lid`. */
const CAMPOS_COM_O_NUMERO = ["phoneNumber", "jid"] as const;

function numeroDoCampo(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  if (texto.includes("@")) return numeroDoJid(texto);
  return /^\d+$/.test(texto) ? texto : null;
}

/**
 * Lista de participantes a partir do corpo da resposta: `{ participants: [] }`
 * ou o array puro. Item que não for objeto com `id` no formato de JID é
 * ignorado. O número vem do próprio `id` quando ele é de pessoa; senão de
 * `phoneNumber`/`jid`; senão `null` (nunca se adivinha o número). O `lid`
 * vem do `id` (se for `@lid`) ou do campo `lid` que acompanha um id com número.
 */
export function participantesDaResposta(corpo: unknown): ParticipanteDoGrupo[] {
  const itens = Array.isArray(corpo)
    ? corpo
    : typeof corpo === "object" && corpo !== null && Array.isArray((corpo as { participants?: unknown }).participants)
      ? (corpo as { participants: unknown[] }).participants
      : [];

  return itens.flatMap((item): ParticipanteDoGrupo[] => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const dado = item as Record<string, unknown>;
    const id = typeof dado.id === "string" ? dado.id.trim() : "";
    if (!id.includes("@")) return [];

    let numero = numeroDoJid(id);
    if (numero === null) {
      for (const campo of CAMPOS_COM_O_NUMERO) {
        numero = numeroDoCampo(dado[campo]);
        if (numero !== null) break;
      }
    }
    const lid = lidDoCampo(id) ?? lidDoCampo(dado.lid);
    return [{ id, numero, lid }];
  });
}

/**
 * Número brasileiro sem o 55 do país. Só tira o 55 quando sobram 10 ou 11
 * dígitos (DDD 55 existe: `55991234567` é um celular do Rio Grande do Sul).
 */
function semPais(digitos: string): string {
  return digitos.startsWith("55") && digitos.length >= 12 ? digitos.slice(2) : digitos;
}

/**
 * Formas equivalentes do mesmo número (DDD + assinante), com e sem o 9 do
 * celular. O 9 só é inserido quando o assinante começa em 6-9: fixo
 * (começa em 2-5) nunca é confundido com celular.
 */
function formasDoNumero(nacional: string): string[] {
  const formas = new Set([nacional]);
  if (nacional.length === 10 && /[6-9]/.test(nacional[2])) {
    formas.add(`${nacional.slice(0, 2)}9${nacional.slice(2)}`);
  }
  if (nacional.length === 11 && nacional[2] === "9" && /[6-9]/.test(nacional[3])) {
    formas.add(`${nacional.slice(0, 2)}${nacional.slice(3)}`);
  }
  return [...formas];
}

/**
 * Se os dois textos são o mesmo telefone: só dígitos, com e sem o 55, com e
 * sem o 9 do celular. Vazio nunca casa.
 */
export function mesmoNumero(a: string, b: string): boolean {
  const da = semPais(a.replace(/\D/g, ""));
  const db = semPais(b.replace(/\D/g, ""));
  if (!da || !db) return false;
  const formasDeB = new Set(formasDoNumero(db));
  return formasDoNumero(da).some((forma) => formasDeB.has(forma));
}
