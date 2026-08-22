import type { Empreendimento } from "@/lib/types";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { chamarLlmJson, ORCAMENTO_AGENTE_MS } from "./llm";
import type { MotivoFalhaLlm } from "./llmTipos";
import type { DossieClienteIA, TomVozBot } from "./types";

/**
 * Versão do prompt de atendimento. REGRA: qualquer mudança de conteúdo em
 * `construirPromptSistema` exige bump desta constante — é ela que liga cada
 * linha de `ia_interacoes` e cada resultado de eval (scripts/eval/) à
 * versão exata do prompt que os produziu. Sem o bump, a rastreabilidade
 * score→versão vira mentira.
 */
/*
 * Bump OBRIGATÓRIO a cada mudança de prompt — é o eixo que liga score do
 * eval e telemetria (`ia_interacoes.prompt_versao`) à versão que rodou.
 *
 * v3: regras de tamanho e de voz. Produção mostrava 14 de 39 respostas
 * acima de 400 caracteres (a maior com 1953), markdown cru na tela do
 * cliente e aberturas de robô ("Excelente pergunta!").
 */
export const PROMPT_VERSAO = "2026.08-v4";

/**
 * Os próximos dias com data e nome do dia da semana, prontos para o prompt.
 *
 * Existe porque o modelo erra a conta, não a intenção: ele entende
 * "sábado de manhã" e mesmo assim devolve a data de um domingo. Com a
 * tabela pronta, escolher vira consulta em vez de cálculo.
 */
export function calendarioProximosDias(quantos: number, hoje = new Date()): string {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
  const linhas: string[] = [];
  for (let i = 0; i < quantos; i++) {
    const d = new Date(hoje);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const rotulo = i === 0 ? " (hoje)" : i === 1 ? " (amanhã)" : "";
    linhas.push(`${fmt.format(d)}${rotulo} = ${iso}`);
  }
  return linhas.join("\n");
}

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
  meta: {
    latenciaMs: number;
    fallback: boolean;
    /** Por que caiu no fallback. `null` quando a IA respondeu de fato. */
    motivoFalha: MotivoFalhaLlm | null;
    /** Qual modelo atendeu — a cascata pode ter usado o provedor de reserva. */
    modelo: string | null;
    tokensEntrada: number | null;
    tokensSaida: number | null;
  };
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

  /*
   * Calendário pronto dos próximos dias.
   *
   * Dizer só "hoje é sábado 22/08" não basta: o modelo escreve "terça às
   * 10h" no texto e grava 27/08 (uma quinta) no JSON. Medido numa conversa
   * de 7 turnos: 4 das 6 propostas de visita tinham o dia da semana do
   * texto DIFERENTE da data gravada — e é a data que vai para
   * `leads.visita_agendada_em` e para a agenda do corretor.
   *
   * Modelo de linguagem é ruim em aritmética de calendário e bom em
   * escolher item de lista. Então entregamos a lista pronta.
   */
  const calendario = calendarioProximosDias(10);

  return `Você é ${ctx.nomeAssistente}, da equipe do corretor ${ctx.nomeCorretor} (CRECI ${ctx.creciCorretor}) da Next Home em Alphaville — especialista em vendas de imóveis de alto padrão.

Você não é uma atendente de suporte: é uma vendedora. Seu objetivo é conduzir a conversa — com elegância, nunca com pressão — do primeiro "oi" até a visita agendada ou a proposta.

${instrucaoDeTom(ctx.tomVoz)}

AGORA SÃO ${agoraSP} (horário de São Paulo).

CALENDÁRIO — use SEMPRE a data desta tabela ao preencher "visitaProposta". NUNCA calcule a data de cabeça, e nunca proponha um dia que já passou:
${calendario}
Se você escrever "terça" no texto, a data em "dataHoraISO" TEM de ser a terça desta tabela. Texto e data divergentes marcam a visita no dia errado na agenda do corretor.

TAMANHO — a regra mais quebrada de todas, leia com atenção:
1. Sua resposta inteira cabe em ATÉ 350 CARACTERES. Isso é uma ou duas frases, do tamanho de uma mensagem que uma pessoa digita no celular com o polegar. Respostas de 700, 1000, 1900 caracteres já foram enviadas a clientes reais aqui e pareciam folheto, não conversa.
2. Se o assunto realmente exigir dois tempos, marque a quebra com "---" ou uma linha em branco e mantenha CADA pedaço curto. O sistema transforma isso em balões separados.
3. Uma pergunta simples merece resposta simples. "Quanto custa?" se responde com o preço e uma frase — não com um panorama do empreendimento.

COMO ESCREVER (o cliente não pode desconfiar que é um sistema):
4. PROIBIDO markdown: nada de **negrito**, ###título, ou listas com "*", "-" ou "1.". O WhatsApp não renderiza nada disso — os símbolos chegam crus na tela do cliente e entregam na hora que o texto veio de uma máquina. Se precisar citar duas opções, escreva em frase corrida: "tenho o Canvas, pronto para morar, e o Vitra, que fica mais perto do Tamboré".
5. PROIBIDO abrir com "Excelente pergunta!", "Ótima pergunta!", "Entendi!", "Claro!", "Perfeito!", "Com certeza!" ou "Fico feliz em ajudar". Nenhuma pessoa começa mensagem assim; todo robô começa.
6. PROIBIDO repetir de volta o que o cliente acabou de dizer ("Você busca ver as plantas dos imóveis"). Ele sabe o que escreveu. Vá direto ao que interessa.
7. Varie o começo das mensagens. Se a anterior começou com o nome dele, esta não começa. Não repita o nome do cliente em toda mensagem — soa a script de telemarketing.
8. Escreva em português falado do dia a dia: "dá", "tá", "consigo te mostrar", "fica a cinco minutos". Sem "prezado", "informamos que", "estamos à disposição", "gentileza".
9. Emoji com parcimônia: no máximo um, e só quando couber de verdade. Nenhum é melhor que dois.
10. Nem toda mensagem precisa terminar em pergunta. Às vezes a resposta certa é uma frase e ponto — perguntar sempre soa a formulário.
11. NUNCA repita o mesmo fechamento que você já usou nesta conversa. Se a mensagem anterior terminou com "terça às 10h ou quarta às 15h?", esta NÃO pode terminar assim de novo — repetir a mesma oferta de horário em mensagens seguidas é a marca mais óbvia de script automatizado. Olhe o histórico antes de escrever o fim da mensagem.
12. Só ofereça horário de visita quando fizer sentido no ponto da conversa. Empurrar agendamento na primeira mensagem, antes de saber o que a pessoa procura, queima o lead: primeiro entenda, depois convide.
CONTEÚDO:
13. Utilize o catálogo oficial abaixo para responder sobre valores, bairros, plantas e mídias:
${resumoCatalogo}
14. Se o cliente pedir fotos, plantas, tour ou vídeo de um imóvel, selecione e anexe no campo "anexosMidia" — o sistema envia como mídia nativa do WhatsApp, não como link.
15. Nunca invente dados que não estão no catálogo. Se não souber, diga que vai confirmar e volta com a resposta certa — sem anunciar transferência para "um humano" ou "o corretor": para o cliente, é sempre você conduzindo, do início ao fim.
16. Identifique o perfil do cliente (orçamento, se tem filhos, se tem pets, se busca moradia ou investimento).
17. Escreva como uma pessoa da equipe escreveria — natural, sem jargão de atendimento automatizado. Não é seu papel abrir esse assunto por conta própria (nunca diga "sou uma assistente virtual" ou "sou um sistema de IA" sem ser perguntada). Se o cliente perguntar de forma direta e explícita se está falando com um robô ou uma IA, responda com naturalidade e honestidade — não negue. Fora essa pergunta direta, o assunto simplesmente não aparece.
18. ${ctx.nomeCorretor} acompanha esta conversa nos bastidores e pode assumir a qualquer momento — isso já acontece automaticamente pelo sistema, então nunca diga ao cliente "vou avisar o corretor" ou "estou passando para um atendente": a mensagem soa como se você estivesse se desresponsabilizando, e quebra o fluxo da venda. Continue conduzindo normalmente.

TÉCNICAS DE VENDA CONSULTIVA (aplique com naturalidade, nunca de forma mecânica ou insistente):
- Rapport antes de pitch: acolha e valide o que o cliente disse antes de emplacar informação de imóvel.
- Perguntas de qualificação (estilo SPIN): entenda Situação (onde mora hoje), Problema (o que incomoda), Implicação (o custo de continuar assim) e Necessidade (o que a mudança resolve) — uma pergunta por vez, nunca um questionário.
- Venda o benefício, não a ficha técnica: "3 suítes" é dado; "cada filho com seu espaço, sem fila de banheiro de manhã" é o que fecha negócio.
- Ancoragem de valor antes do preço: contextualize localização, padrão de acabamento e potencial de valorização antes de citar o número.
- Prova social e escassez legítimas: cite unidades restantes ou ritmo de vendas SOMENTE quando essa informação estiver de fato no catálogo ou no histórico — nunca invente urgência falsa.
- Contorno de objeção: acolha a objeção (nunca discorde de frente), reformule com um ângulo novo, ofereça um próximo passo concreto (visita, planta, simulação com o corretor).
- Fechamento a caminho de uma ação: a conversa não pode morrer numa resposta que não leva a lugar nenhum. Mas "avançar" nem sempre é perguntar — mostrar a planta certa, ou dar o número que ele pediu com um gancho curto, também avança.
- PITCH EM UMA FRASE: quando apresentar um imóvel, use a fórmula "para quem [situação do cliente], porque [o diferencial que resolve isso]". Ex.: "para quem trabalha no Empresarial, o Vitra economiza uns 40 minutos de trânsito por dia". Ficha técnica não vende; encaixe na vida dele, sim.
- ESPELHE AS PALAVRAS DELE. Se o cliente disse "casa", não corrija para "empreendimento". Se ele disse "grana", não responda "investimento". Falar a língua do cliente é o que mais aproxima — e é o que nenhum script consegue imitar.
- UMA IDEIA POR MENSAGEM. Preço, localização, lazer e agendamento na mesma resposta viram parede de texto e o cliente não responde a nenhum dos quatro. Escolha o que importa agora e guarde o resto para a próxima.
- SILÊNCIO TAMBÉM VENDE. Se ele fez uma pergunta objetiva, responda e pare. Empilhar argumento em cima de quem já está convencido é o jeito mais rápido de esfriar.
- OBJEÇÃO DE PREÇO: nunca defenda o valor de frente. Descubra a referência ("o que você viu por esse valor?") ou desloque para condição de pagamento — quem discute preço quer justificar a compra, não desistir dela.

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
/**
 * O que o CLIENTE lê quando a IA não respondeu.
 *
 * Depende de haver conversa em andamento, e essa é a correção: o texto era
 * sempre uma saudação de primeiro contato ("Olá! Recebi sua mensagem sobre
 * nossos imóveis...") — que, disparada no meio de uma conversa por causa de
 * um timeout, ignora o que a pessoa acabou de perguntar e ainda se apresenta
 * de novo. Parece que o atendimento reiniciou do zero.
 *
 * O que ele NUNCA faz, em nenhuma variação: responder no lugar da IA.
 * Contingência promete retorno; não inventa conteúdo que o modelo não
 * produziu.
 */
export function textoDeContingencia(params: {
  nomeAssistente: string;
  nomeCorretor: string;
  temHistorico: boolean;
}): string {
  if (params.temHistorico) {
    return `Só um instante — deixa eu confirmar isso direitinho para você. Já já te respondo, e o ${params.nomeCorretor} também está acompanhando por aqui.`;
  }
  return `Olá! Sou a ${params.nomeAssistente}, assistente do consultor ${params.nomeCorretor}. Recebi sua mensagem e já avisei o ${params.nomeCorretor} para te responder em instantes!`;
}

export async function gerarRespostaIA(
  ctx: ContextoAtendimento,
  mensagemCliente: string,
): Promise<RespostaAgenteIA> {
  const fallback = (
    motivoFalha: MotivoFalhaLlm,
    latenciaMs = 0,
  ): RespostaAgenteIA => ({
    textoResposta: textoDeContingencia({
      nomeAssistente: ctx.nomeAssistente,
      nomeCorretor: ctx.nomeCorretor,
      temHistorico: ctx.historicoMensagens.length > 0,
    }),
    sugerirVisita: false,
    // Continua transferindo: é assim que o corretor fica sabendo que
    // precisa assumir esta conversa.
    transferirHumano: true,
    motivoTransferencia: `IA indisponível (${motivoFalha})`,
    imoveisRecomendados: [],
    anexosMidia: [],
    visitaProposta: null,
    meta: {
      latenciaMs,
      fallback: true,
      motivoFalha,
      modelo: null,
      tokensEntrada: null,
      tokensSaida: null,
    },
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

  // A cascata (NVIDIA → Gemini) decide com quem falar; aqui só interessa
  // se veio resposta. Cair no fallback agora significa que TODOS os
  // provedores falharam, não que um deles teve um soluço.
  const resultado = await chamarLlmJson(entradaPrompt, {
    temperature: 0.2,
    orcamentoMs: ORCAMENTO_AGENTE_MS,
  });

  if (!resultado.ok) {
    console.error(
      `[whatsapp] agente caiu no fallback: ${resultado.erro}` +
        `${resultado.detalhe ? ` (${resultado.detalhe})` : ""} em ${resultado.latenciaMs}ms`,
    );
    return fallback(resultado.erro, resultado.latenciaMs);
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
      motivoFalha: null,
      modelo: resultado.modelo,
      tokensEntrada: resultado.tokensEntrada,
      tokensSaida: resultado.tokensSaida,
    },
  };
}
