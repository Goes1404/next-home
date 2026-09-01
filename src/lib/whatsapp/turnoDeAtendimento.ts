import "server-only";

import type { Empreendimento } from "@/lib/types";
import { gerarRespostaIA, type RespostaAgenteIA } from "./aiAgent";
import type { AnexoResolvido } from "./resolverMidia";
import { buscarExemplosFewShot } from "./aprendizadoContinuo";
import { catalogoParaAtendimento } from "./focoDaConversa";
import { capacidadeEstaPendente } from "./funilQualificacao";
import { blocoPerguntaIgnorada, perguntaIgnorada } from "./perguntaIgnorada";
import { blocoDadoPedido, dadoPedido } from "./dadoPedido";
import { regrasCondicionais } from "./regrasCondicionais";
import {
  blocoNaoRepitaHorario,
  horariosJaOferecidos,
  semOsJaOferecidos,
} from "./ofertasDeVisita";
import { blocoDeHorarios, type HorarioDeVisita } from "@/lib/crm/agendaDeVisitas";
import { catalogoTemPrazo } from "./prazoEntrega";
import { sanearRespostaIA } from "./guardrails";
import { dividirEmMensagens } from "./chunking";
import { separarRajada, type Fala } from "./rajada";
import type { DossieClienteIA } from "./types";

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

  const { catalogo: catalogoDoPrompt, foco } = catalogoParaAtendimento({
    catalogo: pedido.catalogo,
    mensagemAtual: textoDaVez,
    historico: historicoAnterior,
    dossie: pedido.dossie,
  });

  /*
   * A capacidade entra como PENDÊNCIA calculada, não como regra genérica:
   * o eval da v22 pegou a IA indicando imóvel sem perguntá-la, com a regra
   * do funil já no prompt. Satisfeita por faixa de valor OU renda — ver
   * funilQualificacao. Mora aqui, no caminho único, para os quatro
   * chamadores enxergarem a mesma conversa (a divergência playground ×
   * webhook já custou caro duas vezes).
   */
  const capacidadePendente = capacidadeEstaPendente({
    dossie: pedido.dossie,
    historico: historicoAnterior,
    mensagemAtual: textoDaVez,
    catalogo: pedido.catalogo,
  });

  /*
   * O cliente está repetindo uma pergunta que ficou sem resposta?
   *
   * Medido no eval da v25: 27 repetições em 16 conversas, e uma delas com
   * a MESMA pergunta doze vezes. A régua é o comportamento dele, não uma
   * rubrica: se ele refaz a pergunta, ela não foi respondida.
   */
  const ignorada = perguntaIgnorada({
    historico: historicoAnterior,
    mensagemAtual: textoDaVez,
  });

  /*
   * O que ela JÁ ofereceu de horário nesta conversa.
   *
   * O eval da v26 mediu a última fonte de repetição a sobrar: os mesmos
   * "sábado às 10h ou às 11h" três vezes, contra um cliente que nem queria
   * falar de visita. O bloco de horários já MANDAVA não repetir — instrução
   * de prompt é probabilística.
   *
   * Duas defesas com a mesma conta, feita uma vez só: a lista real perde os
   * horários já oferecidos (o que ele não vê, não oferece) e, quando não há
   * agenda configurada — que é o caso dos 8 corretores hoje —, um bloco
   * nomeia o que saiu e manda devolver a escolha ao cliente.
   */
  /*
   * O cliente pediu um dado que temos?
   *
   * Alvo vindo da primeira análise de erros contada (16 conversas da v25):
   * "não respondeu a pergunta" em 10 delas e "não informou dado permitido"
   * em 43% das 134 anotações. E a permissão do piso, já no prompt, só era
   * usada em ~30% das conversas — instrução é probabilística; isto não é.
   *
   * Vem DEPOIS de `perguntaIgnorada` no prompt de propósito: quando o
   * cliente já repetiu, o que precisa ganhar é a ordem de responder o que
   * ficou em aberto; este bloco entra logo abaixo, entregando o dado. Os
   * dois se reforçam — um diz "responda", o outro diz "com isto".
   */
  const pedido_ = dadoPedido({
    mensagem: textoDaVez,
    imovel: foco ? (catalogoDoPrompt.find((e) => e.slug === foco.slug) ?? null) : null,
    catalogo: catalogoDoPrompt,
  });

  const oferecidos = horariosJaOferecidos(historicoAnterior);
  const blocoHorariosReais = blocoDeHorarios(
    semOsJaOferecidos(pedido.horariosReais ?? [], oferecidos.assinaturas),
  );

  const bruta = await gerarRespostaIA(
    {
      ...pedido.identidade,
      catalogo: catalogoDoPrompt,
      historicoMensagens: historicoAnterior,
      exemplosFewShot,
      dossie: pedido.dossie,
      instrucaoExtra: pedido.instrucaoExtra,
      foco,
      capacidadePendente,
      blocoPerguntaIgnorada: ignorada ? blocoPerguntaIgnorada(ignorada) : undefined,
      blocoDadoPedido: pedido_ ? blocoDadoPedido(pedido_) : undefined,
      blocoRegrasCondicionais: regrasCondicionais({ baloesDaVez: vezDoCliente.length }),
      blocoHorariosReais,
      blocoNaoRepitaHorario: blocoNaoRepitaHorario(oferecidos),
      /*
       * O aviso olha o catálogo QUE FOI AO PROMPT, não o completo: é sobre
       * o que ela pode citar nesta resposta. O guardrail
       * (`removerPrazoInventado`) segue como rede depois.
       */
      semPrazoCadastrado: !catalogoTemPrazo(catalogoDoPrompt),
    },
    vezDoCliente.length > 0
      ? vezDoCliente
      : "(o cliente não respondeu; escreva a mensagem de retomada)",
  );

  /*
   * O guardrail recebe o histórico COMPLETO, não o recortado: é dele que
   * sai `midiasJaEnviadas`, e a nota de auditoria de um anexo mandado há
   * dois turnos precisa continuar visível — senão a IA reenvia a mesma
   * foto, que é o loop que ela existe para cortar.
   */
  const saneada = sanearRespostaIA(
    bruta,
    pedido.catalogo,
    pedido.historico,
    pedido.identidade.slugCorretor,
    pedido.identidade.nomeAssistente,
  );

  const partes = dividirEmMensagens(saneada.resposta.textoResposta);

  return {
    resposta: saneada.resposta,
    respostaBruta: bruta,
    baloes: partes.length > 0 ? partes : [saneada.resposta.textoResposta],
    anexos: saneada.anexos,
    foco,
    vezDoCliente,
    historicoAnterior,
    bloqueios: saneada.anexosBloqueados + saneada.slugsBloqueados,
  };
}
