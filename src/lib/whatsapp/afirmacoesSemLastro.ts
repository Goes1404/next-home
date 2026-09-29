/**
 * Frases que a IA afirma sem ter base, cortadas antes de o cliente ler.
 *
 * Mesma família de `prazoEntrega.ts` e do acabamento inventado: o prompt já
 * pede para não dizer, e prompt é probabilístico. As duas saíram no eval de
 * conversa de 28/09/2026.
 *
 * 1. **Visita "confirmada" que ninguém confirmou.** Persona `investidor`,
 *    turno 5: "A visita está confirmada para quinta-feira às 15h no stand",
 *    numa conversa em que o cliente nunca aceitou horário. O campo
 *    estruturado `visitaProposta.confirmadaPeloCliente` dizia que não havia
 *    visita; só o texto dizia que havia. O cliente aparece no stand, e
 *    ninguém sabe que ele vem. Quem decide é o campo: texto que confirma sem
 *    o campo confirmar perde a frase.
 *
 * 2. **Promessa de valorização.** "Fica em Vila do Conde, uma região com
 *    ótima valorização", quatro vezes na mesma conversa. Valorização é
 *    promessa de retorno financeiro que ninguém aqui pode garantir (a mesma
 *    regra que `problemasDaCopy` aplica às artes de marketing). Localização,
 *    lazer e o que está na ficha continuam livres.
 *
 * Módulo puro: sem rede, sem banco, testável.
 */

function frases(texto: string): string[] {
  // O "---" é o marcador de balão da IA: sem ele no corte, uma resposta
  // inteira sem ponto final virava UMA frase, e a confirmação falsa passava
  // (v41, `decide-com-a-esposa`, turno 5).
  return texto.split(/(?<=[.!?])\s+|\n+|\s*---\s*/).filter((f) => f.trim().length > 0);
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const CONFIRMA_VISITA =
  /\b(visita (esta |ta |fica |ficou )?(confirmada|agendada|marcada|reservada)|(esta|ta|fica|ficou) (confirmad|reservad|agendad|marcad)[oa] (para|pra)|combinado (para|pra) )/;

const VALORIZACAO = /\bvaloriza(cao|r|ndo|do|da|ra)?\b/;

/** Corta as frases, mas nunca deixa a resposta vazia. */
function cortar(texto: string, deve: (fraseNormalizada: string) => boolean): { texto: string; cortou: boolean } {
  const todas = frases(texto);
  const ficam = todas.filter((f) => !deve(normalizar(f)));
  if (ficam.length === todas.length || ficam.length === 0) return { texto, cortou: false };
  return { texto: ficam.join("\n\n"), cortou: true };
}

export function removerConfirmacaoSemAceite(
  texto: string,
  confirmadaPeloCliente: boolean,
): { texto: string; cortou: boolean } {
  if (confirmadaPeloCliente) return { texto, cortou: false };
  return cortar(texto, (f) => CONFIRMA_VISITA.test(f));
}

export function removerPromessaDeValorizacao(texto: string): { texto: string; cortou: boolean } {
  return cortar(texto, (f) => VALORIZACAO.test(f));
}

const ANUNCIA_ANEXO =
  /\b(te mandei|mandei|te enviei|enviei|segue|seguem|aqui embaixo|ai embaixo|abaixo)\b.{0,40}\b(foto|fotos|planta|plantas|imagem|imagens|video)\b|\b(foto|fotos|planta|plantas)\b.{0,20}\b(aqui embaixo|abaixo|seguem)\b/;

/**
 * "Te mandei as fotos aqui embaixo" quando nenhum anexo vai sair.
 *
 * v43, 29/09/2026 (`familia-tres-dorm`): a trava da qualificação tirou as
 * fotos da resposta, e o texto continuou dizendo que elas estavam lá. O
 * cliente procura o anexo, não acha, e pede de novo. Quem chama só usa isto
 * quando sabe que a resposta sai SEM anexo.
 */
export function removerAnuncioDeAnexo(texto: string): { texto: string; cortou: boolean } {
  return cortar(texto, (f) => ANUNCIA_ANEXO.test(f));
}
