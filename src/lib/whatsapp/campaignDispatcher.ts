import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { grupoSuspenso } from "@/lib/planos/cobrancaDoGrupo";
import { dentroDaJanela, dentroDaJanelaDoCorretor } from "./antiBan";
import { varrerQuedasDeNumero } from "./avisoDeQueda";
import { rederrubarNumerosRecusados } from "./recusaPendente";
import { protegerNumerosQueCairam } from "./quedaDoNumero";
import { nomesDaPessoa, variarSemRepetir } from "./campaignQueue";
import { primeiroNomeUtil } from "@/lib/leads/nomeExibido";
import { lerCasaDoGrupo } from "./casaDoGrupo";
import { textosRecentesDoNumero } from "./textosDoNumero";
import {
  ajustarSaudacaoAoHorario,
  CICLOS_ATE_PAUSAR,
  fatosDaLista,
  MOTIVO_PAUSA_POR_TEXTO,
  MOTIVO_TEXTO_PARECIDO,
  MOTIVO_TEXTO_SEM_IA,
  type TextoAnterior,
  versoesDiferentes,
} from "./variacaoDeTexto";
import { consultarEstadoConexao, enviarMensagemWhatsapp } from "./provider";
import { ehFalhaDeSessao, MOTIVO_SESSAO_CAIU } from "./sessaoCaida";
import { normalizarTelefoneBr } from "./telefone";
import { aplicarVencedoras } from "./vencedoraAB";
import { HORAS_DA_GUARDA_HUMANA, MOTIVO_CONVERSA_RECENTE } from "./contextoDaCampanha";
import {
  classificarFalhaDeEnvio,
  falhaContaParaDisjuntor,
  motivoDoMesmoTelefone,
  motivoParaNaoEnviar,
  MOTIVO_ENVIO_INCERTO,
  MOTIVO_TELEFONE_INVALIDO,
  resolverHorarios,
  type ContextoTemplate,
  type LeadNoEnvio,
} from "./listaDeTransmissao";
import { horariosDeVisita } from "@/lib/crm/agendaDoCorretor";
import { enviarMidiasDaLista, type MidiaDaLista } from "./midiasDaLista";
import {
  amanhaCedoEmSaoPaulo,
  diasDesde,
  inicioDoPrimeiroContato,
  motivoDoPrimeiroContato,
  vagasDePrimeiroContato,
} from "./primeiroContato";
import { contarPrimeirosContatos, nuncaFalouComOCorretor } from "./primeiroContatoNoEnvio";
import { alimentarListasVivas } from "./listasVivas";
import { MOTIVO_SEM_WHATSAPP, motivoDePausaAutomatica, sinaisDesdeABase } from "./pausaAutomatica";
import { lerSinaisDaLista } from "./sinaisDaLista";
import {
  avancarLeadParaPrimeiroContato,
  destravarDisparo,
  registrarTentativaDeContato,
  ativarIaNaConversa,
  gravarMensagem,
  obterOuCriarConversa,
  devolverCotaCampanha,
  liberarFilaDaSessao,
  marcarSessaoCaida,
  registrarResultadoEnvio,
  reservarCotaCampanha,
  sincronizarConexaoInstancia,
  travarDisparo,
} from "./repositorio";

/**
 * Disparador da fila de campanhas.
 *
 * `montarFilaCampanha` (campaignQueue.ts) só CALCULA a fila — texto e
 * horário de cada item — e para aí, de propósito, para ser testável sem
 * rede. Quem de fato manda a mensagem quando o horário chega é este módulo.
 *
 * ## Como a fila anda sozinha
 *
 * O problema real nunca foi o envio em si: era não existir nada batendo
 * neste módulo com frequência. O cron da Vercel no plano Hobby só pode
 * rodar 1x por dia (ver docs/MEMORIA.md — um schedule mais frequente faz a
 * Vercel RECUSAR o deploy inteiro), e o botão do painel manda 3 mensagens e
 * para. Uma campanha de 40 leads levava semanas, ou dependia do corretor
 * clicando o dia todo.
 *
 * Agora são três gatilhos, todos caindo na mesma função:
 *
 *   1. **Auto-encadeamento** (`/api/cron/campanhas`): cada chamada trabalha
 *      por ~45s e, se ainda sobrou fila que ela conseguiria despachar,
 *      agenda a próxima chamada de si mesma. É isso que faz o disparo ser
 *      automático de verdade sem depender de cron externo nenhum.
 *   2. **pg_cron no Supabase** (migration 0025, opcional): bate no endpoint
 *      a cada minuto. É a rede de segurança — se uma corrente morrer no
 *      meio (deploy, erro, timeout), o próximo minuto a recomeça.
 *   3. **Cron diário da Vercel + botão "Processar fila agora"**: pontos de
 *      partida, mantidos.
 *
 * Como os três podem chegar juntos, cada instância é despachada sob uma
 * trava (`travar_disparo`, migration 0024). Sem ela, dois disparadores leem
 * a mesma linha `pendente` e mandam a mesma mensagem duas vezes no mesmo
 * segundo — rajada e texto repetido, os dois padrões que a fila existe para
 * evitar.
 *
 * O espaçamento anti-ban continua sendo o de `agendado_para`: este módulo
 * NUNCA manda um item antes da hora dele. Quando o próximo item está perto,
 * ele espera de fato (até `ESPERA_MAXIMA_MS`) em vez de devolver a chamada
 * vazia — é o que permite uma corrente despachar mensagem a cada ~50s em
 * vez de queimar uma invocação por mensagem.
 */

/** Teto de mensagens por instância em UMA chamada. Baixo de propósito. */
const ITENS_POR_INSTANCIA_POR_CHAMADA = 3;
const LIMITE_TOTAL_PADRAO = 20;

/**
 * Tempo de trabalho de uma chamada. Abaixo do `maxDuration = 60` da rota,
 * com folga para a última mensagem terminar e a resposta ser escrita.
 */
const ORCAMENTO_PADRAO_MS = 45_000;

/** Quanto vale a pena esperar pelo próximo item em vez de encerrar a chamada. */
const ESPERA_MAXIMA_MS = 40_000;

/**
 * Margem que precisa sobrar do orçamento para UM envio caber inteiro
 * (variação por IA + chamada ao provedor + gravações).
 *
 * Proporcional ao orçamento, e não fixa: o botão do painel trabalha com um
 * orçamento curto (a tela está esperando resposta), e uma margem fixa de
 * 20s maior que o orçamento inteiro fazia a checagem "ainda tenho tempo?"
 * dar falso já na primeira volta — o clique voltava "0 processados" sem ter
 * tentado nada.
 */
function margemDeEnvio(orcamentoMs: number): number {
  return Math.min(15_000, Math.floor(orcamentoMs / 3));
}

/** Validade da trava. Maior que o orçamento: cobre uma chamada que morre sem destravar. */
const TRAVA_SEGUNDOS = 120;

/** Depois disso, o item vira erro definitivo em vez de consumir cota para sempre. */
const MAX_TENTATIVAS = 3;

/** Espera antes de retentar um item que o provedor recusou. */
const MINUTOS_ATE_RETENTAR = 10;

export type MotivoParada =
  | "nao_conectado"
  | "numero_bloqueado"
  | "cota_diaria"
  | "sem_campanha_ativa"
  | "fila_vazia"
  | "aguardando_horario"
  | "sem_tempo"
  | "outro_disparador"
  /** A próxima mensagem sairia parecida com outra do número: a fila espera. */
  | "texto_repetido"
  /** Mensalidade em atraso (fase 2C): a fila espera o pagamento, sem perder nada. */
  | "grupo_suspenso";

export type ResultadoDispatch = {
  processados: number;
  enviados: number;
  erros: number;
  instanciasBloqueadas: number;
  /** false = fora do horário comercial (antiBan.ts): nada foi tentado nesta chamada. */
  dentroDaJanela: boolean;
  /** Itens ainda pendentes nas campanhas em andamento que esta chamada olhou. */
  restantes: number;
  /** Horário do próximo item pendente, quando há um. */
  proximoAgendadoEm: string | null;
  /**
   * true = sobrou fila que um próximo tique CONSEGUIRIA despachar.
   *
   * É o sinal que autoriza o auto-encadeamento a continuar. Distingue
   * "ainda tem trabalho, só faltou tempo" de "sobrou fila, mas nada vai
   * sair hoje" (cota estourada, número desconectado, disjuntor aberto) —
   * sem essa distinção a corrente giraria à toa até bater no limite de
   * elos, gastando invocação sem mandar nada.
   */
  deveContinuar: boolean;
  /** Frases prontas para o painel: por que a fila não andou. */
  diagnostico: string[];
};

const dormir = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Processa itens vencidos da fila de campanhas.
 *
 * `corretorId` ausente = todos os corretores (uso do cron e da corrente).
 * Presente = só a fila deste corretor (uso do botão manual, que não deve
 * mexer na fila de ninguém além de quem clicou).
 */
export async function processarFilaCampanhas(params?: {
  corretorId?: string;
  limiteTotal?: number;
  orcamentoMs?: number;
  /** Identifica quem detém a trava; a mesma corrente renova a própria trava. */
  dono?: string;
}): Promise<ResultadoDispatch> {
  const limiteTotal = params?.limiteTotal ?? LIMITE_TOTAL_PADRAO;
  const orcamentoMs = params?.orcamentoMs ?? ORCAMENTO_PADRAO_MS;
  const dono = params?.dono ?? `disparo-${crypto.randomUUID()}`;
  const fimDoOrcamento = Date.now() + orcamentoMs;
  const margemMs = margemDeEnvio(orcamentoMs);
  const supabase = createServiceClient();

  const resultado: ResultadoDispatch = {
    processados: 0,
    enviados: 0,
    erros: 0,
    instanciasBloqueadas: 0,
    dentroDaJanela: true,
    restantes: 0,
    proximoAgendadoEm: null,
    deveContinuar: false,
    diagnostico: [],
  };

  // Campanha é contato frio: fora do horário comercial, nada sai — mesma
  // regra que rege o preview em antiBan.ts. Mensagem de campanha às 3h é a
  // assinatura mais clara de robô que existe.
  //
  // Sem exceção desde 27/10/2026. A marca `ignorar_janela` (0058) e a
  // liberação `janela_liberada_ate` (0155) não têm mais tela que as grave
  // (saíram em 09/10), mas continuavam valendo aqui — e as duas colunas são
  // graváveis pela sessão do próprio corretor, pela API. Uma chamada direta
  // bastava para a lista sair de madrugada, a assinatura mais clara de robô.
  // Quem decide o horário é só o relógio.
  /*
   * O aviso de queda vem ANTES de tudo, e é deliberado.
   *
   * Abaixo há três saídas antecipadas — fora da janela sem campanha urgente,
   * número com disjuntor aberto, nenhuma campanha ativa — e um aviso
   * pendurado depois delas herdaria todas. O incidente que criou este
   * recurso é exatamente esse caso: em 28/08 o disjuntor abriu no mesmo
   * minuto da queda, e nas 12 horas seguintes nenhum aviso sairia.
   *
   * A varredura não lança e sai barata quando não há o que avisar.
   */
  await varrerQuedasDeNumero();
  // Número de outra conta cuja sessão não caiu na recusa (0198): tenta o
  // logout de novo. Antes de tudo pelo mesmo motivo do aviso de queda.
  await rederrubarNumerosRecusados();
  // Número fora do ar por 30 min: pausa as listas dele, recomeça o
  // aquecimento e guarda o motivo da queda (0174). Mesmo motivo do aviso
  // para rodar antes de tudo: não pode depender de janela nem de fila.
  await protegerNumerosQueCairam();

  // Listas vivas (0155) ganham quem passou a se encaixar no critério. Só no
  // tique geral: o botão de um corretor não varre a equipe.
  if (!params?.corretorId) {
    await alimentarListasVivas().catch((err) => console.warn("[lista viva] falhou:", err));
  }

  const janelaAberta = dentroDaJanela(new Date());
  if (!janelaAberta) {
    resultado.dentroDaJanela = false;
    resultado.diagnostico.push(
      "Fora do horário comercial (9h às 20h59, de segunda a sábado). A fila retoma sozinha na próxima janela.",
    );
    return resultado;
  }

  let query = supabase
    .from("corretor_whatsapp_instancias")
    .select(
      "id, corretor_id, grupo_id, instance_name, status_conexao, conectado_em, aquecimento_desde, bloqueado_ate, telefone_conectado, expediente_inicio, expediente_fim",
    );

  if (params?.corretorId) query = query.eq("corretor_id", params.corretorId);

  const { data: instancias } = await query;

  if (!instancias || instancias.length === 0) {
    resultado.diagnostico.push("Nenhum número de WhatsApp cadastrado. Conecte um em /corretor/whatsapp.");
    return resultado;
  }

  for (const instancia of instancias) {
    if (resultado.processados >= limiteTotal) break;
    if (Date.now() >= fimDoOrcamento - margemMs) {
      // Sem tempo para mais uma instância nesta chamada, mas há trabalho:
      // a corrente continua no próximo elo.
      resultado.deveContinuar = true;
      break;
    }

    const parcial = await processarInstancia({
      supabase,
      instancia,
      dono,
      fimDoOrcamento,
      margemMs,
      vagas: Math.min(ITENS_POR_INSTANCIA_POR_CHAMADA, limiteTotal - resultado.processados),
      // O expediente do corretor (0148) só encurta a janela segura: fora
      // dela ou do expediente, nenhuma lista sai (desde 27/10/2026 não há
      // mais lista "de qualquer hora").
      somenteUrgentes:
        !janelaAberta ||
        !dentroDaJanelaDoCorretor(new Date(), {
          inicioHora: instancia.expediente_inicio,
          fimHora: instancia.expediente_fim,
        }),
    });

    resultado.processados += parcial.processados;
    resultado.enviados += parcial.enviados;
    resultado.erros += parcial.erros;
    resultado.restantes += parcial.restantes;
    if (parcial.motivo === "numero_bloqueado") resultado.instanciasBloqueadas++;
    if (parcial.deveContinuar) resultado.deveContinuar = true;
    if (parcial.diagnostico) resultado.diagnostico.push(parcial.diagnostico);

    if (
      parcial.proximoAgendadoEm &&
      (!resultado.proximoAgendadoEm || parcial.proximoAgendadoEm < resultado.proximoAgendadoEm)
    ) {
      resultado.proximoAgendadoEm = parcial.proximoAgendadoEm;
    }
  }

  return resultado;
}

type InstanciaLinha = {
  id: string;
  corretor_id: string;
  grupo_id: string;
  instance_name: string;
  status_conexao: string;
  conectado_em: string | null;
  aquecimento_desde: string | null;
  bloqueado_ate: string | null;
};

type ResultadoInstancia = {
  processados: number;
  enviados: number;
  erros: number;
  restantes: number;
  proximoAgendadoEm: string | null;
  deveContinuar: boolean;
  motivo: MotivoParada;
  diagnostico: string | null;
};

/** Despacha a fila de UMA instância, sob trava, dentro do orçamento de tempo. */
async function processarInstancia(ctx: {
  supabase: ReturnType<typeof createServiceClient>;
  instancia: InstanciaLinha;
  dono: string;
  fimDoOrcamento: number;
  margemMs: number;
  vagas: number;
  /** Fora do expediente do corretor: nada sai nesta instância. */
  somenteUrgentes: boolean;
}): Promise<ResultadoInstancia> {
  const { supabase, instancia, dono, fimDoOrcamento, margemMs } = ctx;

  const vazio = (motivo: MotivoParada, diagnostico: string | null = null): ResultadoInstancia => ({
    processados: 0,
    enviados: 0,
    erros: 0,
    restantes: 0,
    proximoAgendadoEm: null,
    deveContinuar: false,
    motivo,
    diagnostico,
  });

  if (instancia.bloqueado_ate && new Date(instancia.bloqueado_ate) > new Date()) {
    return vazio(
      "numero_bloqueado",
      `Envios deste número estão pausados até ${new Date(instancia.bloqueado_ate).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} após falhas seguidas do provedor.`,
    );
  }

  // O marco de conexão é o que autoriza qualquer disparo (curva de
  // aquecimento em antiBan.ts). Enquanto ele não existir, pergunta ao
  // provedor — o pareamento termina fora do nosso alcance e, sem esta
  // sincronização, a coluna nunca era preenchida e a fila inteira ficava
  // parada em "pendente" sem erro nenhum registrado.
  let conectadoEm = instancia.conectado_em;
  if (!conectadoEm || instancia.status_conexao !== "conectado") {
    const estado = await sincronizarConexaoInstancia({
      instanciaId: instancia.id,
      instanceName: instancia.instance_name,
      conectadoEmAtual: instancia.conectado_em,
    });

    if (!estado.conectado || !estado.conectadoEm) {
      return vazio(
        "nao_conectado",
        estado.estado === "indisponivel"
          ? "Não foi possível falar com o provedor de WhatsApp agora. A fila espera o próximo ciclo."
          : "O número de WhatsApp não está pareado. Leia o QR Code em /corretor/whatsapp para a fila começar a sair.",
      );
    }

    conectadoEm = estado.conectadoEm.toISOString();
  }

  // Fora do expediente do corretor (0148) nada sai: a exceção para listas
  // "de qualquer hora" saiu em 27/10/2026 (ver o começo de
  // `processarFilaCampanhas`).
  if (ctx.somenteUrgentes) {
    return vazio("aguardando_horario", "Fora do expediente deste número. A fila retoma sozinha no horário dele.");
  }

  const { data: campanhasAtivas } = await supabase
    .from("whatsapp_campanhas")
    .select("id")
    .eq("corretor_id", instancia.corretor_id)
    .eq("status", "em_andamento");

  const idsCampanhas = (campanhasAtivas ?? []).map((c) => c.id);
  if (idsCampanhas.length === 0) return vazio("sem_campanha_ativa");

  // Grupo suspenso por cobrança (fase 2C): a lista não dispara. A fila não
  // muda: volta a sair sozinha quando o pagamento for registrado.
  if (await grupoSuspenso(instancia.grupo_id)) {
    return vazio(
      "grupo_suspenso",
      "As listas de transmissão estão pausadas: mensalidade em atraso. A fila volta a sair quando o pagamento for registrado.",
    );
  }

  const escopo = `instancia:${instancia.id}`;
  if (!(await travarDisparo(escopo, dono, TRAVA_SEGUNDOS))) {
    // Outra chamada já está despachando este número. Não é erro: é a trava
    // fazendo o trabalho dela.
    //
    // `deveContinuar` fica FALSO aqui de propósito. Quem tem a trava já está
    // encadeando os próprios elos; se este chamador também encadeasse,
    // cada tique do pg_cron (1x/min) abriria uma corrente nova de até 60
    // elos por cima da que já roda — uma explosão de invocações mandando
    // WhatsApp em paralelo, exatamente o oposto do que a trava protege.
    // Se o dono da trava morrer, ela vence em TRAVA_SEGUNDOS e o próximo
    // tique assume.
    return vazio("outro_disparador");
  }

  const parcial: ResultadoInstancia = {
    processados: 0,
    enviados: 0,
    erros: 0,
    restantes: 0,
    proximoAgendadoEm: null,
    deveContinuar: false,
    motivo: "fila_vazia",
    diagnostico: null,
  };

  // Os horários livres da agenda, lidos uma vez por chamada (`{horarios}`).
  let rotulosDaAgenda: string[] | null = null;
  // As mensagens recentes do número e o nome do corretor, lidos uma vez por
  // chamada e só quando algum texto precisa ser conferido.
  let recentes: TextoAnterior[] | null | undefined;
  let nomeDoCorretor: string | null | undefined;
  // O nome da casa é do grupo do número (fase 4): a variação não pode
  // escrever "Next Home" na lista de outro grupo. Lido uma vez por vez.
  let nomeDaCasa: string | null | undefined;
  // A marca de sessão caída sai no primeiro envio que dá certo (uma vez).
  let sessaoConferida = false;
  // Os primeiros contatos já feitos hoje e na semana (0217), lidos uma vez
  // por chamada e somados a cada envio. `null` = não deu para ler.
  let primeirosContatos: { hoje: number; semana: number } | null | undefined;
  let adiadosPorPrimeiroContato = 0;

  try {
    // Com a trava na mão: só um disparador reescreve a fila por vez.
    await aplicarVencedoras(supabase, idsCampanhas);

    while (parcial.processados < ctx.vagas) {
      const { data: itens } = await supabase
        .from("whatsapp_campanhas_fila")
        .select(
          "id, campanha_id, lead_id, telefone, mensagem_personalizada, personalizado_por_ia, tentativas, agendado_para, variante, semelhanca_max, tentativas_texto",
        )
        .in("campanha_id", idsCampanhas)
        .eq("status", "pendente")
        .order("agendado_para", { ascending: true })
        .limit(1);

      const item = itens?.[0];
      if (!item) {
        parcial.motivo = "fila_vazia";
        break;
      }

      // O `select` acima vem ordenado por `agendado_para`, então este é o
      // primeiro item da fila desta instância — e a hora dele é o que manda.
      const agendadoPara = item.agendado_para;
      const esperaMs = new Date(agendadoPara).getTime() - Date.now();

      if (esperaMs > 0) {
        const tempoDisponivel = fimDoOrcamento - Date.now() - margemMs;
        if (esperaMs > Math.min(ESPERA_MAXIMA_MS, tempoDisponivel)) {
          // O próximo item ainda está longe: encerra a chamada em vez de
          // segurar a função aberta à toa. A corrente pega no próximo elo.
          parcial.motivo = "aguardando_horario";
          parcial.proximoAgendadoEm = agendadoPara;
          parcial.deveContinuar = true;
          break;
        }
        await dormir(esperaMs);
      }

      /*
       * A lista pode ter sido PAUSADA ou CANCELADA enquanto esta chamada
       * esperava (Fase 1, 03/10/2026): a corrente dura até 45 min e o
       * `idsCampanhas` foi lido no começo. Confere a lista do item antes de
       * cada envio; se saiu de `em_andamento`, ela sai do escopo e o laço
       * segue com as outras.
       */
      const { data: aindaAtiva } = await supabase
        .from("whatsapp_campanhas")
        .select(
          "id, corretor_id, criterio, midias, empreendimento_id, pausa_base, contexto_template, mensagem_base, mensagem_base_b, empreendimento:empreendimentos(nome)",
        )
        .eq("id", item.campanha_id)
        .eq("status", "em_andamento")
        .maybeSingle();
      if (!aindaAtiva) {
        idsCampanhas.splice(idsCampanhas.indexOf(item.campanha_id), 1);
        if (idsCampanhas.length === 0) {
          parcial.motivo = "fila_vazia";
          break;
        }
        continue;
      }

      /*
       * Pausa automática (07/10/2026): números sem WhatsApp demais ou gente
       * pedindo para sair param a lista antes da próxima mensagem. Nasceu da
       * restrição da conta da Bruna pelo WhatsApp no meio de uma lista de
       * 300. Conta só o que veio depois do último "Retomar" (`pausa_base`).
       */
      const sinais = await lerSinaisDaLista(supabase, item.campanha_id);
      const motivoDaPausa = sinais ? motivoDePausaAutomatica(sinaisDesdeABase(sinais, aindaAtiva.pausa_base)) : null;
      if (motivoDaPausa) {
        await supabase
          .from("whatsapp_campanhas")
          .update({ status: "pausada", pausa_automatica: motivoDaPausa })
          .eq("id", item.campanha_id)
          .eq("status", "em_andamento");
        idsCampanhas.splice(idsCampanhas.indexOf(item.campanha_id), 1);
        if (idsCampanhas.length === 0) {
          parcial.motivo = "fila_vazia";
          break;
        }
        continue;
      }

      /*
       * A lista é montada num instante e sai ao longo de horas (Fase 0 do
       * roadmap, 03/10/2026). Quem pediu para sair, foi arquivado, perdido ou
       * transferido NESSE MEIO TEMPO não recebe. Antes, a mensagem saía mesmo
       * para quem tinha acabado de dizer "não quero mais". Antes da cota: o
       * que não sai não gasta a cota do número.
       */
      const lead = item.lead_id ? await leadParaEnvio(supabase, item.lead_id) : null;
      const barrado = motivoParaNaoEnviar(lead, {
        corretor_id: aindaAtiva.corretor_id,
        criterio: aindaAtiva.criterio as { filtro?: string } | null,
      });
      if (barrado) {
        parcial.processados++;
        await supabase
          .from("whatsapp_campanhas_fila")
          .update({ status: "erro", erro_motivo: barrado })
          .eq("id", item.id)
          .eq("status", "pendente");
        continue;
      }

      /*
       * O mesmo telefone em outro cadastro (16/10/2026): a pessoa é o
       * número, e lead duplicado não pode fazer a lista sair duas vezes, nem
       * passar por cima de um pedido de parada feito no outro cadastro.
       */
      const irmaos = item.lead_id ? await cadastrosDoMesmoTelefone(supabase, item.lead_id) : [];
      const doMesmoTelefone = motivoDoMesmoTelefone({
        outroCadastroNaoContatar: irmaos.some((l) => l.nao_contatar_em !== null),
        jaRecebeuEstaLista:
          irmaos.length > 0 && (await listaJaSaiuPara(supabase, item.campanha_id, irmaos.map((l) => l.id))),
      });
      if (doMesmoTelefone) {
        parcial.processados++;
        await supabase
          .from("whatsapp_campanhas_fila")
          .update({ status: "erro", erro_motivo: doMesmoTelefone })
          .eq("id", item.id)
          .eq("status", "pendente");
        continue;
      }

      /*
       * A guarda de conversa humana (Fase 2): o corretor falou com este lead
       * nas últimas 24h, então a mensagem da lista não sai. Antes da cota:
       * o que não sai não gasta a cota do número. Vale para qualquer
       * cadastro do mesmo telefone.
       */
      const outrosCadastros = irmaos.map((l) => l.id);
      if (item.lead_id && (await corretorFalouComOLead(supabase, item.lead_id, outrosCadastros))) {
        parcial.processados++;
        await supabase
          .from("whatsapp_campanhas_fila")
          .update({ status: "erro", erro_motivo: MOTIVO_CONVERSA_RECENTE })
          .eq("id", item.id)
          .eq("status", "pendente");
        continue;
      }

      /*
       * Primeiro contato (0217, 26/10/2026): quem nunca escreveu ao corretor
       * tem teto próprio por dia e por semana, e nenhum nos 7 dias depois de
       * o número conectar ou voltar de uma queda (`primeiroContato.ts`). É o
       * que derrubou o WhatsApp do Ramos em 21/10 e o da Bruna em 07/10, com
       * espaçamento, cota e texto certos. Sem vaga, o item fica para amanhã
       * com o motivo à vista, e quem já conversou continua saindo. Antes da
       * cota: o que não sai não gasta a cota do número.
       */
      const primeiroContato = await nuncaFalouComOCorretor(supabase, [item.lead_id, ...outrosCadastros]);
      if (primeiroContato) {
        primeirosContatos ??= await contarPrimeirosContatos(supabase, instancia.corretor_id);
        const diasDesdeInicio = diasDesde(
          inicioDoPrimeiroContato(
            conectadoEm ? new Date(conectadoEm) : null,
            instancia.aquecimento_desde ? new Date(instancia.aquecimento_desde) : null,
          ),
        );
        const vagas = primeirosContatos
          ? vagasDePrimeiroContato({
              diasDesdeInicio,
              enviadosHoje: primeirosContatos.hoje,
              enviadosNaSemana: primeirosContatos.semana,
            })
          : 0;
        if (vagas <= 0) {
          await supabase
            .from("whatsapp_campanhas_fila")
            .update({
              erro_motivo: motivoDoPrimeiroContato({ diasDesdeInicio }),
              agendado_para: amanhaCedoEmSaoPaulo(new Date(), Math.floor(Math.random() * 30)),
            })
            .eq("id", item.id)
            .eq("status", "pendente");
          adiadosPorPrimeiroContato++;
          if (adiadosPorPrimeiroContato >= ADIADOS_POR_CHAMADA) {
            parcial.motivo = "cota_diaria";
            parcial.diagnostico = motivoDoPrimeiroContato({ diasDesdeInicio });
            break;
          }
          continue;
        }
      }

      /*
       * O texto, conferido ANTES da cota (08/10/2026): a mensagem só sai se não
       * ficou parecida com outra que o número mandou nos últimos 30 dias.
       * Medido na semana em que o WhatsApp restringiu a conta da Bruna: 65 das
       * 114 mensagens dela saíram idênticas, porque o teste A/B suspendia a
       * reescrita, e as que a IA reescrevia convergiam para o mesmo molde.
       *
       * Vale também no teste A/B: lá a IA troca só as palavras e mantém a
       * abertura de cada versão, que é o que o teste compara. Antes da cota,
       * porque o que não sai não gasta a cota. E gravado de volta na fila: se a
       * corrente cair antes do envio, a próxima tentativa reaproveita o texto.
       */
      let texto = item.mensagem_personalizada;
      // Conferido = tem a semelhança gravada. Item reescrito pela versão antiga
      // da reescrita (sem conferência, antes da 0173) passa pela conferência
      // também: era dela que saíam os textos com 0,95 de semelhança.
      if (item.semelhanca_max === null) {
        recentes ??= await textosRecentesDoNumero(supabase, instancia.corretor_id);
        if (!recentes) {
          parcial.motivo = "texto_repetido";
          parcial.diagnostico =
            "Não consegui conferir as mensagens anteriores do número agora. A fila tenta de novo no próximo ciclo.";
          break;
        }
        if (nomeDoCorretor === undefined) {
          const { data: corretor } = await supabase
            .from("corretores")
            .select("nome")
            .eq("id", instancia.corretor_id)
            .maybeSingle();
          nomeDoCorretor = corretor?.nome ?? null;
        }
        if (nomeDaCasa === undefined) nomeDaCasa = (await lerCasaDoGrupo(instancia.grupo_id)).nomeDaCasa;
        const imovelDaLista = (
          Array.isArray(aindaAtiva.empreendimento) ? aindaAtiva.empreendimento[0] : aindaAtiva.empreendimento
        ) as { nome: string } | null;
        const tempoRestante = fimDoOrcamento - Date.now() - margemMs;
        const tentativasDaIA = tempoRestante > 30_000 ? 3 : tempoRestante > 20_000 ? 2 : 1;
        const variacao = await variarSemRepetir({
          quemPaga: { corretorId: instancia.corretor_id, grupoId: instancia.grupo_id },
          texto,
          nome: primeiroNomeUtil(lead?.nome),
          nomes: nomesDaPessoa(lead?.nome),
          fatos: fatosDaLista({
            contexto: aindaAtiva.contexto_template as ContextoTemplate | null,
            imovelNome: imovelDaLista?.nome,
            corretorNome: nomeDoCorretor,
            nomeDaCasa,
          }),
          anteriores: recentes.filter((a) => a.id !== item.id),
          // Abertura mantida só quando o teste compara duas versões de
          // verdade: A e B iguais não testam nada, e o modo A/B prende a IA
          // ao molde (`versoesDiferentes`).
          manterAbertura: Boolean(item.variante) && versoesDiferentes(aindaAtiva.mensagem_base, aindaAtiva.mensagem_base_b),
          tentativas: tentativasDaIA,
          orcamentoMs: Math.max(4_000, Math.min(9_000, Math.floor(tempoRestante / (tentativasDaIA + 1)))),
        });

        if (!variacao.ok) {
          /*
           * Não sai texto repetido. O item fica na frente da fila com o motivo
           * à vista (é o que a tela lê) e o próximo ciclo tenta de novo, com
           * outro estilo sorteado. Se a IA respondeu e mesmo assim nada passou
           * na conferência por vários ciclos seguidos, o problema é o texto (curto
           * demais, ou igual ao de uma lista recente): a lista pausa sozinha
           * com o conselho, em vez de girar para sempre. IA fora do ar não conta
           * para a pausa: ela volta sozinha, e a fila junto.
           */
          const parecida = variacao.motivo === "parecida";
          const ciclos = (item.tentativas_texto ?? 0) + (parecida ? 1 : 0);
          // O porquê fica no log: sem ele, a pausa da lista do Ramos em
          // 08/10 não dizia se a IA errou um fato ou só repetiu o molde.
          console.warn(
            `[campanha] item ${item.id}: reescrita não passou (${variacao.motivo}, ciclo ${ciclos}): ${variacao.detalhe}`,
          );
          await supabase
            .from("whatsapp_campanhas_fila")
            .update({
              erro_motivo: parecida ? MOTIVO_TEXTO_PARECIDO : MOTIVO_TEXTO_SEM_IA,
              tentativas_texto: ciclos,
            })
            .eq("id", item.id)
            .eq("status", "pendente");

          if (parecida && ciclos >= CICLOS_ATE_PAUSAR) {
            await supabase
              .from("whatsapp_campanhas")
              .update({ status: "pausada", pausa_automatica: MOTIVO_PAUSA_POR_TEXTO })
              .eq("id", item.campanha_id)
              .eq("status", "em_andamento");
            idsCampanhas.splice(idsCampanhas.indexOf(item.campanha_id), 1);
            if (idsCampanhas.length === 0) {
              parcial.motivo = "fila_vazia";
              break;
            }
            continue;
          }

          parcial.motivo = "texto_repetido";
          parcial.diagnostico = parecida
            ? "A IA ainda não conseguiu escrever a próxima mensagem diferente das anteriores. A fila tenta de novo no próximo ciclo, para não mandar texto repetido."
            : "A IA que reescreve as mensagens não respondeu agora. Sem ela, a próxima sairia igual a uma anterior, então a fila espera o próximo ciclo.";
          break;
        }

        texto = variacao.texto;
        await supabase
          .from("whatsapp_campanhas_fila")
          .update({
            mensagem_personalizada: texto,
            personalizado_por_ia: variacao.personalizadoPorIA,
            semelhanca_max: variacao.semelhanca,
            erro_motivo: null,
          })
          .eq("id", item.id);
        recentes = [
          { id: item.id, texto, nomes: nomesDaPessoa(lead?.nome) },
          ...recentes.filter((a) => a.id !== item.id),
        ];
      }

      /*
       * A vez de disparar: cota diária E espaçamento, decididos no banco
       * (0062). O intervalo precisa ser verificado AQUI, contra o relógio,
       * e não só contra `agendado_para` — item vencido tem espera negativa,
       * e era assim que uma fila atrasada saía inteira em rajada: 15
       * mensagens em 57 segundos, com 2 a 5 segundos entre elas.
       */
      const cota = await reservarCotaCampanha(instancia.id, new Date(conectadoEm));

      if (!cota.permitido && cota.motivo === "aguardando_intervalo") {
        /*
         * Espera de segundos, não do dia: vale segurar a chamada aberta, do
         * mesmo jeito que já se espera por `agendado_para`. Se não couber no
         * orçamento, a corrente pega no próximo elo — e o piso continua
         * valendo lá, porque quem guarda o instante é o banco.
         *
         * `continue` sem incrementar `processados`: aguardar não é
         * processar, e contar isso como item gasto faria a chamada devolver
         * "3 processados, 0 enviados" e encerrar a vaga sem ter mandado nada.
         */
        const tempoDisponivel = fimDoOrcamento - Date.now() - margemMs;
        if (cota.esperaMs > Math.min(ESPERA_MAXIMA_MS, tempoDisponivel)) {
          parcial.motivo = "aguardando_horario";
          parcial.deveContinuar = true;
          parcial.diagnostico = "Respeitando o intervalo entre disparos para proteger o número.";
          break;
        }
        await dormir(cota.esperaMs);
        continue;
      }

      if (!cota.permitido) {
        // Cota do NÚMERO estourou (ou o disjuntor está aberto): nada mais
        // sai por hoje nesta instância. Não é motivo para a corrente
        // continuar.
        parcial.motivo = cota.motivo === "numero_bloqueado" ? "numero_bloqueado" : "cota_diaria";
        parcial.diagnostico =
          cota.detalhe ?? "Cota diária de disparos deste número atingida. A fila continua amanhã.";
        break;
      }

      parcial.processados++;

      /*
       * `{horarios}` é resolvido AGORA, e não na criação: a fila anda devagar
       * de propósito, e um horário oferecido na criação pode ter sido marcado
       * por outro cliente até a mensagem sair. Lido uma vez por chamada.
       */
      if (/\{horarios\}/i.test(texto)) {
        rotulosDaAgenda ??= (await horariosDeVisita(instancia.corretor_id).catch(() => [])).map((h) => h.rotulo);
        texto = resolverHorarios(texto, rotulosDaAgenda);
      }

      // A saudação acompanha a hora do ENVIO, não a da escrita: "Bom dia"
      // escrito de manhã sairia errado à tarde (`ajustarSaudacaoAoHorario`).
      texto = ajustarSaudacaoAoHorario(texto, new Date());

      const envio = await enviarMensagemWhatsapp({
        instanceName: instancia.instance_name,
        telefone: item.telefone,
        texto,
      });

      /*
       * Destinatário sem WhatsApp NÃO conta para o disjuntor. Ele existe
       * para proteger o número quando o provedor está falhando, e um
       * telefone inexistente é dado ruim do lead — não diz nada sobre a
       * saúde da nossa conexão. Sem esta distinção, três cadastros com
       * número errado seguidos travavam a fila inteira por 12 horas.
       */
      /*
       * Cada falha tem um tratamento (`classificarFalhaDeEnvio`, Fase 0):
       * - número sem WhatsApp ou telefone inválido no cadastro: dado do lead,
       *   não do número. Erro definitivo, cota devolvida, disjuntor intocado.
       *   Antes, três cadastros ruins seguidos travavam o número por 12h;
       * - envio INCERTO (o provedor demorou ou respondeu sem comprovante): a
       *   mensagem pode ter saído, e tentar de novo arriscaria mandar duas
       *   vezes. Erro definitivo com aviso para conferir a conversa;
       * - recusa clara do provedor: nada saiu, então vale tentar de novo.
       */
      /*
       * A SESSÃO do WhatsApp caiu (`sessaoCaida.ts`, 08/10/2026): nada saiu,
       * então a cota volta e o item não gasta tentativa; a falha conta para o
       * disjuntor, e a fila guarda o motivo que faz o painel pedir para
       * reconectar. Mandar o próximo item agora daria no mesmo: a vez acaba
       * aqui. Se o provedor também diz que o número caiu, o banco passa a
       * dizer "desconectado", e a faixa do painel já sabe o que mostrar.
       */
      if (!envio.enviado && ehFalhaDeSessao(envio.detalhe)) {
        await devolverCotaCampanha(instancia.id);
        await registrarResultadoEnvio(instancia.id, false);
        // Fora do rodízio do link até a sessão voltar (0174).
        await marcarSessaoCaida(instancia.id);
        await supabase
          .from("whatsapp_campanhas_fila")
          .update({
            erro_motivo: MOTIVO_SESSAO_CAIU,
            agendado_para: new Date(Date.now() + MINUTOS_ATE_RETENTAR * 60_000).toISOString(),
          })
          .eq("id", item.id);
        parcial.erros++;
        console.warn(`[campanha] item ${item.id}: sessão do WhatsApp caiu (${envio.detalhe ?? ""})`);

        const estado = await consultarEstadoConexao(instancia.instance_name);
        if (estado.ok && !estado.conectado) {
          await sincronizarConexaoInstancia({
            instanciaId: instancia.id,
            instanceName: instancia.instance_name,
            conectadoEmAtual: conectadoEm,
          });
        }
        parcial.motivo = "nao_conectado";
        parcial.diagnostico =
          "A conexão do WhatsApp caiu e a mensagem não saiu. Reconecte o número em Minha IA → WhatsApp: a fila volta sozinha quando ele reconectar.";
        break;
      }

      const classe = envio.enviado ? null : classificarFalhaDeEnvio(envio);
      if (classe === "inexistente" || classe === "dados") {
        // A cota foi reservada antes do envio e este envio não aconteceu
        // para ninguém: devolver evita que uma lista com telefones errados
        // consuma o dia inteiro sem entregar mensagem nenhuma.
        await devolverCotaCampanha(instancia.id);
      } else if (envio.enviado || (classe && falhaContaParaDisjuntor(classe))) {
        await registrarResultadoEnvio(instancia.id, envio.enviado);
      }

      if (!envio.enviado) {
        parcial.erros++;
        const tentativas = (item.tentativas ?? 0) + 1;
        const motivo = envio.detalhe || envio.motivo || "Falha desconhecida";

        // Um número que o provedor recusa não pode ficar na frente da fila
        // bloqueando todo o resto: ou ele volta para o fim (retentativa
        // adiada) ou vira erro definitivo.
        const atualizacao =
          classe === "inexistente"
            ? { status: "erro" as const, erro_motivo: MOTIVO_SEM_WHATSAPP, tentativas }
            : classe === "dados"
              ? { status: "erro" as const, erro_motivo: MOTIVO_TELEFONE_INVALIDO, tentativas }
              : classe === "incerto"
                ? { status: "erro" as const, erro_motivo: MOTIVO_ENVIO_INCERTO, tentativas }
                : tentativas >= MAX_TENTATIVAS
                  ? { status: "erro" as const, erro_motivo: motivo, tentativas }
                  : {
                      tentativas,
                      erro_motivo: motivo,
                      agendado_para: new Date(
                        Date.now() + MINUTOS_ATE_RETENTAR * 60_000,
                      ).toISOString(),
                    };
        await supabase.from("whatsapp_campanhas_fila").update(atualizacao).eq("id", item.id);

        continue;
      }

      parcial.enviados++;
      // Um envio deu certo: a sessão funciona, e as mensagens que esperavam
      // por ela voltam ao normal (ver `sessaoCaida.ts`).
      if (!sessaoConferida) {
        sessaoConferida = true;
        await liberarFilaDaSessao({
          instanciaId: instancia.id,
          corretorId: instancia.corretor_id,
          levantarPausa: false,
        });
      }
      await supabase
        .from("whatsapp_campanhas_fila")
        .update({
          status: "enviado",
          enviado_em: new Date().toISOString(),
          tentativas: (item.tentativas ?? 0) + 1,
          erro_motivo: null,
          primeiro_contato: primeiroContato,
        })
        .eq("id", item.id);
      if (primeiroContato && primeirosContatos) {
        primeirosContatos.hoje++;
        primeirosContatos.semana++;
      }

      // Registra a conversa com origem 'campanha' (isenta da trava de
      // palavra-chave, ver modoBot.ts) e a mensagem enviada, para o
      // corretor ver no Live Chat e para o webhook reconhecer a resposta do
      // cliente quando ela chegar (marcarRespostaCampanha).
      /*
       * O telefone do CADASTRO, normalizado — nunca `item.telefone` cru.
       *
       * O envio já normalizava (o provider chama `normalizarTelefoneBr`
       * desde 27/08), mas a CONVERSA era criada com a string do cadastro:
       * `11981480402` ao lado do mesmo celular com DDI na conversa
       * orgânica. Medido em produção: 24 conversas FANTASMA, com 34
       * mensagens de campanha que o Live Chat nunca mostrou junto do
       * atendimento — e, sob a regra da 0111, sem lead e portanto
       * descartáveis. A 0111 funde o estoque; isto impede o próximo.
       */
      const conversa = await obterOuCriarConversa({
        corretorId: instancia.corretor_id,
        telefoneCliente: normalizarTelefoneBr(item.telefone) ?? item.telefone,
        origem: "campanha",
      });
      if (conversa) {
        /*
         * Guarda o COMPROVANTE do provedor, como o Live Chat já fazia.
         *
         * Até 27/08/2026 o disparo gravava a mensagem sem o
         * `provider_message_id`. A consequência era pior do que parece: o
         * ACK de entrega que o webhook recebe (0051) casa por esse id, então
         * mensagem de campanha NUNCA podia receber ✓✓. Medido: 27 disparos,
         * zero com id do provedor e zero com status de entrega.
         *
         * Isso deixava o sistema sem como distinguir "a mensagem chegou" de
         * "a chamada HTTP não deu erro" — e era exatamente essa a dúvida do
         * corretor ao dizer que as mensagens não estavam saindo de verdade.
         * Com o id gravado, o ✓✓ vem sozinho pelo webhook.
         *
         * `statusEntrega` só nasce "enviada" quando há id: a Evolution
         * devolve a chave da mensagem num envio real, e um 2xx sem chave é
         * justamente o caso que não se pode afirmar como enviado.
         */
        await gravarMensagem({
          // Mensagem que NÓS iniciamos: é atendimento por definição.
          conversaLiberada: true,
          conversaId: conversa.id,
          remetente: "bot",
          conteudo: texto,
          providerMessageId: envio.messageId ?? null,
          statusEntrega: envio.messageId ? "enviada" : null,
        });

        /*
         * Mandar a lista ATIVA a IA nesta conversa (decisão do Matheus,
         * 03/10/2026). Sem isto, o lead com quem o corretor já tinha falado
         * respondia à lista e ficava sem resposta: a fala antiga do corretor
         * deixou a IA desligada (0152). A lista é o corretor entregando a
         * conversa, como a palavra-chave. O que o cliente pediu continua
         * valendo: quem pediu para sair nem entra na lista (`elegivel`), e
         * a guarda de 24h acima segura quem está em conversa com o corretor.
         * Se ele voltar a falar, a IA desliga de novo.
         */
        await ativarIaNaConversa(conversa.id);

        /*
         * Fotos e planta do imóvel depois do texto (Fase 2). Fazem parte do
         * MESMO contato: não reservam cota de novo nem esperam o intervalo de
         * 35-75s, só uma pausa curta entre uma e outra, como uma pessoa
         * mandando. Falha numa foto não desfaz o texto que já saiu.
         */
        /*
         * A coluna `midias` é gravável pela sessão do corretor (RLS do dono),
         * então ela NÃO é prova de que a URL é do catálogo: alguém pela API
         * poderia pôr uma URL qualquer e fazer o provedor buscá-la. O envio
         * só aceita URL que existe em `midias` do imóvel DESTA lista.
         */
        const midias = await midiasDoCatalogo(
          supabase,
          aindaAtiva.empreendimento_id,
          (aindaAtiva.midias ?? []) as MidiaDaLista[],
        );
        // Primeiro contato vai sem foto (0217): o mesmo arquivo para dezenas
        // de desconhecidos é sinal de envio em massa. A foto vai quando a
        // pessoa responder.
        if (midias.length > 0 && !primeiroContato) {
          await enviarMidiasDaLista({
            instanceName: instancia.instance_name,
            telefone: item.telefone,
            conversaId: conversa.id,
            midias,
          });
        }

        if (!envio.messageId) {
          // Sem chave não há como confirmar entrega depois. Não vira erro
          // (a mensagem pode ter saído), mas não pode passar em silêncio.
          console.warn(
            `[campanha] provedor respondeu 2xx SEM id de mensagem para ${item.telefone} — envio não confirmável.`,
          );
        }

        /*
         * O disparo NÃO agenda mais reengajamento (plano de ativação,
         * 03/10/2026, regra N1): a IA só responde. Quem recebeu e não
         * respondeu volta nas listas sugeridas do Início, e o corretor decide
         * quando mandar de novo.
         */
      }

      /*
       * O funil anda com a mensagem que SAIU.
       *
       * Até 27/08/2026 só o webhook chamava isto — ou seja, o lead só saía
       * de "Novo" quando a IA RESPONDIA alguém que escreveu. Quem recebia
       * um disparo e não respondia ficava em "Novo" para sempre, embora já
       * tivesse sido abordado. Medido: 10 leads com mensagem entregue e
       * nenhum fora de "Novo".
       *
       * Isso corrói o quadro de duas formas ao mesmo tempo: a coluna "Novo"
       * mistura quem nunca foi abordado com quem já recebeu mensagem, e o
       * filtro "parados há 15 dias" volta a oferecer para a campanha
       * exatamente quem acabou de receber uma.
       *
       * A função tem `.eq("etapa", "novo")` embutido, então isto nunca
       * puxa ninguém para TRÁS: quem já está em negociação continua onde
       * está. É a mesma guarda de termostato que o webhook usa.
       */
      if (item.lead_id) await avancarLeadParaPrimeiroContato(item.lead_id, "lista");
      // Disparo é iniciativa nossa: conta como tentativa de contato (0060).
      await registrarTentativaDeContato(item.lead_id);

      // Renova a trava a cada mensagem: um lote longo não pode perder a
      // trava no meio e deixar outro disparador entrar por cima.
      await travarDisparo(escopo, dono, TRAVA_SEGUNDOS);

      if (Date.now() >= fimDoOrcamento - margemMs) {
        parcial.motivo = "sem_tempo";
        parcial.deveContinuar = true;
        break;
      }
    }

    // A sessão caída encerra a vez mesmo na última vaga: continuar a
    // corrente mandaria o próximo item para a mesma sessão morta.
    if (parcial.processados >= ctx.vagas && parcial.motivo !== "nao_conectado") {
      parcial.motivo = "sem_tempo";
      parcial.deveContinuar = true;
    }

    await atualizarProgressoCampanhas(supabase, idsCampanhas);

    const restantes = await contarPendentes(supabase, idsCampanhas);
    parcial.restantes = restantes.total;
    parcial.proximoAgendadoEm = parcial.proximoAgendadoEm ?? restantes.proximoAgendadoEm;
    if (restantes.total === 0) parcial.deveContinuar = false;

    return parcial;
  } finally {
    await destravarDisparo(escopo, dono);
  }
}

/**
 * O lead como está AGORA, para a conferência antes do envio e para o nome
 * da variação por IA. Null quando o lead foi excluído.
 */
async function leadParaEnvio(
  supabase: ReturnType<typeof createServiceClient>,
  leadId: string,
): Promise<(NonNullable<LeadNoEnvio> & { nome: string }) | null> {
  const { data } = await supabase
    .from("leads")
    .select("nome, nao_contatar_em, arquivado_em, etapa, corretor_id")
    .eq("id", leadId)
    .maybeSingle();
  return data ? { ...data, nome: data.nome ?? "" } : null;
}

/**
 * Os OUTROS cadastros do mesmo corretor com o mesmo telefone. Compara pela
 * coluna gerada `telefone_e164`, que normaliza pontuação e DDI.
 */
async function cadastrosDoMesmoTelefone(
  supabase: ReturnType<typeof createServiceClient>,
  leadId: string,
): Promise<{ id: string; nao_contatar_em: string | null }[]> {
  const { data: lead } = await supabase
    .from("leads")
    .select("telefone_e164, corretor_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead?.telefone_e164 || !lead.corretor_id) return [];
  const { data } = await supabase
    .from("leads")
    .select("id, nao_contatar_em")
    .eq("corretor_id", lead.corretor_id)
    .eq("telefone_e164", lead.telefone_e164)
    .neq("id", leadId);
  return data ?? [];
}

/** Algum item desta lista, de um desses cadastros, já saiu? */
async function listaJaSaiuPara(
  supabase: ReturnType<typeof createServiceClient>,
  campanhaId: string,
  leadIds: string[],
): Promise<boolean> {
  const { count } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("id", { count: "exact", head: true })
    .eq("campanha_id", campanhaId)
    .in("lead_id", leadIds)
    .in("status", ["enviado", "respondido"]);
  return (count ?? 0) > 0;
}

/** As mídias da lista que de fato pertencem ao imóvel dela no catálogo. */
async function midiasDoCatalogo(
  supabase: ReturnType<typeof createServiceClient>,
  empreendimentoId: string | null,
  midias: MidiaDaLista[],
): Promise<MidiaDaLista[]> {
  if (!empreendimentoId || midias.length === 0) return [];
  const { data } = await supabase
    .from("midias")
    .select("url")
    .eq("empreendimento_id", empreendimentoId)
    .in(
      "url",
      midias.map((m) => m.url),
    );
  const validas = new Set((data ?? []).map((m) => m.url));
  return midias.filter((m) => validas.has(m.url) && (m.tipo === "foto" || m.tipo === "planta"));
}

async function contarPendentes(
  supabase: ReturnType<typeof createServiceClient>,
  idsCampanhas: string[],
): Promise<{ total: number; proximoAgendadoEm: string | null }> {
  const { count } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("id", { count: "exact", head: true })
    .in("campanha_id", idsCampanhas)
    .eq("status", "pendente");

  const { data: proximo } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("agendado_para")
    .in("campanha_id", idsCampanhas)
    .eq("status", "pendente")
    .order("agendado_para", { ascending: true })
    .limit(1)
    .maybeSingle();

  return { total: count ?? 0, proximoAgendadoEm: proximo?.agendado_para ?? null };
}

/**
 * Recalcula `total_enviados`/status a partir da contagem real de linhas na
 * fila, para cada campanha tocada nesta chamada.
 *
 * Recontar em vez de incrementar é o que torna esta função segura de
 * rodar em paralelo com `marcarRespostaCampanha` (que só toca
 * `total_respondidos`) e repetível sem risco de contar dobrado.
 */
async function atualizarProgressoCampanhas(
  supabase: ReturnType<typeof createServiceClient>,
  idsCampanhas: string[],
): Promise<void> {
  for (const campanhaId of idsCampanhas) {
    const { count: enviados } = await supabase
      .from("whatsapp_campanhas_fila")
      .select("id", { count: "exact", head: true })
      .eq("campanha_id", campanhaId)
      .in("status", ["enviado", "respondido"]);

    const { count: pendentes } = await supabase
      .from("whatsapp_campanhas_fila")
      .select("id", { count: "exact", head: true })
      .eq("campanha_id", campanhaId)
      .eq("status", "pendente");

    await supabase.from("whatsapp_campanhas").update({ total_enviados: enviados ?? 0 }).eq("id", campanhaId);

    // Só fecha quando não sobra nada para tentar de novo — um item com
    // erro não trava a campanha em "em_andamento" para sempre porque ele já
    // não é mais 'pendente', mas também não vira 'concluida' à toa: a
    // contagem de pendentes é que decide. E só fecha lista que estava
    // enviando: pausada ou cancelada pelo corretor continua dizendo isso.
    if (pendentes === 0) {
      await supabase
        .from("whatsapp_campanhas")
        .update({ status: "concluida" })
        .eq("id", campanhaId)
        .eq("status", "em_andamento");
    }
  }
}

/** Quantos itens sem vaga de primeiro contato uma chamada adia antes de parar. */
const ADIADOS_POR_CHAMADA = 25;

/** O corretor mandou mensagem a este lead nas últimas `HORAS_DA_GUARDA_HUMANA`? */
async function corretorFalouComOLead(
  supabase: ReturnType<typeof createServiceClient>,
  leadId: string,
  outrosCadastros: string[] = [],
): Promise<boolean> {
  const desde = new Date(Date.now() - HORAS_DA_GUARDA_HUMANA * 3_600_000).toISOString();
  const { data: conversas } = await supabase
    .from("whatsapp_conversas")
    .select("id")
    .in("lead_id", [leadId, ...outrosCadastros]);
  const ids = (conversas ?? []).map((c) => c.id);
  if (ids.length === 0) return false;
  const { count } = await supabase
    .from("whatsapp_mensagens")
    .select("id", { count: "exact", head: true })
    .in("conversa_id", ids)
    .eq("remetente", "corretor")
    .gte("created_at", desde);
  return (count ?? 0) > 0;
}
