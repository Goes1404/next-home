import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { dentroDaJanela, ehDestinatarioInexistente } from "./antiBan";
import { variarMensagemComIA } from "./campaignQueue";
import { enviarMensagemWhatsapp } from "./provider";
import {
  destravarDisparo,
  gravarMensagem,
  obterOuCriarConversa,
  devolverCotaCampanha,
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
  | "outro_disparador";

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
  if (!dentroDaJanela(new Date())) {
    resultado.dentroDaJanela = false;
    resultado.diagnostico.push(
      "Fora do horário comercial (9h às 20h59, de segunda a sábado). A fila retoma sozinha na próxima janela.",
    );
    return resultado;
  }

  let query = supabase
    .from("corretor_whatsapp_instancias")
    .select("id, corretor_id, instance_name, status_conexao, conectado_em, bloqueado_ate, telefone_conectado");

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
  instance_name: string;
  status_conexao: string;
  conectado_em: string | null;
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
      `Envios deste número estão pausados até ${new Date(instancia.bloqueado_ate).toLocaleString("pt-BR")} após falhas seguidas do provedor.`,
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

  const { data: campanhasAtivas } = await supabase
    .from("whatsapp_campanhas")
    .select("id")
    .eq("corretor_id", instancia.corretor_id)
    .eq("status", "em_andamento");

  const idsCampanhas = (campanhasAtivas ?? []).map((c) => c.id);
  if (idsCampanhas.length === 0) return vazio("sem_campanha_ativa");

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

  try {
    while (parcial.processados < ctx.vagas) {
      const { data: itens } = await supabase
        .from("whatsapp_campanhas_fila")
        .select(
          "id, campanha_id, lead_id, telefone, mensagem_personalizada, personalizado_por_ia, tentativas, agendado_para",
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

      const cota = await reservarCotaCampanha(instancia.id, new Date(conectadoEm));
      if (!cota.permitido) {
        // Cota do NÚMERO estourou: nada mais sai por hoje nesta instância.
        // Não é motivo para a corrente continuar.
        parcial.motivo = "cota_diaria";
        parcial.diagnostico =
          cota.motivo ?? "Cota diária de disparos deste número atingida. A fila continua amanhã.";
        break;
      }

      parcial.processados++;

      // Variação anti-ban feita agora, no envio, e gravada de volta: se a
      // corrente cair depois desta linha e antes do envio, a próxima
      // tentativa reaproveita o texto em vez de pagar a IA de novo.
      let texto = item.mensagem_personalizada;
      if (!item.personalizado_por_ia) {
        const nomeLead = await nomeDoLead(supabase, item.lead_id);
        const variacao = await variarMensagemComIA({ texto, nomeLead });
        if (variacao.personalizadoPorIA) {
          texto = variacao.texto;
          await supabase
            .from("whatsapp_campanhas_fila")
            .update({ mensagem_personalizada: texto, personalizado_por_ia: true })
            .eq("id", item.id);
        }
      }

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
      const numeroInexistente = !envio.enviado && ehDestinatarioInexistente(envio.detalhe);
      if (numeroInexistente) {
        // A cota foi reservada antes do envio e este envio não aconteceu
        // para ninguém: devolver evita que uma lista com telefones errados
        // consuma o dia inteiro sem entregar mensagem nenhuma.
        await devolverCotaCampanha(instancia.id);
      } else {
        await registrarResultadoEnvio(instancia.id, envio.enviado);
      }

      if (!envio.enviado) {
        parcial.erros++;
        const tentativas = (item.tentativas ?? 0) + 1;
        const motivo = envio.detalhe || envio.motivo || "Falha desconhecida";

        // Um número que o provedor recusa não pode ficar na frente da fila
        // bloqueando todo o resto: ou ele volta para o fim (retentativa
        // adiada) ou vira erro definitivo.
        //
        // Número inexistente não ganha retentativa: ele não vai passar a
        // existir daqui a 30 minutos, e insistir só gasta a cota do dia.
        await supabase
          .from("whatsapp_campanhas_fila")
          .update(
            numeroInexistente
              ? { status: "erro", erro_motivo: "Número não está no WhatsApp", tentativas }
              : tentativas >= MAX_TENTATIVAS
                ? { status: "erro", erro_motivo: motivo, tentativas }
                : {
                    tentativas,
                    erro_motivo: motivo,
                    agendado_para: new Date(
                      Date.now() + MINUTOS_ATE_RETENTAR * 60_000,
                    ).toISOString(),
                  },
          )
          .eq("id", item.id);

        continue;
      }

      parcial.enviados++;
      await supabase
        .from("whatsapp_campanhas_fila")
        .update({
          status: "enviado",
          enviado_em: new Date().toISOString(),
          tentativas: (item.tentativas ?? 0) + 1,
          erro_motivo: null,
        })
        .eq("id", item.id);

      // Registra a conversa com origem 'campanha' (isenta da trava de
      // palavra-chave, ver modoBot.ts) e a mensagem enviada, para o
      // corretor ver no Live Chat e para o webhook reconhecer a resposta do
      // cliente quando ela chegar (marcarRespostaCampanha).
      const conversa = await obterOuCriarConversa({
        corretorId: instancia.corretor_id,
        telefoneCliente: item.telefone,
        origem: "campanha",
      });
      if (conversa) {
        await gravarMensagem({ conversaId: conversa.id, remetente: "bot", conteudo: texto });
      }

      // Renova a trava a cada mensagem: um lote longo não pode perder a
      // trava no meio e deixar outro disparador entrar por cima.
      await travarDisparo(escopo, dono, TRAVA_SEGUNDOS);

      if (Date.now() >= fimDoOrcamento - margemMs) {
        parcial.motivo = "sem_tempo";
        parcial.deveContinuar = true;
        break;
      }
    }

    if (parcial.processados >= ctx.vagas) {
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

/** Nome do lead para a variação por IA; vazio faz `variarMensagemComIA` devolver o texto intacto. */
async function nomeDoLead(
  supabase: ReturnType<typeof createServiceClient>,
  leadId: string | null,
): Promise<string> {
  if (!leadId) return "";
  const { data } = await supabase.from("leads").select("nome").eq("id", leadId).maybeSingle();
  return data?.nome ?? "";
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

    await supabase
      .from("whatsapp_campanhas")
      .update({
        total_enviados: enviados ?? 0,
        // Só fecha quando não sobra nada para tentar de novo — um item com
        // erro não trava a campanha em "em_andamento" para sempre porque
        // ele já não é mais 'pendente', mas também não vira 'concluida' à
        // toa: a contagem de pendentes é que decide.
        ...(pendentes === 0 ? { status: "concluida" } : {}),
      })
      .eq("id", campanhaId);
  }
}
