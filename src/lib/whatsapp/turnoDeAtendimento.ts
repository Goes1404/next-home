import "server-only";

import type { Empreendimento } from "@/lib/types";
import { gerarRespostaIA, type RespostaAgenteIA } from "./aiAgent";
import type { AnexoResolvido } from "./resolverMidia";
import { buscarExemplosFewShot, contarExemplosDoAprendizado } from "./aprendizadoContinuo";
import {
  catalogoParaAtendimento,
  imoveisCitados,
  palpiteDeNome,
  removerIndicacaoPrematura,
} from "./focoDaConversa";
import {
  aceiteDeVisitaValido,
  blocoDaJogada,
  blocoDeQualificacao,
  travaDeQualificacao,
  estadoDaConversa,
  planejarJogada,
  type Jogada,
} from "./jogada";
import { blocoDaMemoria } from "./memoriaDaConversa";
import { regrasCondicionais } from "./regrasCondicionais";
import {
  blocoNaoRepitaHorario,
  horariosJaOferecidos,
  semOsJaOferecidos,
} from "./ofertasDeVisita";
import { blocoDeHorarios, type HorarioDeVisita } from "@/lib/crm/agendaDeVisitas";
import { catalogoTemPrazo } from "./prazoEntrega";
import { catalogoTemAcabamento } from "./acabamentoInventado";
import { sanearRespostaIA } from "./guardrails";
import { dividirEmMensagens } from "./chunking";
import { separarRajada, type Fala } from "./rajada";
import type { DossieClienteIA } from "./types";
import { PARAMETROS_PADRAO } from "@/lib/credito/parametrosPadrao";
import type { ParametrosCredito } from "@/lib/credito/tipos";
import {
  blocoDeCapacidade,
  escolherPorCapacidade,
  imoveisDaEscolha,
  rendaDaFala,
  rendaNaConversa,
  tetoDeCompra,
} from "./capacidadeDeCompra";
import { removerAnuncioDeAnexo } from "./afirmacoesSemLastro";
import { instrucaoContraRepeticao } from "./repeticao";
import { ORCAMENTO_AGENTE_MS } from "./llm";

/** Abaixo disso, a segunda chamada não cabe no orçamento do agente. */
const MINIMO_PARA_REFAZER_MS = 6_000;

/**
 * UM turno de atendimento: da conversa até os balões prontos para sair.
 *
 * Esta função existe por um defeito que já aconteceu DUAS vezes neste
 * projeto, sempre da mesma forma. O webhook monta o prompt de um jeito, e
 * quem quer exercitar o agente — playground, follow-up, eval — remonta por
 * fora. Aí um dos caminhos ganha uma etapa nova e os outros não:
 *
 * - o playground pulava few-shot e ranking, então o corretor aprovava um
 *   comportamento no teste e recebia outro na rua;
 * - o eval mandava o catálogo CRU, sem ranking nem encolhimento por foco,
 *   ou seja, media um prompt que produção nenhuma via.
 *
 * As duas foram corrigidas copiando o preparo do webhook para o outro
 * arquivo — o que conserta a divergência daquela vez e garante a próxima.
 * Com o eval de conversa entrando como QUARTO chamador, copiar de novo
 * seria a terceira. Agora existe um lugar só.
 *
 * ## O que esta função deliberadamente NÃO faz
 *
 * Gravar mensagem, enviar pelo provedor, escrever telemetria, extrair
 * dossiê, avisar o corretor. Isso são efeitos sobre o MUNDO, e o eval não
 * pode disparar nenhum deles — um teste que manda WhatsApp de verdade não
 * é teste, é incidente.
 *
 * Ela devolve o que RESPONDER. O que fazer com isso é decisão de quem
 * chamou.
 */

export type IdentidadeDoAtendimento = {
  nomeCorretor: string;
  slugCorretor?: string;
  creciCorretor: string;
  telefoneCorretor: string;
  nomeAssistente: string;
  tomVoz: string;
};

export type PedidoDeTurno = {
  identidade: IdentidadeDoAtendimento;
  /**
   * O catálogo COMPLETO. O ranking e o encolhimento por foco acontecem
   * aqui dentro — quem chama não deve pré-filtrar, senão volta a existir
   * mais de uma régua de "o que a IA enxerga".
   */
  catalogo: Empreendimento[];
  /**
   * A conversa em ordem cronológica, JÁ INCLUINDO os balões que o cliente
   * acabou de mandar. A separação entre "o que já foi respondido" e "o que
   * está em aberto" é feita aqui (ver `rajada.ts`).
   */
  historico: Fala[];
  dossie?: DossieClienteIA | null;
  /** Instrução de cenário (ex.: follow-up de reengajamento). */
  /**
   * A MEMÓRIA da conversa (0110). Vem de fora porque este módulo não toca no
   * banco — é o que permite o eval medir o mesmo turno sem efeito sobre o
   * mundo, e é por isso que ele existe.
   */
  memoria?: string | null;
  /** Horas desde a última fala. De fora pelo mesmo motivo: relógio aqui
   * dentro tornaria o turno não reproduzível. */
  horasDesdeAUltimaFala?: number;
  instrucaoExtra?: string;
  /**
   * Horários reais da agenda do corretor (0073), CRUS. Vem de fora porque
   * este módulo não toca no banco — é o que permite o eval medir o mesmo
   * turno sem efeito sobre o mundo.
   *
   * Crus, e não o bloco pronto, porque a lista precisa ser filtrada aqui:
   * é aqui que se sabe o que já foi oferecido nesta conversa. Montar o
   * bloco fora significaria fazer essa conta em dois lugares.
   */
  horariosReais?: readonly HorarioDeVisita[];
  /**
   * Os parâmetros de crédito do banco (`getParametrosCredito`). Ausente vale
   * o seed em código: o eval e o playground não têm cache do Next.
   */
  parametrosCredito?: ParametrosCredito;
  /**
   * Sobrescreve a vez do cliente. Existe para o follow-up, em que NINGUÉM
   * falou — é o silêncio que motiva a mensagem.
   */
  vezDoCliente?: string[];
  /**
   * Sem isto, não há recuperação de exemplos. É o caso do eval e de
   * qualquer execução offline: `buscarExemplosFewShot` vai ao banco, e um
   * teste não deveria depender de haver banco.
   */
  fewShot?: { corretorId: string; conversaAtualId?: string };
};

export type TurnoDeAtendimento = {
  /** Já saneada pelos guardrails. */
  resposta: RespostaAgenteIA;
  /**
   * A resposta ANTES dos guardrails — o que o modelo de fato escreveu.
   *
   * Existe para o eval: medir depois do saneamento mediria a rede de
   * segurança, não o prompt ("prompt que só acerta porque o filtro apaga
   * o erro é prompt que ainda erra"). Quem atende o cliente usa
   * `resposta`; ninguém deve enviar isto.
   */
  respostaBruta: RespostaAgenteIA;
  /** O texto quebrado em balões, na ordem de envio. */
  baloes: string[];
  /**
   * Anexos resolvidos contra o catálogo — slug e tipo viraram URL real.
   * O tipo vem estreito (`foto | planta | video | tour360`) de propósito:
   * é ele que o provedor exige, e alargar aqui obrigaria o chamador a
   * reafirmar o que o guardrail já garantiu.
   */
  anexos: AnexoResolvido[];
  foco: { slug: string; nome: string } | null;
  /** Os balões do cliente que este turno está respondendo. */
  vezDoCliente: string[];
  /** O histórico SEM a vez do cliente — o que foi ao prompt como contexto. */
  historicoAnterior: Fala[];
  /** Anexos e slugs que o guardrail recusou. Zero é o esperado. */
  bloqueios: number;
  /**
   * A jogada que o planner escolheu para esta mensagem.
   *
   * Ela já era calculada aqui e morria aqui. Sai para que a telemetria possa
   * dizer POR QUE a IA respondeu o que respondeu — e sai DAQUI, não de um
   * `planejarJogada` chamado de novo lá fora: duas contas da mesma decisão
   * divergem, e essa divergência já custou uma sessão neste projeto
   * (`montarResumo`).
   */
  jogada: Jogada;
  /** Quantos exemplos de conversa real entraram no prompt. */
  fewShot: number;
};

export async function executarTurnoDeAtendimento(
  pedido: PedidoDeTurno,
): Promise<TurnoDeAtendimento> {
  const { historico: historicoAnterior, pendentes } = separarRajada(pedido.historico);

  /*
   * Três origens possíveis para "o que estamos respondendo", nesta ordem:
   * o que o chamador declarou (follow-up), os balões em aberto (webhook,
   * eval) ou nada. Vazio é estado legítimo: é o follow-up.
   */
  const vezDoCliente = pedido.vezDoCliente ?? pendentes;
  const textoDaVez = vezDoCliente.join(" | ");

  /*
   * Foco, ranking e few-shot leem a vez INTEIRA: o imóvel citado pode
   * estar no primeiro balão e a pergunta no último.
   */
  const exemplosFewShot = pedido.fewShot
    ? await buscarExemplosFewShot({
        corretorId: pedido.fewShot.corretorId,
        mensagemAtual: textoDaVez,
        historico: historicoAnterior,
        catalogo: pedido.catalogo,
        conversaAtualId: pedido.fewShot.conversaAtualId,
      })
    : undefined;

  /*
   * O QUE CABE NO BOLSO, calculado (decisão de 29/09/2026): a renda que ele
   * disse passa pelo mesmo simulador do site, e o bloco de capacidade diz
   * quais imóveis cabem. O orçamento que ELE disse, se disse, vence a conta.
   *
   * A renda dita AGORA vence a da ficha (é a correção mais recente); a da
   * ficha vence o histórico, porque quem a escreve é a extração, que lê
   * "1500 do meu marido e 2644 meu" melhor que um regex.
   */
  const ultimaDoBot = [...historicoAnterior].reverse().find((m) => m.remetente === "bot")?.texto ?? "";
  const perguntouRenda = /\brenda\b/i.test(ultimaDoBot) && ultimaDoBot.includes("?");
  const rendaDoCliente =
    rendaDaFala(textoDaVez, perguntouRenda) ??
    pedido.dossie?.rendaMensal ??
    rendaNaConversa(historicoAnterior, textoDaVez);
  const teto = tetoDeCompra(
    { rendaMensal: rendaDoCliente, orcamentoMax: pedido.dossie?.orcamentoMax ?? null },
    pedido.parametrosCredito ?? PARAMETROS_PADRAO,
  );

  const { catalogo: catalogoRanqueado, foco } = catalogoParaAtendimento({
    catalogo: pedido.catalogo,
    mensagemAtual: textoDaVez,
    historico: historicoAnterior,
    dossie: pedido.dossie,
    tetoPelaRenda: teto?.origem === "renda" ? teto.valor : null,
  });

  /*
   * A escolha corre sobre o catálogo INTEIRO, não sobre os dez do prompt: o
   * imóvel que cabe podia estar fora do ranking (produção, 01/10/2026). Os
   * que o bloco nomeia entram no prompt com a ficha, senão a IA indicaria um
   * nome sem saber nada dele.
   */
  const escolha = teto
    ? escolherPorCapacidade(pedido.catalogo, teto.valor, {
        regiao: pedido.dossie?.regiaoInteresse ?? null,
        dormitorios: pedido.dossie?.dormitoriosMin ?? null,
      })
    : null;
  const noPrompt = new Set(catalogoRanqueado.map((e) => e.slug));
  const catalogoDoPrompt = [
    ...catalogoRanqueado,
    ...(escolha ? imoveisDaEscolha(escolha).filter((e) => !noPrompt.has(e.slug)) : []),
  ];

  /*
   * PLANNER: a jogada desta mensagem é decidida AQUI, em código, antes de
   * qualquer chamada ao modelo (`jogada.ts`).
   *
   * Ela absorve o que antes eram quatro blocos competindo no topo do
   * prompt — pergunta ignorada, dado pedido, capacidade pendente e a ordem
   * do funil — e devolve UMA tarefa. Quatro instruções disputando a mesma
   * decisão era a doença: medimos que a permissão do piso, escrita no
   * prompt, era obedecida em 30% das vezes.
   *
   * É determinística de propósito: roda igual no webhook e no eval, sem
   * custar chamada, e "não repita a pergunta anterior" deixa de ser súplica
   * e vira comparação de conjuntos. O que era medido no eval da v25 (27
   * repetições do cliente, uma pergunta feita doze vezes) e da v26 (o mesmo
   * horário três vezes) passa a ser impossível por construção.
   */
  /*
   * Os imóveis que o CLIENTE trouxe (o foco, que pode vir do anúncio ou da
   * campanha que ele respondeu, e os que ele citou) e se a IA já indicou
   * algum depois de ele começar a falar. A mensagem de campanha que abriu a
   * conversa não conta como indicação: ela veio antes da primeira pergunta.
   */
  const falasDoCliente = historicoAnterior.filter((m) => m.remetente === "cliente").map((m) => m.texto);
  const imoveisDoCliente = new Set<string>([
    ...(foco ? [foco.slug] : []),
    ...[...falasDoCliente, textoDaVez].flatMap((t) => imoveisCitados(t, pedido.catalogo)),
  ]);
  const primeiraDoCliente = historicoAnterior.findIndex((m) => m.remetente === "cliente");
  const jaIndicouImovel =
    primeiraDoCliente >= 0 &&
    historicoAnterior
      .slice(primeiraDoCliente)
      .some((m) => m.remetente === "bot" && imoveisCitados(m.texto, pedido.catalogo).length > 0);

  const imovelEmFoco = foco ? (catalogoDoPrompt.find((e) => e.slug === foco.slug) ?? null) : null;
  const estado = estadoDaConversa({
    historico: historicoAnterior,
    mensagemAtual: textoDaVez,
    dossie: pedido.dossie,
    imovelEmFoco,
    catalogo: catalogoDoPrompt,
    horasDesdeAUltimaFala: pedido.horasDesdeAUltimaFala,
    jaIndicouImovel,
  });
  const jogada = planejarJogada(estado);

  /*
   * PERGUNTAS ANTES DA INDICAÇÃO (decisão de 28/09/2026). Enquanto faltar
   * pergunta do funil, a IA só fala dos imóveis que o cliente trouxe. Não
   * vale no retorno sem fala nova do cliente (follow-up), que tem regra
   * própria.
   */
  const pendenteDaTrava = vezDoCliente.length > 0 ? travaDeQualificacao(jogada, estado) : null;

  /*
   * O que ela JÁ ofereceu de horário nesta conversa: a lista real perde os
   * horários já oferecidos (o que ele não vê, não oferece) e, sem agenda
   * configurada, um bloco nomeia o que saiu.
   */
  const oferecidos = horariosJaOferecidos(historicoAnterior);
  const blocoHorariosReais = blocoDeHorarios(
    semOsJaOferecidos(pedido.horariosReais ?? [], oferecidos.assinaturas),
  );

  /*
   * Nome de imóvel escrito errado ("vrita" = Vitra): sem foco, pergunta se é
   * esse, em vez de dizer que não tem (ver `palpiteDeNome`).
   */
  const palpite = foco ? null : palpiteDeNome(textoDaVez, pedido.catalogo);
  const blocoPalpite = palpite
    ? `ATENÇÃO: ele escreveu "${palpite.escrito}", que parece ser o ${palpite.nome}, do nosso catálogo. Antes de qualquer outra coisa, pergunte se é o ${palpite.nome} que ele quer dizer. NUNCA diga que não tem, nem que vai confirmar com o corretor: o imóvel é nosso.`
    : "";

  const ctxAgente: Parameters<typeof gerarRespostaIA>[0] = {
      ...pedido.identidade,
      catalogo: catalogoDoPrompt,
      historicoMensagens: historicoAnterior,
      exemplosFewShot,
      dossie: pedido.dossie,
      instrucaoExtra: pedido.instrucaoExtra,
      foco,
      blocoMemoria: blocoDaMemoria(pedido.memoria ?? null),
      blocoJogada: [
        blocoDaJogada(jogada, { nomeDoFoco: foco?.nome ?? null }),
        pendenteDaTrava
          ? blocoDeQualificacao(pendenteDaTrava, {
              nomeDoFoco: foco?.nome ?? null,
              jogadaJaPergunta: jogada.tipo === "perguntar",
            })
          : "",
        teto && escolha && !pendenteDaTrava ? blocoDeCapacidade(teto, escolha) : "",
        blocoPalpite,
      ]
        .filter(Boolean)
        .join("\n\n"),
      blocoRegrasCondicionais: regrasCondicionais({ baloesDaVez: vezDoCliente.length }),
      blocoHorariosReais,
      blocoNaoRepitaHorario: blocoNaoRepitaHorario(oferecidos),
      /*
       * O aviso olha o catálogo QUE FOI AO PROMPT, não o completo: é sobre
       * o que ela pode citar nesta resposta. O guardrail
       * (`removerPrazoInventado`) segue como rede depois.
       */
      semPrazoCadastrado: !catalogoTemPrazo(catalogoDoPrompt),
      semAcabamentoCadastrado: !catalogoTemAcabamento(catalogoDoPrompt),
  };
  const mensagemParaIA =
    vezDoCliente.length > 0 ? vezDoCliente : "(o cliente não respondeu; escreva a mensagem de retomada)";
  const bruta = await gerarRespostaIA(ctxAgente, mensagemParaIA);

  /*
   * O guardrail recebe o histórico COMPLETO, não o recortado: é dele que
   * sai `midiasJaEnviadas`, e a nota de auditoria de um anexo mandado há
   * dois turnos precisa continuar visível — senão a IA reenvia a mesma
   * foto, que é o loop que ela existe para cortar.
   */
  /*
   * Confirmação de visita que o cliente não deu não passa: o campo grava a
   * visita no CRM e avisa o corretor (ver `aceiteDeVisitaValido`). Sem o
   * campo, o guardrail também corta a frase que afirma a confirmação.
   */
  const conferir = (bruta: Awaited<ReturnType<typeof gerarRespostaIA>>) => {
    const confirmacaoInventada =
      bruta.visitaProposta?.confirmadaPeloCliente === true && !aceiteDeVisitaValido(jogada, Boolean(foco));
    if (confirmacaoInventada) {
      console.warn(`[turno] confirmação de visita sem aceite do cliente descartada (jogada ${jogada.tipo})`);
    }
    const brutaConferida = confirmacaoInventada
      ? { ...bruta, visitaProposta: { ...bruta.visitaProposta!, confirmadaPeloCliente: false } }
      : bruta;

    /*
     * A rede da trava: o que o prompt pediu e o modelo não cumpriu. Frase que
     * indica imóvel que o cliente não trouxe sai, e anexo, recomendação e link
     * do catálogo desses imóveis também.
     */
    const semIndicacao = pendenteDaTrava
      ? removerIndicacaoPrematura(brutaConferida.textoResposta ?? "", pedido.catalogo, imoveisDoCliente)
      : null;
    if (semIndicacao?.cortou) console.warn(`[turno] indicação antes da qualificação cortada (falta ${pendenteDaTrava})`);
    const anexosNaHora = (brutaConferida.anexosMidia ?? []).filter((a) => imoveisDoCliente.has(a.slug));
    const textoNaHora = semIndicacao?.texto ?? brutaConferida.textoResposta;
    const brutaNaHora = pendenteDaTrava
      ? {
          ...brutaConferida,
          // Tirou todos os anexos: tira também a frase que diz que eles foram.
          textoResposta:
            anexosNaHora.length === 0 && (brutaConferida.anexosMidia ?? []).length > 0
              ? removerAnuncioDeAnexo(textoNaHora).texto
              : textoNaHora,
          anexosMidia: anexosNaHora,
          imoveisRecomendados: (brutaConferida.imoveisRecomendados ?? []).filter((r) => imoveisDoCliente.has(r.slug)),
          mandarCatalogo: false,
        }
      : brutaConferida;

    return sanearRespostaIA(
      brutaNaHora,
      pedido.catalogo,
      pedido.historico,
      pedido.identidade.slugCorretor,
      pedido.identidade.nomeAssistente,
      textoDaVez,
    );
  };

  let respostaBruta = bruta;
  let saneada = conferir(bruta);

  /*
   * A resposta repetia o que ela já tinha dito, e sobrou pouco depois do
   * corte: em vez de mandar a frase pronta da guarda ("me conta um pouco
   * mais do que você procura"), pede ao modelo UMA resposta nova, dizendo o
   * que ele ia repetir. Eval de 28/09/2026: a frase pronta saiu em 10 de 16
   * conversas e era a marca mais robótica da assistente.
   *
   * Só com tempo sobrando dentro do mesmo orçamento do agente: somar uma
   * segunda chamada inteira estouraria os 60s da função do webhook.
   */
  const restante = ORCAMENTO_AGENTE_MS - bruta.meta.latenciaMs;
  if (saneada.repeticaoSubstituida && !bruta.meta.fallback && restante >= MINIMO_PARA_REFAZER_MS) {
    const nova = await gerarRespostaIA(
      {
        ...ctxAgente,
        instrucaoExtra: [ctxAgente.instrucaoExtra, instrucaoContraRepeticao(bruta.textoResposta)]
          .filter(Boolean)
          .join("\n\n"),
        orcamentoMs: restante,
      },
      mensagemParaIA,
    );
    if (!nova.meta.fallback) {
      const refeita = conferir(nova);
      console.warn(`[turno] resposta repetida refeita pelo modelo (${refeita.repeticaoSubstituida ? "repetiu de novo" : "ok"})`);
      if (!refeita.repeticaoSubstituida) {
        respostaBruta = { ...nova, meta: { ...nova.meta, latenciaMs: bruta.meta.latenciaMs + nova.meta.latenciaMs } };
        saneada = { ...refeita, resposta: { ...refeita.resposta, meta: respostaBruta.meta } };
      }
    }
  }

  const partes = dividirEmMensagens(saneada.resposta.textoResposta);

  return {
    resposta: saneada.resposta,
    respostaBruta,
    baloes: partes.length > 0 ? partes : [saneada.resposta.textoResposta],
    anexos: saneada.anexos,
    foco,
    vezDoCliente,
    historicoAnterior,
    bloqueios: saneada.anexosBloqueados + saneada.slugsBloqueados,
    jogada,
    fewShot: contarExemplosDoAprendizado(exemplosFewShot),
  };
}
