import "server-only";

import { linkDoPainel } from "@/lib/marcaDoCrm/marca";
import { createServiceClient } from "@/lib/supabase/service";
import { fraseDoLimite, momentoEmSaoPaulo } from "@/lib/whatsapp/antiBan";
import { previsaoDeTermino } from "@/lib/whatsapp/listaDeTransmissao";
import { motivoDaQueda } from "@/lib/whatsapp/motivoDaQueda";
import {
  DIAS_SEM_PRIMEIRO_CONTATO,
  PRIMEIRO_CONTATO_POR_DIA,
  PRIMEIRO_CONTATO_POR_SEMANA,
  diasDesde,
  inicioDoPrimeiroContato,
  vagasDePrimeiroContato,
} from "@/lib/whatsapp/primeiroContato";
import { contarPrimeirosContatos } from "@/lib/whatsapp/primeiroContatoNoEnvio";
import { calcularLimiteDoDia } from "@/lib/whatsapp/repositorio";
import { avaliarSaudeDaConexao, quandoEmSaoPaulo, type FotoDaConexao } from "@/lib/whatsapp/saudeDaConexao";
import { MOTIVO_SESSAO_CAIU } from "@/lib/whatsapp/sessaoCaida";
import type { Acao, Consulta, ContextoDoCentral } from "../executar";

/**
 * Frente O — saúde do número, onda 3: saude_do_numero (20). CONSULTA da
 * própria pessoa: "meu WhatsApp está conectado?", "quantos primeiros contatos
 * ainda posso hoje?". O gestor pergunta sobre o número DELE; a equipe inteira
 * é `whatsapp_da_equipe` (relatorios.ts).
 *
 * Nenhuma régua nova, porque número que diz uma coisa no central e outra na
 * tela (ou no disparador) é pior que número calado:
 * - a conexão passa por `avaliarSaudeDaConexao`, a mesma decisão (e o mesmo
 *   texto) da faixa do painel e do e-mail de queda;
 * - a cota das listas é `calcularLimiteDoDia` (aquecimento pelo uso, 0158),
 *   a que `reservarCotaCampanha` passa ao banco e a tela de listas mostra,
 *   menos o contador do dia da instância, como a tela faz;
 * - o primeiro contato é `contarPrimeirosContatos` (0222) +
 *   `vagasDePrimeiroContato`, montados como o disparador monta (início =
 *   conexão ou volta da queda, o mais recente). Contagem que falha vale
 *   zero vaga, como lá: o central não pode prometer o que o envio recusa;
 * - "quantos da lista ficam para amanhã" é `previsaoDeTermino`, a conta da
 *   tela de listas, com a janela do expediente do corretor.
 *
 * Os níveis por resultado (10 → 15 → 20 por dia, desenho 3.6 e 5) ainda não
 * existem: o central diz o limite de hoje e não promete subida.
 *
 * A chave de serviço não recorta nada: toda leitura filtra `grupo_id` e o
 * corretor da identificação (`ctx`), nunca o que a IA escreveu. Só status e
 * contagens: nenhuma conversa é lida (o contador de primeiros contatos é uma
 * função SQL que devolve só o número).
 */

type Supa = ReturnType<typeof createServiceClient>;

const COLUNAS =
  "id, status_conexao, conectado_em, aquecimento_desde, desconectado_em, bloqueado_ate, motivo_queda_codigo, sessao_caida_em, envios_campanha_data, envios_campanha_contador, expediente_inicio, expediente_fim";

/** O que a consulta devolve sobre a conexão. `sem_numero` = nenhuma instância criada. */
export type EstadoDoNumero =
  | "conectado"
  | "conectando"
  | "caiu"
  | "parou_de_enviar"
  | "envios_pausados"
  | "nunca_conectou"
  | "sem_numero";

const NIVEIS =
  `Ainda não há níveis que sobem com o resultado: o limite de primeiro contato hoje é ` +
  `${PRIMEIRO_CONTATO_POR_DIA} por dia e ${PRIMEIRO_CONTATO_POR_SEMANA} por semana.`;

function semVazios<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;
}

/** O dia corrente em São Paulo, no formato da coluna `envios_campanha_data`. */
function hojeEmSaoPaulo(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

export async function saudeDoNumero(
  ctx: ContextoDoCentral,
  supabase: Supa = createServiceClient(),
  agora: Date = new Date(),
): Promise<unknown> {
  const link = linkDoPainel(ctx.grupoId, "/corretor/whatsapp");

  const { data: instancia, error } = await supabase
    .from("corretor_whatsapp_instancias")
    .select(COLUNAS)
    .eq("grupo_id", ctx.grupoId)
    .eq("corretor_id", ctx.corretorId)
    .maybeSingle();
  if (error) return { erro: "Não consegui ler o seu WhatsApp agora." };

  if (!instancia) {
    return {
      conexao: "sem_numero" satisfies EstadoDoNumero,
      resumo: "Você ainda não conectou o seu WhatsApp à plataforma.",
      passo: `Conectar em ${link}, com o celular na mão (QR ou código).`,
      primeiroContato: { limite: `${PRIMEIRO_CONTATO_POR_DIA} por dia e ${PRIMEIRO_CONTATO_POR_SEMANA} por semana`, cabemHoje: 0 },
      niveis: NIVEIS,
    };
  }

  // As listas do corretor: as em andamento dão o "fica para amanhã"; as
  // pendências de todas engrossam o texto da conexão, como na faixa.
  const { data: campanhas } = await supabase
    .from("whatsapp_campanhas")
    .select("id, status")
    .eq("grupo_id", ctx.grupoId)
    .eq("corretor_id", ctx.corretorId);
  const ids = (campanhas ?? []).map((c) => c.id);
  const emAndamento = new Set((campanhas ?? []).filter((c) => c.status === "em_andamento").map((c) => c.id));
  const { data: fila } =
    ids.length > 0
      ? await supabase
          .from("whatsapp_campanhas_fila")
          .select("campanha_id, erro_motivo")
          .eq("grupo_id", ctx.grupoId)
          .in("campanha_id", ids)
          .eq("status", "pendente")
      : { data: [] as { campanha_id: string; erro_motivo: string | null }[] };
  const pendentes = fila?.length ?? 0;
  const falhasDeSessao = (fila ?? []).filter((f) => f.erro_motivo === MOTIVO_SESSAO_CAIU).length;
  const pendentesDaLista = (fila ?? []).filter((f) => emAndamento.has(f.campanha_id)).length;

  // ── Conexão: a régua da faixa do painel ──────────────────────────────
  const conectadoEm = instancia.conectado_em ? new Date(instancia.conectado_em) : null;
  const foto: FotoDaConexao = {
    statusConexao: instancia.status_conexao,
    conectadoEm,
    desconectadoEm: instancia.desconectado_em ? new Date(instancia.desconectado_em) : null,
    bloqueadoAte: instancia.bloqueado_ate ? new Date(instancia.bloqueado_ate) : null,
    enviosCampanhaData: instancia.envios_campanha_data,
    enviosCampanhaContador: instancia.envios_campanha_contador ?? 0,
    pendentes,
    falhasDeSessao,
    sessaoCaidaEm: instancia.sessao_caida_em ? new Date(instancia.sessao_caida_em) : null,
    motivoQuedaCodigo: instancia.motivo_queda_codigo,
  };
  const aviso = avaliarSaudeDaConexao(foto, agora);

  let conexao: EstadoDoNumero;
  let resumo: string;
  let detalhe: string | null = null;
  let passo: string | null = null;
  if (instancia.status_conexao === "conectando") {
    // O pareamento começou (QR ou código pedido) e não terminou. A faixa
    // diria "saiu do ar"; aqui a pessoa provavelmente está no meio dele.
    conexao = "conectando";
    resumo = "O seu WhatsApp está no meio do pareamento: ainda não terminou de conectar.";
    passo = `Terminar em ${link}: ler o QR Code ou digitar o código no celular.`;
  } else if (!aviso || aviso.tipo === "fila_esperando") {
    // Cota do dia esgotada com fila é o sistema funcionando: a parte do
    // limite, abaixo, explica.
    conexao = "conectado";
    resumo = "O seu WhatsApp está conectado e enviando.";
  } else {
    conexao =
      aviso.tipo === "sessao_caiu"
        ? "parou_de_enviar"
        : aviso.tipo === "envios_pausados"
          ? "envios_pausados"
          : foto.conectadoEm === null && foto.desconectadoEm === null
            ? "nunca_conectou"
            : "caiu";
    resumo = aviso.titulo;
    detalhe = aviso.detalhe;
    if (aviso.acao) {
      passo =
        conexao === "parou_de_enviar"
          ? `Em ${link}, tocar em Desconectar e conectar de novo, com o celular na mão.`
          : `Conectar de novo em ${link}, com o celular na mão (QR ou código).`;
    }
  }
  const noAr = conexao === "conectado";
  const desde = conexao === "caiu" ? (foto.desconectadoEm ?? foto.conectadoEm) : null;
  const bloqueado = foto.bloqueadoAte && foto.bloqueadoAte > agora ? foto.bloqueadoAte : null;

  // ── Cota das listas: a mesma do disparador e da tela ─────────────────
  const enviadasHoje =
    instancia.envios_campanha_data === hojeEmSaoPaulo(agora) ? (instancia.envios_campanha_contador ?? 0) : 0;
  const limiteHoje = conectadoEm ? await calcularLimiteDoDia(instancia.id, conectadoEm) : null;
  const saldoHoje = limiteHoje ? Math.max(0, limiteHoje.limite - enviadasHoje) : null;

  // ── Primeiro contato: as peças que o disparador usa, na mesma ordem ──
  const inicio = inicioDoPrimeiroContato(
    conectadoEm,
    instancia.aquecimento_desde ? new Date(instancia.aquecimento_desde) : null,
  );
  const diasDesdeInicio = diasDesde(inicio, agora);
  const feitos = await contarPrimeirosContatos(supabase, ctx.corretorId, agora);
  const cabem = feitos
    ? vagasDePrimeiroContato({ diasDesdeInicio, enviadosHoje: feitos.hoje, enviadosNaSemana: feitos.semana })
    : 0;
  const emAquecimento = inicio !== null && diasDesdeInicio < DIAS_SEM_PRIMEIRO_CONTATO;
  const primeiroContato = semVazios({
    hoje: feitos?.hoje,
    semana: feitos?.semana,
    limite: `${PRIMEIRO_CONTATO_POR_DIA} por dia e ${PRIMEIRO_CONTATO_POR_SEMANA} por semana`,
    cabemHoje: cabem,
    voltaEm:
      emAquecimento && inicio
        ? quandoEmSaoPaulo(new Date(inicio.getTime() + DIAS_SEM_PRIMEIRO_CONTATO * 86_400_000))
        : null,
    porque: emAquecimento
      ? `Nos ${DIAS_SEM_PRIMEIRO_CONTATO} dias depois de o número conectar ou voltar de uma queda, ele só fala com quem já conversou com você.`
      : !feitos
        ? "Não consegui contar os primeiros contatos agora; enquanto não der para contar, nenhum sai."
        : null,
    // Pela lista, o primeiro contato também gasta a cota do número.
    pelaLista:
      saldoHoje !== null && cabem > saldoHoje
        ? `Pela lista, a cota do número deixa só ${saldoHoje} hoje.`
        : null,
  });

  // ── A lista em andamento: quanto sai hoje e quanto fica para amanhã ──
  let lista: Record<string, unknown> | null = null;
  if (pendentesDaLista > 0) {
    if (!noAr) {
      lista = {
        pendentes: pendentesDaLista,
        saemHoje: 0,
        ficamParaDepois: pendentesDaLista,
        porque:
          conexao === "envios_pausados"
            ? "os envios estão pausados para proteger o número e voltam sozinhos"
            : "esperam o número voltar a enviar",
      };
    } else {
      const domingo = momentoEmSaoPaulo(agora).diaSemana === 0;
      const previsao = previsaoDeTermino({
        pendentes: pendentesDaLista,
        // Domingo nada sai (janela de segunda a sábado).
        saldoHoje: domingo ? 0 : saldoHoje,
        agora,
        expediente: {
          inicioHora: Math.max(9, instancia.expediente_inicio ?? 9),
          fimHora: Math.min(21, instancia.expediente_fim ?? 21),
        },
      });
      lista = semVazios({
        pendentes: pendentesDaLista,
        saemHoje: pendentesDaLista - previsao.continuaAmanha,
        ficamParaAmanha: previsao.continuaAmanha,
        terminaHojePor: previsao.terminaHoje && previsao.terminaEm ? quandoEmSaoPaulo(previsao.terminaEm) : null,
        primeiroContato:
          "Quem da lista nunca falou com você entra no teto de primeiro contato: o que passar dele fica para amanhã.",
      });
    }
  }

  return semVazios({
    conexao,
    resumo,
    detalhe,
    conectadoDesde: noAr && conectadoEm ? quandoEmSaoPaulo(conectadoEm) : null,
    caiuEm: desde ? quandoEmSaoPaulo(desde) : null,
    motivo: conexao === "caiu" ? motivoDaQueda(instancia.motivo_queda_codigo) : null,
    enviosPausadosAte: bloqueado ? quandoEmSaoPaulo(bloqueado) : null,
    passo,
    enquantoIsso: noAr ? null : "Enquanto o número não voltar a enviar, nem lista nem primeiro contato saem.",
    listasHoje: limiteHoje
      ? { enviadas: enviadasHoje, limite: limiteHoje.limite, cabem: saldoHoje, explicacao: fraseDoLimite(limiteHoje) }
      : null,
    primeiroContato,
    listaEmAndamento: lista,
    niveis: NIVEIS,
  });
}

export const CONSULTAS_SAUDE: Record<string, Consulta> = {
  saude_do_numero: (ctx) => saudeDoNumero(ctx),
};
export const ACOES_SAUDE: Record<string, Acao> = {};
