import type { Dia } from "@/lib/agenda/calendario";
import { agoraEmSaoPaulo } from "@/lib/crm/retornoPeloGrupo/ler";
import { chamarLlmJson } from "@/lib/whatsapp/llm";
import { escreverEmSaoPaulo, lerInstante, meioDiaEmSaoPaulo, partesEmSaoPaulo } from "./instante";
import { NAO_ENTENDI, type PedidoDoCorretor } from "./tipos";

/*
 * O corretor está esperando a resposta no WhatsApp: 12s cabe uma retentativa
 * rápida sem deixá-lo olhando para a tela.
 */
const ORCAMENTO_PEDIDO_MS = 12_000;
const TETO_DA_MENSAGEM = 1000;

const TETO_DO_NOME = 120;
const TETO_DO_TEXTO = 300;
const TETO_DO_MOTIVO = 200;
const TETO_DO_TITULO = 120;
const TETO_DE_PARTICIPANTES = 20;

const DURACAO_PADRAO_MS = 60 * 60_000;

/*
 * O AGORA vai ao modelo em minutos: "agora até as 16h" volta com o minuto
 * atual e segundos zerados, que já são passado quando a resposta chega.
 */
const TOLERANCIA_DO_PASSADO_MS = 5 * 60_000;

/** Ano errado do modelo ("2027" no lugar de "2026") não vira compromisso. */
const LIMITE_DO_FUTURO_MS = 366 * 24 * 3600_000;

const TITULO_PADRAO_DA_REUNIAO = "Reunião";

const PROMPT_BASE = `Você lê a mensagem que um CORRETOR DE IMÓVEIS mandou ao sistema para mexer na PRÓPRIA agenda dele. Quem escreve é o corretor; "cliente" é a pessoa que ele atende.

REGRAS:
- Não invente nada que não esteja na mensagem. Na dúvida, "tipo": "nao_entendi".
- Datas relativas ("sábado", "amanhã", "quinta") se resolvem a partir de AGORA, sempre para a PRÓXIMA ocorrência: nunca hoje se o horário já passou. O fuso é o de São Paulo (-03:00).
- Todo horário vai em ISO 8601 COM o offset -03:00, ex. de formato: "2026-11-07T10:00:00-03:00". Sem dia E hora claros, não há compromisso: "nao_entendi" (a consulta só precisa do dia).
- "agora" ou "já" como início é o minuto de AGORA.
- Nomes (cliente, imóvel, participantes) vão como o corretor escreveu, sem completar sobrenome.

TIPOS:
- "marcar_visita": visita com um cliente. Precisa de "cliente" e "quando"; "imovel" se ele citar (ex.: "no Alpha" → "Alpha").
- "bloquear": horário em que o corretor não pode atender (médico, compromisso pessoal, folga). Precisa de "inicio"; "fim" se ele disser; "motivo" em poucas palavras, se disser.
- "lembrete": o corretor pede para ser lembrado de algo ("me lembra de..."). Precisa de "texto" (o que fazer, ex.: "ligar pro João") e "quando"; "cliente" se o lembrete for sobre um cliente.
- "consultar": o corretor quer saber o que tem num dia ("o que eu tenho amanhã?"). Precisa de "dia" no formato "YYYY-MM-DD".`;

const PROMPT_REUNIAO = `- "reuniao": QUEM ESCREVE É O GESTOR da equipe e quer marcar reunião. Precisa de "inicio"; "fim" se ele disser; "participantes": "equipe" quando for a equipe toda, ou a lista dos nomes citados; "titulo": o assunto em poucas palavras ("sobre metas" → "metas"), ou null.`;

const PROMPT_NAO_ENTENDI = `- "nao_entendi": qualquer outra coisa (cumprimento, pergunta solta, pedido que não é de agenda, falta de dia ou hora).`;

const EXEMPLOS_DO_CORRETOR = [
  `"visita com a Ana sábado 10h no Alpha" → {"tipo": "marcar_visita", "cliente": "Ana", "quando": "<sábado>T10:00:00-03:00", "imovel": "Alpha"}`,
  `"amanhã das 14h às 16h estou no médico" → {"tipo": "bloquear", "inicio": "<amanhã>T14:00:00-03:00", "fim": "<amanhã>T16:00:00-03:00", "motivo": "médico"}`,
  `"me lembra de ligar pro João quinta 9h" → {"tipo": "lembrete", "cliente": "João", "texto": "ligar pro João", "quando": "<quinta>T09:00:00-03:00"}`,
  `"o que eu tenho amanhã?" → {"tipo": "consultar", "dia": "<amanhã>"}`,
];

const EXEMPLOS_DO_GESTOR = [
  `"reunião com a equipe toda segunda 9h" → {"tipo": "reuniao", "titulo": null, "inicio": "<segunda>T09:00:00-03:00", "fim": null, "participantes": "equipe"}`,
  `"reunião com Bruno e Carla sexta 15h às 16h sobre metas" → {"tipo": "reuniao", "titulo": "metas", "inicio": "<sexta>T15:00:00-03:00", "fim": "<sexta>T16:00:00-03:00", "participantes": ["Bruno", "Carla"]}`,
];

function formatoDaResposta(ehGestor: boolean): string {
  const tipos = ['"marcar_visita"', '"bloquear"', '"lembrete"', '"consultar"', ...(ehGestor ? ['"reuniao"'] : []), '"nao_entendi"'];
  const linhas = [
    `  "tipo": ${tipos.join(" | ")},`,
    `  "cliente": string ou null,`,
    `  "quando": string ou null (ISO com -03:00),`,
    `  "imovel": string ou null,`,
    `  "inicio": string ou null (ISO com -03:00),`,
    `  "fim": string ou null (ISO com -03:00),`,
    `  "motivo": string ou null,`,
    `  "texto": string ou null,`,
    `  "dia": string ou null ("YYYY-MM-DD")`,
  ];
  if (ehGestor) {
    linhas[linhas.length - 1] += ",";
    linhas.push(`  "titulo": string ou null,`, `  "participantes": "equipe" | ["nomes citados"] | null`);
  }
  return `Responda EXCLUSIVAMENTE um objeto JSON válido, sem texto antes ou depois, neste formato (campo que não se aplica ao tipo vai null):\n{\n${linhas.join("\n")}\n}`;
}

/** O prompt inteiro: regras, tipos, exemplos, AGORA em São Paulo e a mensagem. */
export function montarPromptDoPedido(texto: string, agora: Date, ehGestor: boolean): string {
  const tipos = [PROMPT_BASE, ...(ehGestor ? [PROMPT_REUNIAO] : []), PROMPT_NAO_ENTENDI].join("\n");
  const exemplos = [...EXEMPLOS_DO_CORRETOR, ...(ehGestor ? EXEMPLOS_DO_GESTOR : [])];
  return [
    tipos,
    "",
    "EXEMPLOS (<sábado>, <amanhã> etc. são a data resolvida a partir de AGORA):",
    ...exemplos.map((e) => `- ${e}`),
    "",
    formatoDaResposta(ehGestor),
    "",
    `--- AGORA (fuso de São Paulo) ---\n${agoraEmSaoPaulo(agora)}`,
    "",
    `--- MENSAGEM DO ${ehGestor ? "GESTOR" : "CORRETOR"} ---\n${texto.trim().slice(0, TETO_DA_MENSAGEM)}`,
  ].join("\n");
}

function texto(valor: unknown, teto: number): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim().slice(0, teto) : null;
}

/** Sem nada escrito: o modelo não disse. Diferente de escrito errado. */
function ausente(valor: unknown): boolean {
  return valor === undefined || valor === null || (typeof valor === "string" && !valor.trim());
}

/** Instante com fuso, de agora em diante e a menos de um ano. */
function instanteFuturo(valor: unknown, agora: Date): Date | null {
  const data = lerInstante(valor);
  if (!data) return null;
  const t = data.getTime();
  if (t < agora.getTime() - TOLERANCIA_DO_PASSADO_MS) return null;
  if (t > agora.getTime() + LIMITE_DO_FUTURO_MS) return null;
  return data;
}

/** Início e fim; fim não dito = 1 hora. Fim escrito e inválido derruba o pedido. */
function periodo(bruto: Record<string, unknown>, agora: Date): { inicio: string; fim: string } | null {
  const inicio = instanteFuturo(bruto.inicio, agora);
  if (!inicio) return null;
  const fim = ausente(bruto.fim) ? new Date(inicio.getTime() + DURACAO_PADRAO_MS) : lerInstante(bruto.fim);
  if (!fim || fim.getTime() <= inicio.getTime()) return null;
  return { inicio: escreverEmSaoPaulo(inicio), fim: escreverEmSaoPaulo(fim) };
}

/** Dia que existe de verdade: `2026-02-30` vira março no Date, e é recusado. */
function diaReal(valor: unknown): Dia | null {
  if (typeof valor !== "string") return null;
  const dia = valor.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const meioDia = meioDiaEmSaoPaulo(dia);
  if (Number.isNaN(meioDia.getTime())) return null;
  const p = partesEmSaoPaulo(meioDia);
  return `${p.ano}-${p.mes}-${p.dia}` === dia ? dia : null;
}

function participantes(valor: unknown): "equipe" | string[] | null {
  if (valor === "equipe") return "equipe";
  if (!Array.isArray(valor)) return null;
  const nomes: string[] = [];
  for (const item of valor) {
    const nome = texto(item, TETO_DO_NOME);
    if (nome && !nomes.includes(nome)) nomes.push(nome);
    if (nomes.length >= TETO_DE_PARTICIPANTES) break;
  }
  return nomes.length ? nomes : null;
}

/**
 * Transforma o JSON cru do modelo no pedido tipado.
 *
 * É a peneira entre o modelo e a agenda: horário sem fuso, no passado ou a
 * mais de um ano, fim antes do início, campo obrigatório vazio e reunião
 * pedida por quem não é gestor viram "nao_entendi" — melhor perguntar de novo
 * do que marcar na hora errada. A consulta aceita qualquer dia, passado
 * inclusive ("o que eu tive ontem?").
 */
export function normalizarPedido(json: unknown, agora: Date, ehGestor: boolean): PedidoDoCorretor {
  if (!json || typeof json !== "object" || Array.isArray(json)) return NAO_ENTENDI;
  const bruto = json as Record<string, unknown>;

  switch (bruto.tipo) {
    case "marcar_visita": {
      const cliente = texto(bruto.cliente, TETO_DO_NOME);
      const quando = instanteFuturo(bruto.quando, agora);
      if (!cliente || !quando) return NAO_ENTENDI;
      return { tipo: "marcar_visita", cliente, quando: escreverEmSaoPaulo(quando), imovel: texto(bruto.imovel, TETO_DO_NOME) };
    }
    case "bloquear": {
      const p = periodo(bruto, agora);
      if (!p) return NAO_ENTENDI;
      return { tipo: "bloquear", ...p, motivo: texto(bruto.motivo, TETO_DO_MOTIVO) };
    }
    case "lembrete": {
      const oQue = texto(bruto.texto, TETO_DO_TEXTO);
      const quando = instanteFuturo(bruto.quando, agora);
      if (!oQue || !quando) return NAO_ENTENDI;
      return { tipo: "lembrete", cliente: texto(bruto.cliente, TETO_DO_NOME), texto: oQue, quando: escreverEmSaoPaulo(quando) };
    }
    case "consultar": {
      const dia = diaReal(bruto.dia);
      return dia ? { tipo: "consultar", dia } : NAO_ENTENDI;
    }
    case "reuniao": {
      if (!ehGestor) return NAO_ENTENDI;
      const p = periodo(bruto, agora);
      const quem = participantes(bruto.participantes);
      if (!p || !quem) return NAO_ENTENDI;
      return {
        tipo: "reuniao",
        titulo: texto(bruto.titulo, TETO_DO_TITULO) ?? TITULO_PADRAO_DA_REUNIAO,
        ...p,
        participantes: quem,
      };
    }
    default:
      return NAO_ENTENDI;
  }
}

/**
 * Lê a mensagem do corretor (ou do gestor) e devolve o pedido já peneirado.
 *
 * Nunca lança: mensagem vazia, chamada que falhou, exceção ou resposta sem
 * sentido viram "nao_entendi", e quem chama responde com `textoNaoEntendi`.
 * `chamar` existe para teste; em produção é o `chamarLlmJson`.
 */
export async function interpretarPedido(
  textoDaMensagem: string,
  opcoes: { agora: Date; ehGestor: boolean; chamar?: typeof chamarLlmJson },
): Promise<PedidoDoCorretor> {
  try {
    if (!textoDaMensagem.trim()) return NAO_ENTENDI;
    const chamar = opcoes.chamar ?? chamarLlmJson;
    const resultado = await chamar(montarPromptDoPedido(textoDaMensagem, opcoes.agora, opcoes.ehGestor), {
      temperature: 0.1,
      orcamentoMs: ORCAMENTO_PEDIDO_MS,
    });
    if (!resultado.ok) {
      console.error("Erro ao interpretar o pedido de agenda:", resultado.erro);
      return NAO_ENTENDI;
    }
    return normalizarPedido(resultado.json, opcoes.agora, opcoes.ehGestor);
  } catch (erro) {
    console.error("Erro inesperado ao interpretar o pedido de agenda:", erro);
    return NAO_ENTENDI;
  }
}
