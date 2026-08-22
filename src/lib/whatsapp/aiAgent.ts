import type { Empreendimento } from "@/lib/types";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { chamarGeminiJson } from "./gemini";
import type { DossieClienteIA, TomVozBot } from "./types";

/**
 * Versão do prompt de atendimento. REGRA: qualquer mudança de conteúdo em
 * `construirPromptSistema` exige bump desta constante — é ela que liga cada
 * linha de `ia_interacoes` e cada resultado de eval (scripts/eval/) à
 * versão exata do prompt que os produziu. Sem o bump, a rastreabilidade
 * score→versão vira mentira.
 */
export const PROMPT_VERSAO = "2026.08-v2";

export interface ContextoAtendimento {
  nomeCorretor: string;
  creciCorretor: string;
  telefoneCorretor: string;
  nomeAssistente: string;
  tomVoz: string;
  catalogo: Empreendimento[];
  historicoMensagens: { remetente: "cliente" | "bot" | "corretor"; texto: string }[];
  /** Trechos reais de conversas que converteram (ver `aprendizadoContinuo.ts`). Vazio para corretor sem histórico ainda. */
  exemplosFewShot?: string;
  /** O que a IA já qualificou deste cliente (ver dossierExtractor.ts) — sem isso ela re-pergunta o que já sabe. */
  dossie?: DossieClienteIA | null;
  /** Instrução extra de cenário (ex.: follow-up de reengajamento). */
  instrucaoExtra?: string;
}

/**
 * O tom de voz que o corretor escolhe no painel. Ficou meses salvo no banco
 * sem NENHUM efeito — a config era decorativa. Cada parágrafo abaixo é
 * curto de propósito: instrução de estilo longa demais dilui as diretrizes
 * de venda.
 */
const INSTRUCOES_TOM: Record<TomVozBot, string> = {
  consultivo_alto_padrao:
    "TOM DE VOZ: consultivo de alto padrão. Sofisticada sem ser pomposa; vocabulário preciso, frases calmas, zero gíria. Trate o cliente como um investidor inteligente que merece contexto, não pressão.",
  formal_direto:
    "TOM DE VOZ: formal e direto. Objetiva, económica nas palavras, sempre cordial. Vá ao ponto: responda o que foi perguntado primeiro, contextualize depois, sem floreio.",
  descontraido_acolhedor:
    "TOM DE VOZ: descontraído e acolhedor. Próxima e calorosa, como quem atende um amigo — pode usar emoji com parcimônia (no máximo um por mensagem) e linguagem leve, sem perder o profissionalismo.",
};

function instrucaoDeTom(tomVoz: string): string {
  return INSTRUCOES_TOM[tomVoz as TomVozBot] ?? INSTRUCOES_TOM.consultivo_alto_padrao;
}

/** Resumo do dossiê para o prompt — só o que orienta a próxima resposta. */
function resumoDossieParaPrompt(dossie: DossieClienteIA): string {
  const partes: string[] = [];
  if (dossie.orcamentoMin || dossie.orcamentoMax) {
    partes.push(
      `orçamento ${dossie.orcamentoMin ? formatarMoedaBRL(dossie.orcamentoMin) : "?"} a ${dossie.orcamentoMax ? formatarMoedaBRL(dossie.orcamentoMax) : "?"}`,
    );
  }
  if (dossie.perfilFamiliar) partes.push(`perfil: ${dossie.perfilFamiliar.replace(/_/g, " ")}`);
  if (dossie.urgenciaMudanca) partes.push(`urgência: ${dossie.urgenciaMudanca.replace(/_/g, " ")}`);
  if (dossie.formaPagamento) partes.push(`pagamento: ${dossie.formaPagamento.replace(/_/g, " ")}`);
  if (dossie.exigenciasEspecificas.length > 0) {
    partes.push(`exigências: ${dossie.exigenciasEspecificas.join(", ")}`);
  }
  if (dossie.objecoesIdentificadas.length > 0) {
    partes.push(`objeções já levantadas: ${dossie.objecoesIdentificadas.join(", ")}`);
  }
  return partes.join(" · ");
}

export interface AnexoMidiaIA {
  tipo: "foto" | "planta" | "video" | "tour360";
  url: string;
  titulo: string;
}

export interface VisitaPropostaIA {
  /** Horário no fuso de São Paulo, ISO com offset (ex.: 2026-08-25T10:00:00-03:00). */
  dataHoraISO: string;
  /** true SOMENTE quando o cliente aceitou explicitamente este horário. */
  confirmadaPeloCliente: boolean;
}

export interface RespostaAgenteIA {
  textoResposta: string;
  sugerirVisita: boolean;
  transferirHumano: boolean;
  motivoTransferencia?: string;
  empreendimentoCitado?: string;
  imoveisRecomendados: { nome: string; slug: string; preco: number | null; fotoUrl?: string }[];
  anexosMidia: AnexoMidiaIA[];
  visitaProposta?: VisitaPropostaIA | null;
  /** Telemetria da chamada — ver ia_interacoes (0029). */
  meta: { latenciaMs: number; fallback: boolean; tokensEntrada: number | null; tokensSaida: number | null };
}

/**
 * Gera o prompt de sistema personalizado com RAG do catálogo da Next Home.
 */
export function construirPromptSistema(ctx: ContextoAtendimento): string {
  // O corte para 10 acontece ANTES, no ranking por relevância
  // (catalogoRelevante.ts) — aqui o slice é só o teto de segurança.
  const resumoCatalogo = ctx.catalogo
    .slice(0, 10)
    .map((e) => {
      const preco = e.precoAPartir ? formatarMoedaBRL(e.precoAPartir) : "Consulte";
      const midiasDisponiveis = [
        e.capa?.url ? `Foto de Capa (${e.capa.url})` : null,
        e.bookUrl ? `Book Digital PDF (${e.bookUrl})` : null,
        e.plantas?.length ? `Plantas (${e.plantas.map((p) => p.url).join(", ")})` : null,
        e.videos?.length ? `Vídeo Cinema (${e.videos[0]?.url})` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      return `- ${e.nome} (${e.bairro}, ${e.cidade}): ${e.status}, Tipo: ${e.tipo}, Preço a partir de: ${preco}. Destaques: ${e.tagline || e.descricao.slice(0, 100)}. Mídias: ${midiasDisponiveis}`;
    })
    .join("\n");

  const secaoExemplos = ctx.exemplosFewShot?.trim()
    ? `\n\nEXEMPLOS REAIS DE CONVERSAS QUE CONVERTERAM (imite o tom, o ritmo e os argumentos que funcionaram — nunca copie literalmente, cada cliente é um caso novo):\n${ctx.exemplosFewShot}`
    : "";

  // O que a IA já sabe deste cliente — sem esta seção ela re-perguntava
  // orçamento e perfil que o dossiê já tinha registrado, quebrando a
  // sensação de continuidade que separa vendedora de robô.
  const resumoDossie = ctx.dossie ? resumoDossieParaPrompt(ctx.dossie) : "";
  const secaoDossie = resumoDossie
    ? `\n\nO QUE VOCÊ JÁ SABE DESTE CLIENTE (não re-pergunte; use para personalizar): ${resumoDossie}`
    : "";

  const secaoExtra = ctx.instrucaoExtra?.trim() ? `\n\nCENÁRIO DESTA MENSAGEM: ${ctx.instrucaoExtra.trim()}` : "";

  const agoraSP = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  return `Você é ${ctx.nomeAssistente}, da equipe do corretor ${ctx.nomeCorretor} (CRECI ${ctx.creciCorretor}) da Next Home em Alphaville — especialista em vendas de imóveis de alto padrão.

Você não é uma atendente de suporte: é uma vendedora. Seu objetivo é conduzir a conversa — com elegância, nunca com pressão — do primeiro "oi" até a visita agendada ou a proposta.

${instrucaoDeTom(ctx.tomVoz)}

AGORA SÃO ${agoraSP} (horário de São Paulo). Use esta referência para propor horários de visita.

DIRETRIZES FUNDAMENTAIS:
1. Responda de forma concisa e natural, ideal para leitura rápida no WhatsApp (máximo 2 a 4 parágrafos curtos). O texto pode marcar uma quebra natural de assunto com "---" ou uma linha em branco; o sistema decide sozinho, por esse marcador ou pelo tamanho da resposta, como distribuir o conteúdo em balões separados.
2. Utilize o catálogo oficial abaixo para responder sobre valores, bairros, plantas e mídias:
${resumoCatalogo}
3. Se o cliente pedir fotos, plantas, tour ou vídeo de um imóvel, selecione e anexe no campo "anexosMidia" — o sistema envia como mídia nativa do WhatsApp, não como link.
4. Nunca invente dados que não estão no catálogo. Se não souber, diga que vai confirmar e volta com a resposta certa — sem anunciar transferência para "um humano" ou "o corretor": para o cliente, é sempre você conduzindo, do início ao fim.
5. Identifique o perfil do cliente (orçamento, se tem filhos, se tem pets, se busca moradia ou investimento).
6. Escreva como uma pessoa da equipe escreveria — natural, sem jargão de atendimento automatizado. Não é seu papel abrir esse assunto por conta própria (nunca diga "sou uma assistente virtual" ou "sou um sistema de IA" sem ser perguntada). Se o cliente perguntar de forma direta e explícita se está falando com um robô ou uma IA, responda com naturalidade e honestidade — não negue. Fora essa pergunta direta, o assunto simplesmente não aparece.
7. ${ctx.nomeCorretor} acompanha esta conversa nos bastidores e pode assumir a qualquer momento — isso já acontece automaticamente pelo sistema, então nunca diga ao cliente "vou avisar o corretor" ou "estou passando para um atendente": a mensagem soa como se você estivesse se desresponsabilizando, e quebra o fluxo da venda. Continue conduzindo normalmente.

TÉCNICAS DE VENDA CONSULTIVA (aplique com naturalidade, nunca de forma mecânica ou insistente):
- Rapport antes de pitch: acolha e valide o que o cliente disse antes de emplacar informação de imóvel.
- Perguntas de qualificação (estilo SPIN): entenda Situação (onde mora hoje), Problema (o que incomoda), Implicação (o custo de continuar assim) e Necessidade (o que a mudança resolve) — uma pergunta por vez, nunca um questionário.
- Venda o benefício, não a ficha técnica: "3 suítes" é dado; "cada filho com seu espaço, sem fila de banheiro de manhã" é o que fecha negócio.
- Ancoragem de valor antes do preço: contextualize localização, padrão de acabamento e potencial de valorização antes de citar o número.
- Prova social e escassez legítimas: cite unidades restantes ou ritmo de vendas SOMENTE quando essa informação estiver de fato no catálogo ou no histórico — nunca invente urgência falsa.
- Contorno de objeção: acolha a objeção (nunca discorde de frente), reformule com um ângulo novo, ofereça um próximo passo concreto (visita, planta, simulação com o corretor).
- Fechamento sempre a caminho de uma ação: toda resposta termina abrindo a porta para o próximo passo — agendar visita, enviar mais detalhes, ou confirmar um horário com ${ctx.nomeCorretor}. Nunca deixe a conversa morrer numa resposta que não convida a continuar.

AGENDAMENTO DE VISITA (sua ação mais valiosa):
- Quando o interesse ficar claro, proponha DOIS horários concretos nos próximos dias (dias úteis entre 9h e 18h, ou sábado de manhã) — "prefere terça às 10h ou quarta às 15h?" converte muito mais que "quer agendar uma visita?".
- Preencha "visitaProposta" no JSON sempre que um horário estiver na mesa. "confirmadaPeloCliente" só vira true quando o cliente ACEITAR EXPLICITAMENTE um horário específico ("pode ser terça às 10h", "fechado, quarta então") — sugestão sua ainda sem resposta, ou um "vou ver e te falo", é false.
- Horário confirmado é compromisso: o sistema grava a visita na agenda do corretor automaticamente. Nunca confirme para o cliente um horário que ele não escolheu.${secaoDossie}${secaoExemplos}${secaoExtra}

FORMATO DE RESPOSTA OBRIGATÓRIO (JSON EXCLUSIVO, sem crases markdown ou texto extra):
{
  "textoResposta": "Mensagem que será enviada diretamente no WhatsApp do cliente.",
  "sugerirVisita": true | false,
  "transferirHumano": true | false,
  "motivoTransferencia": "Motivo se transferirHumano for true ou null",
  "empreendimentoCitado": "Nome do empreendimento principal se citado ou null",
  "imoveisRecomendados": [
    { "nome": "Nome do Imovel", "slug": "slug-do-imovel", "preco": 1500000 }
  ],
  "anexosMidia": [
    { "tipo": "foto" | "planta" | "video" | "tour360", "url": "URL da foto ou planta", "titulo": "Descrição do anexo" }
  ],
  "visitaProposta": { "dataHoraISO": "2026-08-25T10:00:00-03:00", "confirmadaPeloCliente": false } | null
}`;
}

/**
 * Processa a mensagem do cliente usando o Gemini com RAG do catálogo.
 *
 * A chamada de rede (timeout + 1 retentativa) mora em `gemini.ts`; aqui fica
 * só a montagem do prompt e o parse defensivo do contrato JSON. O `meta`
 * devolvido alimenta a telemetria (ia_interacoes) — inclusive no fallback,
 * que é o dado mais importante de todos: fallback silencioso foi o que
 * deixou defeitos graves invisíveis por semanas neste sistema.
 */
export async function gerarRespostaIA(
  ctx: ContextoAtendimento,
  mensagemCliente: string,
): Promise<RespostaAgenteIA> {
  const fallback = (motivo: string, latenciaMs = 0): RespostaAgenteIA => ({
    textoResposta: `Olá! Recebi sua mensagem sobre nossos imóveis em Alphaville. Estou avisando o ${ctx.nomeCorretor} para te dar um atendimento personalizado em instantes!`,
    sugerirVisita: false,
    transferirHumano: true,
    motivoTransferencia: motivo,
    imoveisRecomendados: [],
    anexosMidia: [],
    visitaProposta: null,
    meta: { latenciaMs, fallback: true, tokensEntrada: null, tokensSaida: null },
  });

  const promptSistema = construirPromptSistema(ctx);

  // Cada fala com o autor certo: a fala do corretor era rotulada como se
  // fosse da assistente, e a IA "aprendia" um estilo que não era o dela.
  const historicoFormatado = ctx.historicoMensagens
    .map((m) => {
      const rotulo =
        m.remetente === "cliente"
          ? "Cliente"
          : m.remetente === "corretor"
            ? `${ctx.nomeCorretor} (corretor, humano)`
            : ctx.nomeAssistente;
      return `${rotulo}: ${m.texto}`;
    })
    .join("\n");

  const entradaPrompt = `${promptSistema}\n\n--- HISTÓRICO DA CONVERSA ---\n${historicoFormatado}\nCliente: ${mensagemCliente}\n${ctx.nomeAssistente}:`;

  const resultado = await chamarGeminiJson(entradaPrompt, { temperature: 0.2 });

  if (!resultado.ok) {
    if (resultado.erro === "sem_api_key") {
      return {
        ...fallback("API Key não configurada (Fallback)"),
        textoResposta: `Olá! Sou a ${ctx.nomeAssistente}, assistente do consultor ${ctx.nomeCorretor}. Recebi sua mensagem e já avisei o ${ctx.nomeCorretor} para te responder em instantes!`,
      };
    }
    console.error("Erro ao chamar o Gemini no agente de WhatsApp:", resultado.erro);
    return fallback(`Erro na IA / Fallback (${resultado.erro})`, resultado.latenciaMs);
  }

  const parsed = resultado.json as Record<string, unknown>;
  const visita = parsed.visitaProposta as VisitaPropostaIA | null | undefined;

  return {
    textoResposta: (parsed.textoResposta as string) || "Olá! Como posso ajudar você hoje?",
    sugerirVisita: Boolean(parsed.sugerirVisita),
    transferirHumano: Boolean(parsed.transferirHumano),
    motivoTransferencia: (parsed.motivoTransferencia as string) || undefined,
    empreendimentoCitado: (parsed.empreendimentoCitado as string) || undefined,
    imoveisRecomendados: Array.isArray(parsed.imoveisRecomendados)
      ? (parsed.imoveisRecomendados as RespostaAgenteIA["imoveisRecomendados"])
      : [],
    anexosMidia: Array.isArray(parsed.anexosMidia) ? (parsed.anexosMidia as AnexoMidiaIA[]) : [],
    visitaProposta:
      visita && typeof visita.dataHoraISO === "string"
        ? { dataHoraISO: visita.dataHoraISO, confirmadaPeloCliente: Boolean(visita.confirmadaPeloCliente) }
        : null,
    meta: {
      latenciaMs: resultado.latenciaMs,
      fallback: false,
      tokensEntrada: resultado.tokensEntrada,
      tokensSaida: resultado.tokensSaida,
    },
  };
}
