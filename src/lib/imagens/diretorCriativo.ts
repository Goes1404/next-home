import "server-only";

import { chamarLlmJson } from "@/lib/whatsapp/llm";
import {
  copyDeReserva,
  problemasDaCopy,
  type Briefing,
  type Copy,
} from "./marketing";

/**
 * O diretor de criação — a IA com rubrica, não a IA solta.
 *
 * O `melhorarPedido` reescrevia "sala moderna" em parágrafo bonito. Bonito e
 * GENÉRICO, porque não sabia de que imóvel se tratava, para quem, nem onde a
 * peça ia ser vista. Aqui a IA recebe o briefing já decidido pelo código
 * (`montarBriefing`) e faz só o que exige linguagem: escrever a cena com
 * detalhe concreto e escrever a copy — título, apoio, chamada.
 *
 * ## O que ela NÃO decide
 *
 * - O assunto-herói, a luz e a composição: vêm do objetivo, do público e do
 *   canal, por código.
 * - Os fatos: só o que está na ficha entra. Lazer fora do cadastro, prazo não
 *   cadastrado e valor são barrados DEPOIS, por `problemasDaCopy` — e a copy
 *   inteira cai para a reserva montada da ficha. Confiar que a instrução
 *   segurou é o erro que esta base já pagou dez vezes.
 * - A chamada: escolhe entre as permitidas do objetivo. Fora da lista, entra
 *   a primeira.
 *
 * ## Falha é degradação
 *
 * Sem motor ou com JSON torto, a cena determinística do briefing e a copy de
 * reserva seguem em frente. A peça sai sempre; o que a IA acrescenta é
 * detalhe e voz.
 */

const ORCAMENTO_MS = 14_000;

export type Direcao = {
  /** O prompt de cena que vai para a geração (antes da cláusula anti-texto). */
  cena: string;
  copy: Copy;
  /** De onde saiu cada parte — a tela diz isso em uma linha. */
  /** "mista" = a IA acertou parte da copy e a reserva cobriu o resto. */
  origem: { cena: "ia" | "briefing"; copy: "ia" | "mista" | "reserva" };
  /** Por que a copy da IA foi recusada, quando foi. Vazio se aceita. */
  problemasDaIa: string[];
};

function promptDoDiretor(b: Briefing): string {
  const f = b.fatos;
  const fatos = [
    f.nome && `Empreendimento: ${f.nome}`,
    f.tipo && `Tipo: ${f.tipo}`,
    f.estagio && `Estágio da obra: ${f.estagio}`,
    f.bairro && f.cidade && `Localização: ${f.bairro}, ${f.cidade}`,
    f.construtora && `Construtora: ${f.construtora}`,
    f.tipologias && `Tipologias: ${f.tipologias}`,
    f.lazer.length > 0 && `Lazer cadastrado: ${f.lazer.join(", ")}`,
    f.entregaPrevista && `Entrega prevista (cadastrada): ${f.entregaPrevista}`,
    f.tagline && `Tagline do cadastro: "${f.tagline}"`,
  ]
    .filter(Boolean)
    .join("\n");

  return `Você é diretor de criação de uma imobiliária de lançamentos em Barueri e
Alphaville. Vai produzir UMA peça de ${b.canal.rotulo} com o objetivo
"${b.objetivo.rotulo}", falando com o público "${b.publico.rotulo}".

## O que é FATO (única fonte permitida para a copy)
${fatos || "Nenhum imóvel escolhido: a peça é institucional, sem nome de empreendimento."}

## A cena já decidida (não mude o assunto, a luz nem a composição)
${b.cena}

## Sua tarefa
1. "cena": reescreva a cena acima como UM parágrafo de 300 a 600 caracteres,
   em português, com detalhe concreto: materiais, cores, o que está em primeiro
   e segundo plano, de onde vem a luz. Mantenha tudo que a cena decidiu.
   Não acrescente lazer, vista ou elemento que não esteja nos fatos.
2. "titulo": até ${38} caracteres. Uma ideia só. Tom: ${b.publico.tom}.
   Pode usar o nome do empreendimento.
3. "apoio": até ${72} caracteres. Um fato da ficha ou a promessa de estilo de
   vida — nunca os dois.
4. "cta": escolha EXATAMENTE uma destas: ${b.objetivo.ctas.map((c) => `"${c}"`).join(", ")}.

## O que NUNCA entra na copy (é lei de publicidade imobiliária, não estilo)
- Valor, parcela, entrada, financiamento, desconto.
- Promessa de valorização, rentabilidade, retorno ou garantia.
- Prazo de entrega que não esteja nos fatos acima.
- "O melhor", "o único", "imperdível" — superlativo sem prova.
- Lazer ou característica que não esteja nos fatos.

Responda apenas com JSON: {"cena": "...", "titulo": "...", "apoio": "...", "cta": "..."}`;
}

export async function dirigir(briefing: Briefing): Promise<Direcao> {
  const reserva: Direcao = {
    cena: `${briefing.cena} ${restricoesDuras(briefing)}`,
    copy: copyDeReserva(briefing),
    origem: { cena: "briefing", copy: "reserva" },
    problemasDaIa: [],
  };

  const r = await chamarLlmJson(promptDoDiretor(briefing), {
    temperature: 0.6,
    orcamentoMs: ORCAMENTO_MS,
  });
  if (!r.ok || !r.json || typeof r.json !== "object") return reserva;

  const j = r.json as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

  // A cena da IA só vale se for uma cena de verdade. Curta demais é o modelo
  // devolvendo o pedido de volta; longa demais dilui o assunto.
  const cenaIa = texto(j.cena);
  const cena =
    cenaIa.length >= 120 && cenaIa.length <= 1200
      ? `${cenaIa} ${restricoesDuras(briefing)}`
      : reserva.cena;

  const ctaPedido = texto(j.cta);
  const cta = briefing.objetivo.ctas.includes(ctaPedido) ? ctaPedido : briefing.objetivo.ctas[0];
  const copyIa: Copy = { titulo: texto(j.titulo), apoio: texto(j.apoio), cta };
  const problemas = problemasDaCopy(copyIa);

  // Reserva POR CAMPO. Na primeira medição a IA escreveu um título de 40
  // caracteres e a copy INTEIRA caiu para a ficha — jogando fora um apoio
  // que estava certo. Cada problema de `problemasDaCopy` nomeia o campo, e
  // é só aquele campo que volta para a reserva.
  const tituloRuim = problemas.some((p) => p.startsWith("título"));
  const apoioRuim = problemas.some((p) => p.startsWith("apoio"));
  const copy: Copy = {
    titulo: tituloRuim ? reserva.copy.titulo : copyIa.titulo,
    apoio: apoioRuim ? reserva.copy.apoio : copyIa.apoio,
    cta,
  };
  const origemCopy = !tituloRuim && !apoioRuim ? "ia" : tituloRuim && apoioRuim ? "reserva" : "mista";

  return {
    cena,
    copy,
    origem: { cena: cena === reserva.cena ? "briefing" : "ia", copy: origemCopy },
    problemasDaIa: problemas,
  };
}

/**
 * O rabo determinístico do prompt de imagem: as restrições que a cena da IA
 * pode ter esquecido. Vai DEPOIS da cena, onde o modelo de imagem lê como
 * ajuste — e vai sempre, porque instrução é probabilística.
 */
export function restricoesDuras(b: Briefing): string {
  const partes: string[] = [];
  if (b.fatos.lazer.length > 0) {
    partes.push(`Áreas comuns permitidas na cena: apenas ${b.fatos.lazer.join(", ")}.`);
  } else if (b.fatos.nome) {
    partes.push("Sem área comum na cena: não há lazer cadastrado.");
  }
  if (b.fatos.estagio && b.fatos.estagio !== "Pronto para morar") {
    partes.push("Perspectiva ilustrativa de obra não entregue.");
  }
  partes.push("Sem pessoas com rosto reconhecível.");
  return partes.join(" ");
}
