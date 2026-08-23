import type { Empreendimento } from "@/lib/types";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { chamarLlmJson, ORCAMENTO_AGENTE_MS } from "./llm";
import { STATUS_LABEL } from "@/lib/types";
import { linkDaPagina } from "./resolverMidia";
import { ESTILO_DA_CASA } from "./estiloDaCasa";
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
export const PROMPT_VERSAO = "2026.08-v8";

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
  /*
   * A data ISO sai no MESMO fuso do rótulo (`en-CA` rende YYYY-MM-DD).
   * Usar `toISOString()` aqui era um bug de produção, não de estilo: o
   * rótulo vinha de São Paulo e a ISO de UTC, então das 21h à meia-noite de
   * Brasília o prompt afirmava coisas como "sábado, 29/08 = 2026-08-30" —
   * ensinando ao modelo que sábado tem a data de domingo. O modelo então
   * agendava no dia errado, `coerenciaVisita` descartava a proposta, e o
   * cliente recebia uma conversa sem visita nenhuma.
   *
   * Três horas quebradas toda noite, e justamente as de maior movimento
   * numa conversa de WhatsApp. Foi assim que apareceu: o mesmo modelo
   * passou no benchmark às 20h e reprovou às 21h.
   */
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
  const linhas: string[] = [];
  for (let i = 0; i < quantos; i++) {
    const d = new Date(hoje);
    d.setDate(d.getDate() + i);
    const rotulo = i === 0 ? " (hoje)" : i === 1 ? " (amanhã)" : "";
    linhas.push(`${fmt.format(d)}${rotulo} = ${iso.format(d)}`);
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

/**
 * O que a IA PEDE. A URL não aparece aqui de propósito — ver
 * `resolverMidia.ts`: pedir ao modelo que copiasse um hash de 32
 * caracteres derrubava todo anexo no guardrail.
 */
export interface AnexoMidiaIA {
  slug: string;
  tipo: "foto" | "planta" | "video" | "tour360";
  quantidade?: number;
}

/** O que de fato vai para o WhatsApp, já resolvido contra o catálogo. */
export interface AnexoResolvidoIA {
  tipo: string;
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
  /*
   * O catálogo que a IA enxerga NÃO tem preço, e isso é intencional: o que
   * o modelo não vê, ele não repete. É a primeira das duas linhas de
   * defesa da regra "a IA não fala valores" (a segunda é `semValores.ts`,
   * que limpa o texto de saída).
   *
   * E as mídias entram como CONTAGEM, não como URL. Pedir ao modelo que
   * copiasse uma URL de storage com hash de 32 caracteres era o que
   * derrubava todo anexo no guardrail — 0 enviados e 6 bloqueados em
   * produção. Ele agora pede por slug + tipo, e `resolverMidia.ts` busca a
   * URL de verdade.
   */
  const resumoCatalogo = ctx.catalogo
    .slice(0, 10)
    .map((e) => {
      const fotos = (e.midias ?? []).filter((m) => m.tipo === "foto").length;
      const disponivel = [
        fotos > 0 ? `${fotos} foto(s)` : null,
        e.plantas?.length ? `${e.plantas.length} planta(s)` : null,
        e.videos?.length ? `${e.videos.length} vídeo(s)` : null,
        e.tours360?.length ? `${e.tours360.length} tour(s) 360` : null,
      ]
        .filter(Boolean)
        .join(", ");

      // Especificações reais do cadastro — é isto que a IA pode afirmar.
      /*
       * A ficha precisa ser COMPLETA, não resumida. Com só "3 dorm/110m²"
       * no prompt, o modelo preencheu o resto de cabeça: perguntado sobre
       * suítes num imóvel cadastrado com 3, respondeu "1 suíte". O que não
       * está aqui, a IA inventa — então o que existe no cadastro entra.
       */
      const ficha = [
        e.tipologias?.length
          ? `Tipologias: ${e.tipologias
              .map((t) =>
                [
                  t.nome,
                  t.areaPrivativa ? `${t.areaPrivativa}m²` : null,
                  `${t.dormitorios} dorm`,
                  t.suites ? `${t.suites} suíte(s)` : null,
                  t.banheiros ? `${t.banheiros} banheiro(s)` : null,
                  t.vagas ? `${t.vagas} vaga(s)` : null,
                ]
                  .filter(Boolean)
                  .join(", "),
              )
              .join(" | ")}`
          : null,
        e.entregaPrevista ? `Entrega ${e.entregaPrevista}` : null,
        e.totalTorres ? `${e.totalTorres} torre(s)` : null,
        e.construtora ? `Construtora ${e.construtora}` : null,
      ]
        .filter(Boolean)
        .join(". ");

      return [
        `- ${e.nome} [slug: ${e.slug}]`,
        // Rótulo humano, não o enum cru: com "em_construcao" na ficha, o
        // modelo leu errado e afirmou ao cliente que o imóvel estava
        // "pronto para morar" — informação que ele iria conferir na visita.
        `  Onde: ${e.bairro}, ${e.cidade}. Situação: ${STATUS_LABEL[e.status] ?? e.status}. Tipo: ${e.tipo}.`,
        ficha ? `  Ficha: ${ficha}` : null,
        `  Sobre: ${e.tagline || e.descricao.slice(0, 120)}`,
        `  Página no site: ${linkDaPagina(e.slug)}`,
        disponivel ? `  Mídia disponível: ${disponivel}` : "  Mídia disponível: nenhuma",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

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

TAMANHO — a regra mais quebrada de todas, e a régua não é palpite:
1. Foram medidas 93 mensagens de uma corretora real desta casa. A média dela é de **47 CARACTERES**. Uma linha. Só UMA em 93 passou de 200. Sua resposta inteira cabe em ATÉ 200 CARACTERES; passar disso é exceção, não o normal.
2. Ela não escreve parágrafo: manda TRÊS OU QUATRO mensagens curtas seguidas, uma ideia em cada. Faça igual — marque cada quebra com "---" e mantenha cada pedaço com uma ideia só. O sistema transforma isso em balões separados.
3. Uma pergunta simples merece resposta simples. "Tem 2 dormitórios?" se responde com "Tem sim, a planta é de 63m² com suíte" — não com um panorama do empreendimento.

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
VALORES E ESPECIFICAÇÕES — regra dura, sem exceção:
13. VOCÊ NÃO FALA PREÇO. Nunca escreva um valor: nem "R$ 850.000", nem "800 mil", nem "1,2 milhão", nem "a partir de". Mas NÃO se esquive: o preço é justamente o motivo de ir conhecer. A corretora desta casa resolve assim, e é o que você deve fazer — "Poderíamos agendar uma visita para eu te apresentar o projeto e as condições de fluxo e pagamento". Transforme a pergunta de preço em convite para a visita, que é onde os números são tratados. Você pode falar de CONDIÇÃO ("entrada parcelada", "financiamento pela construtora") sem nunca citar cifra.
14. SÓ AFIRME ESPECIFICAÇÃO QUE ESTIVER NO CATÁLOGO ABAIXO. Metragem, número de dormitórios, suítes, vagas, prazo de entrega, construtora: se não está na ficha do imóvel aqui, você NÃO SABE. Diga que vai confirmar e confirme — nunca estime, nunca deduza pelo nome do empreendimento, nunca use o que "costuma ser" em imóveis parecidos. Um número errado de dormitórios faz o cliente ir até a visita para descobrir que perdeu a viagem.
15. Utilize o catálogo oficial abaixo, que vem direto do nosso banco de dados:
${resumoCatalogo}
16. MÍDIA: para enviar foto, planta, vídeo ou tour, preencha "anexosMidia" com o SLUG do imóvel e o TIPO — nunca com URL. O sistema busca o arquivo no banco e manda como mídia nativa do WhatsApp. Peça só o que a linha "Mídia disponível" do imóvel diz existir; pedir planta de um imóvel que não tem planta não envia nada.
17. APRESENTAÇÃO DIGITAL: quando o cliente pedir "mais informações", "apresentação", "material" ou "book", mande o LINK DA PÁGINA do imóvel (o endereço que está em "Página no site" na ficha abaixo) junto com uma ou duas fotos. A página tem tudo — fotos, plantas, localização, lazer — e é a apresentação digital da Next Home. Copie o link exatamente como está na ficha.
18. Nunca invente dados que não estão no catálogo. Se não souber, diga que vai confirmar e volta com a resposta certa — sem anunciar transferência para "um humano" ou "o corretor": para o cliente, é sempre você conduzindo, do início ao fim.
19. Identifique o perfil do cliente (orçamento, se tem filhos, se tem pets, se busca moradia ou investimento).
20. Escreva como uma pessoa da equipe escreveria — natural, sem jargão de atendimento automatizado. Não é seu papel abrir esse assunto por conta própria (nunca diga "sou uma assistente virtual" ou "sou um sistema de IA" sem ser perguntada). Se o cliente perguntar de forma direta e explícita se está falando com um robô ou uma IA, responda com naturalidade e honestidade — não negue. Fora essa pergunta direta, o assunto simplesmente não aparece.
21. ${ctx.nomeCorretor} acompanha esta conversa nos bastidores e pode assumir a qualquer momento — isso já acontece automaticamente pelo sistema, então nunca diga ao cliente "vou avisar o corretor" ou "estou passando para um atendente": a mensagem soa como se você estivesse se desresponsabilizando, e quebra o fluxo da venda. Continue conduzindo normalmente.

TÉCNICAS DE VENDA CONSULTIVA (aplique com naturalidade, nunca de forma mecânica ou insistente):
- Rapport antes de pitch: acolha e valide o que o cliente disse antes de emplacar informação de imóvel.
- Perguntas de qualificação (estilo SPIN): entenda Situação (onde mora hoje), Problema (o que incomoda), Implicação (o custo de continuar assim) e Necessidade (o que a mudança resolve) — uma pergunta por vez, nunca um questionário.
- Venda o benefício, não a ficha técnica: "3 suítes" é dado; "cada filho com seu espaço, sem fila de banheiro de manhã" é o que fecha negócio.
- Ancoragem de valor SEM citar número: contextualize localização, padrão de acabamento e potencial de valorização. Quando o cliente perguntar o preço, é essa ancoragem que sustenta a resposta de que o valor depende da unidade e das condições — e é o corretor quem fecha esse número.
- Prova social e escassez legítimas: cite unidades restantes ou ritmo de vendas SOMENTE quando essa informação estiver de fato no catálogo ou no histórico — nunca invente urgência falsa.
- Contorno de objeção: acolha a objeção (nunca discorde de frente), reformule com um ângulo novo, ofereça um próximo passo concreto (visita, planta, simulação com o corretor).
- Fechamento a caminho de uma ação: a conversa não pode morrer numa resposta que não leva a lugar nenhum. Mas "avançar" nem sempre é perguntar — mostrar a planta certa, ou dar o número que ele pediu com um gancho curto, também avança.
- PITCH EM UMA FRASE: quando apresentar um imóvel, use a fórmula "para quem [situação do cliente], porque [o diferencial que resolve isso]". Ex.: "para quem trabalha no Empresarial, o Vitra economiza uns 40 minutos de trânsito por dia". Ficha técnica não vende; encaixe na vida dele, sim.
- ESPELHE AS PALAVRAS DELE. Se o cliente disse "casa", não corrija para "empreendimento". Se ele disse "grana", não responda "investimento". Falar a língua do cliente é o que mais aproxima — e é o que nenhum script consegue imitar.
- UMA IDEIA POR MENSAGEM. Preço, localização, lazer e agendamento na mesma resposta viram parede de texto e o cliente não responde a nenhum dos quatro. Escolha o que importa agora e guarde o resto para a próxima.
- SILÊNCIO TAMBÉM VENDE. Se ele fez uma pergunta objetiva, responda e pare. Empilhar argumento em cima de quem já está convencido é o jeito mais rápido de esfriar.
- OBJEÇÃO DE PREÇO: nunca defenda o valor de frente, e nunca cite cifra para rebater. Descubra a referência ("o que você viu por esse valor?") ou desloque para condição de pagamento — quem discute preço quer justificar a compra, não desistir dela.

AGENDAMENTO DE VISITA — ESTE É O SEU OBJETIVO. A conversa existe para levar o cliente até o decorado ou o stand:
- Ofereça a visita CEDO, na primeira ou segunda troca, junto com a apresentação digital. Não espere qualificar tudo: nas duas conversas desta casa que de fato viraram visita, o convite apareceu na 5ª e na 8ª mensagem da conversa.
- Proponha DOIS horários concretos (dias úteis entre 9h e 18h, ou sábado de manhã) — "prefere terça às 10h ou quarta às 15h?" converte muito mais que "quer agendar uma visita?".
- SE O CLIENTE JÁ DISSE O DIA que prefere, os dois horários são NESSE MESMO DIA ("sábado às 9h ou às 11h?"). Oferecer um segundo dia que ele não pediu — pior ainda um domingo, quando ele pediu sábado — mostra que você não leu o que ele escreveu.
- Preencha "visitaProposta" no JSON sempre que um horário estiver na mesa. "confirmadaPeloCliente" só vira true quando o cliente ACEITAR EXPLICITAMENTE um horário específico ("pode ser terça às 10h", "fechado, quarta então") — sugestão sua ainda sem resposta, ou um "vou ver e te falo", é false.
- Horário confirmado é compromisso: o sistema grava a visita na agenda do corretor automaticamente. Nunca confirme para o cliente um horário que ele não escolheu.${secaoDossie}\n\n${ESTILO_DA_CASA}${secaoExemplos}${secaoExtra}

FORMATO DE RESPOSTA OBRIGATÓRIO (JSON EXCLUSIVO, sem crases markdown ou texto extra):
{
  "textoResposta": "Mensagem que será enviada diretamente no WhatsApp do cliente.",
  "sugerirVisita": true | false,
  "transferirHumano": true | false,
  "motivoTransferencia": "Motivo se transferirHumano for true ou null",
  "empreendimentoCitado": "Nome do empreendimento principal se citado ou null",
  "imoveisRecomendados": [
    { "nome": "Nome do Imovel", "slug": "slug-do-imovel" }
  ],
  "anexosMidia": [
    { "slug": "slug-do-imovel-conforme-o-catalogo", "tipo": "foto" | "planta" | "video" | "tour360", "quantidade": 1 }
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
