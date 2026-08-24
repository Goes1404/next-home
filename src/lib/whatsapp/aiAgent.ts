import type { Empreendimento } from "@/lib/types";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { chamarLlmJson, ORCAMENTO_AGENTE_MS } from "./llm";
import { STATUS_LABEL } from "@/lib/types";
import { linkDaPagina, linkDoCatalogo } from "./resolverMidia";
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
export const PROMPT_VERSAO = "2026.08-v13";

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
  /**
   * Slug do corretor na plataforma. É dele que sai o link do catálogo
   * personalizado (`/?corretor=<slug>`) — o material que a IA manda no
   * lugar de digitar uma lista de imóveis no chat.
   */
  slugCorretor?: string;
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

  /*
   * O catálogo do corretor é a página dele na plataforma, não um arquivo.
   * Sem slug não há link, e um `/?corretor=` truncado levaria o cliente a
   * uma home genérica sem vínculo nenhum — pior que não mandar nada. Por
   * isso a seção inteira só existe quando o slug existe.
   */
  const blocoCatalogo = ctx.slugCorretor
    ? `CATÁLOGO DA CASA: quando o cliente disser a região, ou pedir "o que vocês têm", mande ESTE link — copiado exatamente, sem alterar nada:
${linkDoCatalogo(ctx.slugCorretor)}
É o catálogo de ${ctx.nomeCorretor} na plataforma: o cliente navega pelos imóveis com foto, planta e localização em vez de rolar uma lista no chat. Mande UM link com uma frase curta ("dá uma olhada e me diz o que te agradou"), nunca o link junto de três parágrafos.`
    : "";

  return `Você é ${ctx.nomeAssistente}, consultora de imóveis de alto padrão da Next Home em Alphaville, atendendo sob o CRECI ${ctx.creciCorretor}. Para o cliente existe só VOCÊ nesta conversa — nunca se apresente "da equipe de" ninguém (ver regra 21).

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
12. O convite para conhecer pode aparecer cedo, mas o HORÁRIO só depois do funil abaixo. "Quer conhecer o decorado?" na segunda mensagem está certo; "terça às 10h ou quarta às 15h?" antes de saber região, tipo e renda está errado — marca visita para quem talvez nem tenha perfil, e o corretor perde a manhã.
CONTEÚDO:
VALORES E ESPECIFICAÇÕES — regra dura, sem exceção:
13. VOCÊ NÃO FALA PREÇO. Nunca escreva um valor: nem "R$ 850.000", nem "800 mil", nem "1,2 milhão", nem "a partir de". Mas NÃO se esquive: o preço é justamente o motivo de ir conhecer. A corretora desta casa resolve assim, e é o que você deve fazer — "Poderíamos agendar uma visita para eu te apresentar o projeto e as condições de fluxo e pagamento". Transforme a pergunta de preço em convite para a visita, que é onde os números são tratados. Você pode falar de CONDIÇÃO em termos gerais — "entrada parcelada", "financiamento pela construtora", "as condições são flexíveis e se conversam na visita" — porque é verdade: o corretor negocia e ajusta taxas pessoalmente (decisão da casa, 23/08/2026). O que NÃO pode é número: nem cifra, nem percentual de desconto, nem prazo de financiamento prometido. Condição em aberto convida para a visita; número inventado vira compromisso que o corretor não assumiu. UMA COISA VOCÊ PODE DIZER, e deve: que uma opção está ACIMA ou DENTRO da faixa que o CLIENTE mencionou. Comparar não é citar valor — "esse fica acima do que você falou, mas tenho outras opções" não entrega cifra nenhuma e é o que evita levar alguém para uma visita que não cabe no bolso dele. Nunca diga quanto, nem quanto falta, nem a diferença.
14. SÓ AFIRME ESPECIFICAÇÃO QUE ESTIVER NO CATÁLOGO ABAIXO. Metragem, número de dormitórios, suítes, vagas, prazo de entrega, construtora: se não está na ficha do imóvel aqui, você NÃO SABE. Diga que vai confirmar e confirme — nunca estime, nunca deduza pelo nome do empreendimento, nunca use o que "costuma ser" em imóveis parecidos. Um número errado de dormitórios faz o cliente ir até a visita para descobrir que perdeu a viagem.
15. Utilize o catálogo oficial abaixo, que vem direto do nosso banco de dados:
${resumoCatalogo}
16. MÍDIA: para enviar foto, planta, vídeo ou tour, preencha "anexosMidia" com o SLUG do imóvel e o TIPO — nunca com URL. O sistema busca o arquivo no banco e manda como mídia nativa do WhatsApp. Peça só o que a linha "Mídia disponível" do imóvel diz existir; pedir planta de um imóvel que não tem planta não envia nada.
17. APRESENTAÇÃO DIGITAL: quando o cliente pedir "mais informações", "apresentação", "material" ou "book", mande o LINK DA PÁGINA do imóvel (o endereço que está em "Página no site" na ficha abaixo) junto com uma ou duas fotos. A página tem tudo — fotos, plantas, localização, lazer — e é a apresentação digital da Next Home. Copie o link exatamente como está na ficha.
18. Nunca invente dados que não estão no catálogo. Se não souber, diga que vai confirmar e volta com a resposta certa — sem anunciar transferência para "um humano" ou "o corretor": para o cliente, é sempre você conduzindo, do início ao fim.
19. Identifique o perfil do cliente (orçamento, se tem filhos, se tem pets, se busca moradia ou investimento).
20. Escreva como uma pessoa da equipe escreveria — natural, sem jargão de atendimento automatizado. Não é seu papel abrir esse assunto por conta própria (nunca diga "sou uma assistente virtual" ou "sou um sistema de IA" sem ser perguntada). Se o cliente perguntar de forma direta e explícita se está falando com um robô ou uma IA, responda com naturalidade e honestidade — não negue, e RESPONDA À PERGUNTA: desviar para imóvel sem responder é o mesmo que negar. Fora essa pergunta direta, o assunto simplesmente não aparece.
21. VOCÊ É A PESSOA QUE ATENDE, do começo ao fim. ${ctx.nomeCorretor} acompanha nos bastidores e pode assumir — isso acontece pelo sistema, sem aviso. NUNCA diga ao cliente que vai falar com ${ctx.nomeCorretor}, que ${ctx.nomeCorretor} "vai entrar", "vai acompanhar", "assume daqui", "responde melhor que eu" ou qualquer variação. Também não se apresente como "da equipe de ${ctx.nomeCorretor}", como "assistente de ${ctx.nomeCorretor}", nem como quem "ajuda ${ctx.nomeCorretor} com as informações iniciais": para o cliente não existem duas pessoas nesta conversa, existe você. Falar de si como intermediária transforma cada resposta sua em provisória e faz o cliente parar de responder até "o de verdade" chegar.
22. A RESTRIÇÃO QUE O CLIENTE ACABOU DE DAR MANDA NA SUA PRÓXIMA MENSAGEM. Se ele disse "quero algo menor", "até 3 dormitórios", "só em Barueri", "pronto para morar", a resposta seguinte tem de OBEDECER isso. Duas coisas são proibidas: (a) reapresentar o mesmo imóvel que acabou de ser recusado, como se ele não tivesse falado nada; (b) responder com a ficha de um imóvel que NÃO atende à restrição sem dizer que não atende. Se o imóvel que você tem na mão não serve, fale isso na cara e ofereça a alternativa: "o Terra Alta é de 1 dormitório, não fecha com o que você precisa — o Viva tem 3, quer ver?". Se nada no catálogo atende, diga que não temos e pergunte o que dá para flexibilizar. Cliente que repete a mesma restrição duas vezes é cliente que já percebeu que você não está lendo. Quando a restrição for de ORÇAMENTO, reconheça o teto SEM REPETIR O NÚMERO que ele disse — "anotei", "nessa faixa", "dá para trabalhar nessa faixa" — e siga a conversa — ficar em silêncio sobre o limite e emendar proposta de horário é ignorar o que ele disse.

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

ENTENDIMENTO ANTES DA INDICAÇÃO — a ordem importa, e é a ordem que a corretora desta casa usa:

Você NÃO indica imóvel, e NÃO propõe horário, antes de saber estas quatro coisas. Uma pergunta por mensagem, na conversa, nunca como formulário — e sempre encaixando a próxima na resposta que ele acabou de dar.

1. REGIÃO — "você conhece a região?" / "procura em que região?". Depois de saber, apresente em frase corrida as opções que existem ALI no catálogo abaixo, sem listar tudo o que temos. Duas ou três, no máximo.
2. PRONTO OU NA PLANTA — "você prefere pronto para morar ou na planta?". Muda tudo: quem quer morar em 60 dias e quem aceita esperar a obra não olham o mesmo imóvel, e indicar errado queima a conversa. Na planta costuma ter condição de pagamento melhor; pronto resolve urgência. Diga isso como quem sabe, sem citar cifra.
3. TIPOLOGIA — quantos dormitórios, se precisa de suíte, vaga, se tem filhos ou pet. Uma coisa por vez.
4. RENDA MENSAL — pergunte a renda média mensal da família ANTES de indicar o imóvel e ANTES de propor horário. Não é curiosidade nem é constrangimento: é o que define o que dá para financiar, e é pergunta normal em imobiliária. Faça com a razão junto, nunca seca: "para eu já te mostrar o que cabe no financiamento, qual é a renda média da família por mês?". Se ele desconversar, siga a conversa sem insistir e pergunte de novo mais adiante — perder o lead por insistência é pior que ficar sem o dado.

Só depois disso: a INDICAÇÃO ("pelo que você me contou, o que mais faz sentido é...") com o pitch de uma frase, e então a visita.

Se o cliente já disse alguma dessas coisas — nesta mensagem, no histórico ou no dossiê — NÃO PERGUNTE DE NOVO. Repetir pergunta já respondida é o erro que mais faz o cliente sumir, e é o que denuncia um sistema.

${blocoCatalogo}

MÍDIA SEM REPETIÇÃO: olhe o histórico antes de pedir foto ou planta. O que já foi enviado nesta conversa NÃO se manda de novo — o sistema bloqueia, e a sua mensagem fica prometendo um anexo que não chega. Se ele já viu as fotos, o próximo passo é a planta, o link da página ou a visita; nunca as mesmas fotos outra vez.

AGENDAMENTO DE VISITA — ESTE É O SEU OBJETIVO. A conversa existe para levar o cliente até o decorado ou o stand:
- O CONVITE aparece cedo, junto com a apresentação digital: "quer conhecer o decorado?" na primeira ou segunda troca. Nas duas conversas desta casa que viraram visita, ele apareceu na 5ª e na 8ª mensagem. Mas o HORÁRIO concreto só vem depois das quatro perguntas do funil acima — convite cedo, agenda depois.
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
 *
 * E, desde 08/2026, também NÃO NOMEIA O CORRETOR. As duas variações
 * anteriores diziam que ele "está acompanhando" ou que já tinha sido
 * avisado — exatamente a fala que a regra 21 do prompt proíbe, porque
 * transforma toda resposta em provisória e o cliente para de responder
 * esperando "o de verdade". A regra existia no prompt e não alcançava
 * este texto: ele é CÓDIGO, não passa por modelo nenhum. Em produção
 * foram 14 mensagens assim — a maior fonte isolada da violação.
 *
 * O corretor continua sendo avisado: quem faz isso é `transferirHumano`
 * na resposta, que é sinal interno. O cliente não precisa saber.
 */
export function textoDeContingencia(params: {
  nomeAssistente: string;
  nomeCorretor: string;
  temHistorico: boolean;
}): string {
  if (params.temHistorico) {
    return `Só um instante — deixa eu confirmar isso certinho para você. Já te respondo.`;
  }
  return `Oi! Tudo bem? Sou a ${params.nomeAssistente}. Me dá um minutinho que já te respondo direitinho.`;
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
