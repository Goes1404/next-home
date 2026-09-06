import "server-only";

import { CANAIS, OBJETIVOS, type ChaveCanal, type ChaveObjetivo } from "@/lib/imagens/marketing";
import { RECEITAS, receitaPor } from "@/lib/imagens/receitas";
import { TAMANHOS, type ChaveTamanho } from "@/lib/imagens/imagensTipos";
import {
  MAX_PERGUNTAS,
  montarPromptFinal,
  perguntarOQueFalta,
  type Resposta,
} from "@/lib/imagens/engenheiroDePrompt";
import { chamarLlmJson } from "@/lib/whatsapp/llm";
import { soarHumano } from "@/lib/whatsapp/vozHumana";
import type { Empreendimento } from "@/lib/types";
import { verRoteiro, type PedidoDeVideo } from "@/app/corretor/(painel)/marketing/video/acoes";
import {
  ehConfirmacao,
  type MensagemDoEstudio,
  type PerguntaDoEstudio,
  type PropostaDeArte,
  type PropostaDeVideo,
} from "./contrato";

/**
 * O turno do Estúdio: o corretor falou; o que a IA responde?
 *
 * ## O que este módulo É
 *
 * A casca de chat sobre o motor que já existe. Ele decide entre PERGUNTAR uma
 * coisa e PROPOR uma peça — e nunca gera. Gerar é `confirmarProposta`, em
 * `acoes.ts`, o único lugar que dispara gasto.
 *
 * ## O pré-treinamento mora no código, não num prompt gigante
 *
 * O que diferencia isto de um chat genérico não é uma instrução longa: é o
 * que o código já sabe e injeta — o catálogo REAL do corretor (para reconhecer
 * "o Eternity" e nunca inventar imóvel), as receitas (`receitas.ts`), a régua
 * de marketing (`marketing.ts`), a cláusula anti-invenção (que continua em
 * `gerarImagem.ts`, fora daqui) e a régua de lei na copy (`problemasDaCopy`,
 * aplicada por `verRoteiro`).
 *
 * ## Arte reusa o engenheiro de prompt que estava pronto e desligado
 *
 * `engenheiroDePrompt.ts` (perguntas com alternativas → prompt final com
 * explicação em português) existia sem nenhum importador. O chat é o primeiro
 * a ligá-lo. A adaptação é de RITMO: ele devolve até três perguntas de uma
 * vez; aqui sai UMA por turno — três perguntas de uma vez é formulário
 * disfarçado de chat.
 *
 * ## Vídeo não precisa de LLM para o roteiro
 *
 * O roteiro é determinístico (`montarRoteiro`, via `verRoteiro`). A IA só
 * entra para ENTENDER o pedido — qual imóvel, qual objetivo, qual canal — a
 * partir de texto livre. Quando entende, a proposta é o roteiro de verdade,
 * o mesmo que a tela antiga mostrava.
 */

export type RespostaDoTurno =
  | { tipo: "pergunta"; texto: string; pergunta: PerguntaDoEstudio }
  | { tipo: "proposta"; texto: string; proposta: PropostaDeArte | PropostaDeVideo }
  | { tipo: "texto"; texto: string };

const ORCAMENTO_ENTENDER_MS = 12_000;

/* ───────────────────────────── ARTE ───────────────────────────── */

/** O que o corretor já disse, sem as escolhas de chip (elas vão em `respostas`). */
function ideiaAcumulada(historico: MensagemDoEstudio[]): string {
  return historico
    .filter((m) => m.papel === "corretor" && m.dados?.tipo !== "escolha" && !ehConfirmacao(m.conteudo))
    .map((m) => m.conteudo.trim())
    .filter(Boolean)
    .join(". ");
}

function respostasDadas(historico: MensagemDoEstudio[]): Resposta[] {
  return historico
    .filter((m) => m.papel === "corretor" && m.dados?.tipo === "escolha")
    .map((m) => {
      const e = m.dados as { pergunta: string; escolha: string };
      return { pergunta: e.pergunta, escolha: e.escolha };
    });
}

function perguntasJaFeitas(historico: MensagemDoEstudio[]): string[] {
  return historico
    .filter((m) => m.papel === "ia" && m.dados?.tipo === "pergunta")
    .map((m) => (m.dados as PerguntaDoEstudio).texto);
}

/** Formato a partir do que o corretor escreveu; story → retrato, capa → paisagem. */
function tamanhoDoTexto(ideia: string): ChaveTamanho {
  const t = ideia.toLowerCase();
  if (/\b(story|stories|reels?|vertical|retrato)\b/.test(t)) return "retrato";
  if (/\b(capa|banner|paisagem|horizontal|site)\b/.test(t)) return "paisagem";
  return "quadrado";
}

function receitaDoTexto(ideia: string): string {
  const t = ideia.toLowerCase();
  for (const r of RECEITAS) {
    // Receita que exige foto não pode ser inferida do texto: sem foto ela barra.
    if (r.precisaFoto) continue;
    if (t.includes(r.rotulo.toLowerCase().split(" ")[0])) return r.chave;
  }
  return "livre";
}

export async function turnoDeArte(params: {
  historico: MensagemDoEstudio[];
  mensagem: string;
}): Promise<RespostaDoTurno> {
  const historicoCompleto = params.historico;
  const ideia = ideiaAcumulada(historicoCompleto) || params.mensagem.trim();
  const respostas = respostasDadas(historicoCompleto);
  const feitas = perguntasJaFeitas(historicoCompleto);
  const jaPropos = historicoCompleto.some((m) => m.papel === "ia" && m.dados?.tipo === "proposta");

  if (!ideia) {
    return {
      tipo: "texto",
      texto: "Me conta o que você quer criar. Pode ser simples: \"fachada do Eternity ao pôr do sol para o feed\".",
    };
  }

  /*
   * Quando perguntar e quando propor.
   *
   * Pergunta enquanto: ainda cabe pergunta (teto do engenheiro), a IA achou
   * algo ambíguo, e o corretor não pediu para ir direto. "Ok" ou uma
   * proposta já feita significam que ele quer ver o resultado, não outra
   * pergunta — repetir pergunta depois de "ok" é a métrica "o cliente teve de
   * repetir" que o WhatsApp já ensinou a evitar.
   */
  const pediuParaIr = ehConfirmacao(params.mensagem);
  const podePerguntar = feitas.length < MAX_PERGUNTAS && !pediuParaIr && !jaPropos;

  if (podePerguntar) {
    const tamanho = tamanhoDoTexto(ideia);
    const perguntas = await perguntarOQueFalta({
      ideia,
      objetivo: "peça de marketing de um imóvel",
      formato: TAMANHOS.find((t) => t.chave === tamanho)?.rotulo ?? tamanho,
      temReferencia: false,
    });
    const proxima = perguntas.find((p) => !feitas.includes(p.texto));
    if (proxima) {
      const pergunta: PerguntaDoEstudio = {
        tipo: "pergunta",
        id: `p${feitas.length}`,
        texto: proxima.texto,
        alternativas: proxima.alternativas,
      };
      return { tipo: "pergunta", texto: soarHumano(pergunta.texto), pergunta };
    }
  }

  // Ajuste em texto depois de uma proposta ("mais claro", "tira a piscina")
  // já entrou na ideia acumulada: a proposta abaixo nasce com ele.
  const tamanho = tamanhoDoTexto(ideia);
  const receita = receitaDoTexto(ideia);
  const pronto = await montarPromptFinal({
    ideia,
    respostas,
    receita,
    formato: TAMANHOS.find((t) => t.chave === tamanho)?.rotulo ?? tamanho,
  });

  const proposta: PropostaDeArte = {
    tipo: "proposta",
    modo: "arte",
    promptEn: pronto.promptEn,
    explicacaoPt: pronto.explicacaoPt,
    receita: receitaPor(receita).chave,
    tamanho,
    qualidade: "low",
    daIa: pronto.daIa,
  };

  const texto = pronto.daIa
    ? soarHumano(
        `Montei assim: ${pronto.explicacaoPt} Se estiver bom, toca em "Gerar assim". Se quiser mudar algo, me escreve.`,
      )
    : "Não consegui melhorar o pedido agora, mas dá para gerar com o que você escreveu — a receita técnica continua valendo por baixo. Quer seguir assim?";

  return { tipo: "proposta", texto, proposta };
}

/* ───────────────────────────── VÍDEO ───────────────────────────── */

type Entendido = { slug: string | null; objetivo: ChaveObjetivo | null; canal: ChaveCanal | null };

function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Casamento por nome ou apelido, sem LLM — o caminho barato e o de reserva. */
function imovelPorTexto(texto: string, imoveis: Empreendimento[]): Empreendimento | null {
  const t = normalizar(texto);
  const candidatos = imoveis.filter((i) => {
    const nomes = [i.nome, ...((i as { nomes_alternativos?: string[] | null }).nomes_alternativos ?? [])];
    return nomes.some((n) => n && n.length >= 4 && t.includes(normalizar(n)));
  });
  // Ambíguo não decide: dois imóveis casando é pergunta, não escolha.
  return candidatos.length === 1 ? candidatos[0] : null;
}

function objetivoPorTexto(texto: string): ChaveObjetivo | null {
  const t = normalizar(texto);
  const achado = OBJETIVOS.find((o) => t.includes(normalizar(o.rotulo)));
  if (achado) return achado.chave;
  if (/\b(lancamento|lançamento|lanca)\b/.test(t)) return "lancamento";
  if (/\bdecorado\b/.test(t)) return "decorado";
  if (/\b(ultimas|últimas)\b/.test(t)) return "ultimas_unidades";
  if (/\bpronto\b/.test(t)) return "pronto_para_morar";
  if (/\b(investi|renda|investidor)/.test(t)) return "investimento";
  if (/\b(bairro|regiao|região|vizinhan)/.test(t)) return "vida_no_bairro";
  return null;
}

function canalPorTexto(texto: string): ChaveCanal | null {
  const t = normalizar(texto);
  if (/\b(story|stories|reels?)\b/.test(t)) return "story";
  if (/\bfeed\b|\bpost\b/.test(t)) return "feed";
  if (/\b(anuncio|anúncio|ads?)\b/.test(t)) return "anuncio";
  if (/\bwhats|zap\b/.test(t)) return "whatsapp";
  return null;
}

/**
 * Entender o pedido com a IA, com o catálogo REAL na frente dela.
 *
 * O casamento por texto (acima) é a reserva e o desempate; a IA existe para
 * "o prédio novo da Aldeia" e "aquele de 3 quartos pronto" — o que regex não
 * alcança. Ela só pode escolher entre os slugs listados: alucinação vira
 * impossível por construção, a mesma regra do `resolverMidia`.
 */
async function entenderPedidoDeVideo(texto: string, imoveis: Empreendimento[]): Promise<Entendido> {
  const reserva: Entendido = {
    slug: imovelPorTexto(texto, imoveis)?.slug ?? null,
    objetivo: objetivoPorTexto(texto),
    canal: canalPorTexto(texto),
  };
  if (reserva.slug && reserva.objetivo && reserva.canal) return reserva;

  const lista = imoveis
    .map((i) => {
      const apelidos = (i as { nomes_alternativos?: string[] | null }).nomes_alternativos ?? [];
      return `- ${i.slug}: ${i.nome}${apelidos.length ? ` (também: ${apelidos.join(", ")})` : ""} — ${i.bairro}`;
    })
    .join("\n");

  const prompt = `Você organiza pedidos de vídeo para uma imobiliária. Um corretor escreveu:
"${texto}"

Imóveis que existem (só estes; slug à esquerda):
${lista}

Objetivos possíveis: ${OBJETIVOS.map((o) => `${o.chave} (${o.rotulo})`).join(", ")}
Canais possíveis: ${CANAIS.map((c) => `${c.chave} (${c.rotulo})`).join(", ")}

Diga o que ele quis. Se um campo não estiver claro no texto, devolva null —
NÃO chute. Responda apenas com JSON:
{"slug": "..." | null, "objetivo": "..." | null, "canal": "..." | null}`;

  const r = await chamarLlmJson(prompt, { temperature: 0, orcamentoMs: ORCAMENTO_ENTENDER_MS });
  if (!r.ok || !r.json || typeof r.json !== "object") return reserva;
  const j = r.json as Record<string, unknown>;

  const slug = typeof j.slug === "string" && imoveis.some((i) => i.slug === j.slug) ? j.slug : null;
  const objetivo =
    typeof j.objetivo === "string" && OBJETIVOS.some((o) => o.chave === j.objetivo)
      ? (j.objetivo as ChaveObjetivo)
      : null;
  const canal =
    typeof j.canal === "string" && CANAIS.some((c) => c.chave === j.canal) ? (j.canal as ChaveCanal) : null;

  return {
    slug: reserva.slug ?? slug,
    objetivo: reserva.objetivo ?? objetivo,
    canal: reserva.canal ?? canal,
  };
}

export async function turnoDeVideo(params: {
  historico: MensagemDoEstudio[];
  mensagem: string;
  imoveis: Empreendimento[];
}): Promise<RespostaDoTurno> {
  // Só imóvel com foto vira vídeo — a MESMA régua da página antiga.
  const comFoto = params.imoveis.filter((i) => i.publicado !== false && Boolean(i.capa?.url || i.galeria[0]?.url));
  if (comFoto.length === 0) {
    return {
      tipo: "texto",
      texto: "Nenhum imóvel do seu catálogo tem foto ainda — e o vídeo é feito das fotos. Cadastre as fotos em Imóveis e volta aqui.",
    };
  }

  // Tudo que o corretor disse, mais as escolhas de chip, num texto só.
  const texto = params.historico
    .filter((m) => m.papel === "corretor" && !ehConfirmacao(m.conteudo))
    .map((m) => (m.dados?.tipo === "escolha" ? (m.dados as { escolha: string }).escolha : m.conteudo))
    .concat(params.mensagem)
    .join(". ");

  const e = await entenderPedidoDeVideo(texto, comFoto);

  if (!e.slug) {
    const opcoes = comFoto.slice(0, 4).map((i) => i.nome);
    return {
      tipo: "pergunta",
      texto: "De qual imóvel é o vídeo?",
      pergunta: { tipo: "pergunta", id: "imovel", texto: "De qual imóvel é o vídeo?", alternativas: opcoes },
    };
  }
  if (!e.objetivo) {
    return {
      tipo: "pergunta",
      texto: "Qual é a ideia da peça?",
      pergunta: {
        tipo: "pergunta",
        id: "objetivo",
        texto: "Qual é a ideia da peça?",
        alternativas: OBJETIVOS.slice(0, 4).map((o) => o.rotulo),
      },
    };
  }
  if (!e.canal) {
    return {
      tipo: "pergunta",
      texto: "Onde ele vai ser publicado?",
      pergunta: {
        tipo: "pergunta",
        id: "canal",
        texto: "Onde ele vai ser publicado?",
        alternativas: CANAIS.map((c) => c.rotulo),
      },
    };
  }

  const pedido: PedidoDeVideo = { fonte: "catalogo", slug: e.slug, objetivo: e.objetivo, canal: e.canal };
  const r = await verRoteiro(pedido);
  if (!r.roteiro) {
    return { tipo: "texto", texto: r.erro ?? "Não consegui montar o roteiro agora. Tenta de novo em instantes." };
  }

  const imovel = comFoto.find((i) => i.slug === e.slug)!;
  const rot = r.roteiro;
  const proposta: PropostaDeVideo = {
    tipo: "proposta",
    modo: "video",
    slug: e.slug,
    imovelNome: imovel.nome,
    objetivo: e.objetivo,
    canal: e.canal,
    resumo: `${rot.planos.length} planos · ${Math.round(rot.duracaoS)}s · ${rot.canalRotulo} ${rot.largura}×${rot.altura}`,
    planos: rot.planos.map((p) => `${p.rotuloTipo} — ${p.ajuda}, ${p.duracao}`),
    copy: rot.copy,
    problemas: rot.problemas,
  };

  const texto2 =
    proposta.problemas.length > 0
      ? `Montei o roteiro do ${imovel.nome}, mas a legenda tem um problema: ${proposta.problemas.join("; ")}. Me diz como ajustar.`
      : `Montei o roteiro do ${imovel.nome}: ${proposta.resumo}. Confere os planos aí embaixo — se estiver bom, toca em "Gerar assim".`;

  return { tipo: "proposta", texto: soarHumano(texto2), proposta };
}
