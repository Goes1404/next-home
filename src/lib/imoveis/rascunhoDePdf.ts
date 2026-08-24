import { extrairTextoDePdf } from "@/lib/leads/pdfTexto";
import { STATUS_LABEL, type StatusObra } from "@/lib/types";
import { chamarLlmJson } from "@/lib/whatsapp/llm";

/**
 * Lê o texto de uma apresentação e propõe o cadastro do imóvel.
 *
 * Tudo aqui é PROPOSTA: a tela mostra campo a campo, com o que já está
 * gravado ao lado, e só grava o que o corretor aceitar. O que a IA erra num
 * cadastro não fica no cadastro — vai para o prompt do bot e é afirmado ao
 * cliente como verdade (foi assim que um imóvel `em_construcao` virou
 * "pronto para morar" numa conversa real).
 *
 * PREÇO NÃO ENTRA. A regra de negócio proíbe a IA de falar valores, e o
 * campo é filtrado no CÓDIGO, não no prompt: instrução de prompt é
 * probabilística e falha justo na resposta que importa.
 *
 * Como o texto é extraído aqui, a chamada usa a cascata inteira
 * (Groq → Gemini → NVIDIA → OpenAI) — diferente do PDF de leads, que manda
 * o arquivo por `inlineData` e por isso só o Gemini atende.
 */

/**
 * Derivado de `STATUS_LABEL`, nunca escrito à mão: uma lista paralela sai do
 * ar na primeira vez que alguém acrescenta um status, e o sintoma seria o
 * campo simplesmente não aparecer no rascunho.
 */
const STATUS_VALIDOS = Object.keys(STATUS_LABEL) as StatusObra[];

export type TipologiaSugerida = {
  nome: string;
  dormitorios?: number;
  suites?: number;
  banheiros?: number;
  vagas?: number;
  metragem?: number;
};

export type RascunhoCadastro = {
  nome?: string;
  construtora?: string;
  cidade?: string;
  bairro?: string;
  endereco?: string;
  status?: StatusObra;
  entregaPrevista?: string;
  totalTorres?: number;
  totalAndares?: number;
  totalUnidades?: number;
  tagline?: string;
  descricao?: string;
  tipologias?: TipologiaSugerida[];
  lazer?: string[];
};

/** Texto curto demais não é apresentação: é capa escaneada ou deck chapado. */
const MINIMO_DE_TEXTO = 200;

/** Prompt inteiro cabe folgado; o resto do deck é repetição de rodapé. */
const TETO_DE_TEXTO = 12_000;

function texto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim().length > 0 ? valor.trim() : undefined;
}

function inteiro(valor: unknown): number | undefined {
  if (typeof valor !== "number" && typeof valor !== "string") return undefined;
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

/** Separada de `montarRascunhoDePdf` para ser testável sem chamar modelo. */
export function interpretarRascunho(bruto: unknown): RascunhoCadastro {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
  const cru = bruto as Record<string, unknown>;

  const status = texto(cru.status);
  const tipologias = Array.isArray(cru.tipologias)
    ? cru.tipologias
        .map((item): TipologiaSugerida | null => {
          if (!item || typeof item !== "object") return null;
          const t = item as Record<string, unknown>;
          const nome = texto(t.nome);
          if (!nome) return null;
          // Preço de tipologia é descartado aqui, junto com o resto.
          return {
            nome,
            dormitorios: inteiro(t.dormitorios),
            suites: inteiro(t.suites),
            banheiros: inteiro(t.banheiros),
            vagas: inteiro(t.vagas),
            metragem: inteiro(t.metragem),
          };
        })
        .filter((t): t is TipologiaSugerida => t !== null)
    : undefined;

  const lazer = Array.isArray(cru.lazer)
    ? cru.lazer.map(texto).filter((v): v is string => Boolean(v))
    : undefined;

  return {
    nome: texto(cru.nome),
    construtora: texto(cru.construtora),
    cidade: texto(cru.cidade),
    bairro: texto(cru.bairro),
    endereco: texto(cru.endereco),
    status: STATUS_VALIDOS.includes(status as StatusObra) ? (status as StatusObra) : undefined,
    entregaPrevista: texto(cru.entregaPrevista),
    totalTorres: inteiro(cru.totalTorres),
    totalAndares: inteiro(cru.totalAndares),
    totalUnidades: inteiro(cru.totalUnidades),
    tagline: texto(cru.tagline),
    descricao: texto(cru.descricao),
    tipologias: tipologias && tipologias.length > 0 ? tipologias : undefined,
    lazer: lazer && lazer.length > 0 ? lazer : undefined,
  };
}

function montarPrompt(conteudo: string): string {
  return `Você lê apresentações de empreendimentos imobiliários e devolve o cadastro em JSON.

Regras:
- Responda SÓ com JSON, sem cerca de código e sem comentário.
- NUNCA inclua preço, valor, condição de pagamento ou entrada. Se o texto tiver, ignore.
- Campo que o texto não deixar claro: OMITA. Não invente e não chute.
- "status" só pode ser um destes: ${STATUS_VALIDOS.join(", ")}.
- "entregaPrevista" no formato AAAA-MM.

Formato:
{"nome":"","construtora":"","cidade":"","bairro":"","endereco":"","status":"","entregaPrevista":"","totalTorres":0,"totalAndares":0,"totalUnidades":0,"tagline":"","descricao":"","tipologias":[{"nome":"","dormitorios":0,"suites":0,"banheiros":0,"vagas":0,"metragem":0}],"lazer":[""]}

Apresentação:
${conteudo}`;
}

export type ResultadoRascunho =
  | { ok: true; rascunho: RascunhoCadastro }
  | { ok: false; motivo: "sem_texto" | "ia_indisponivel" };

export async function montarRascunhoDePdf(pdf: Buffer): Promise<ResultadoRascunho> {
  const conteudo = extrairTextoDePdf(pdf);

  // Sem texto embutido o deck é imagem pura (escaneado ou feito no Canva).
  // Não vale mandar para a IA: ela receberia uma string vazia e inventaria
  // um empreendimento inteiro.
  if (!conteudo || conteudo.length < MINIMO_DE_TEXTO) return { ok: false, motivo: "sem_texto" };

  const resposta = await chamarLlmJson(montarPrompt(conteudo.slice(0, TETO_DE_TEXTO)));
  if (!resposta.ok) return { ok: false, motivo: "ia_indisponivel" };

  return { ok: true, rascunho: interpretarRascunho(resposta.json) };
}
