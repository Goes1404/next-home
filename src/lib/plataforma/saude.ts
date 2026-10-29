import "server-only";

import { cambioUsdBrl, custoDaIa, type CustoDaIa } from "@/lib/planos/custoDaIa";
import { mesEmSaoPaulo } from "@/lib/planos/cotaDaIa";
import { createServiceClient } from "@/lib/supabase/service";
import { saudeDoGrupo, type MotivoDeSaude, type NivelDeSaude } from "./saudeDoGrupo";
import type { ResumoDeGrupo } from "./grupos";

/**
 * Saúde e custo da IA de VÁRIOS grupos de uma vez (plataforma, 21/10/2026).
 *
 * Pela chave de serviço, e só depois da guarda: cada função pede a PROVA de
 * `exigirAdminDaPlataforma*`, como em `grupos.ts`. Nada de conversa: a
 * telemetria vem AGREGADA pelas funções `consumo_da_ia_por_grupo` (0233, o
 * livro de TODA chamada paga) e `saude_da_ia_por_grupo` (0211), que devolvem
 * contagens e somas. Uma
 * consulta por fonte para todos os grupos da lista (sem N+1), sempre com o
 * conjunto de grupos explícito.
 *
 * Falha de leitura derruba a tela, como em `grupos.ts`: semáforo verde por
 * engano esconderia justamente o grupo doente.
 */

export type SaudeDaPlataforma = {
  nivel: NivelDeSaude;
  motivos: MotivoDeSaude[];
  whatsapp: { conectados: number; cadastrados: number };
  /** A última resposta da IA de sempre; `null` = nunca respondeu. */
  ultimaRespostaEm: string | null;
  errosDeEnvioNas24h: number;
  fallbacksNas24h: number;
  /** Mensalidade em reais; `null` = não definida. */
  mensalidade: number | null;
  custo: CustoDaIa;
  cambio: number;
};

const NA_PAGINA = 1000;

/** Lê todas as páginas de uma consulta (o PostgREST corta em 1.000 linhas). */
async function lerTudo<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, oQue: string): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += NA_PAGINA) {
    const { data, error } = await pagina(de, de + NA_PAGINA - 1);
    if (error) throw new Error(`Falha ao ler ${oQue}: ${error.message}`);
    todas.push(...(data ?? []));
    if ((data?.length ?? 0) < NA_PAGINA) return todas;
  }
}

/** O instante em que o mês corrente começa em São Paulo. */
function inicioDoMesEmSaoPaulo(agora: Date): Date {
  return new Date(`${mesEmSaoPaulo(agora)}T00:00:00-03:00`);
}

// A prova não é lida: existe para o chamador não conseguir pular a guarda.
export async function lerSaudeDosGrupos(_prova: { userId: string }, grupos: ResumoDeGrupo[], agora: Date = new Date()): Promise<Record<string, SaudeDaPlataforma>> {
  if (grupos.length === 0) return {};
  const servico = createServiceClient();
  const ids = grupos.map((g) => g.id);
  const inicioDoMes = inicioDoMesEmSaoPaulo(agora).toISOString();
  const ha24h = new Date(agora.getTime() - 24 * 3_600_000).toISOString();

  const [mensalidades, custos, sinais, corretores, instancias] = await Promise.all([
    servico.from("grupos").select("id, mensalidade").in("id", ids),
    servico.rpc("consumo_da_ia_por_grupo", { p_inicio: inicioDoMes }),
    servico.rpc("saude_da_ia_por_grupo", { p_desde: ha24h }),
    lerTudo(
      (de, ate) =>
        servico.from("corretores").select("id, grupo_id").in("grupo_id", ids).eq("ativo", true).order("id").range(de, ate),
      "os corretores ativos",
    ),
    lerTudo(
      (de, ate) =>
        servico
          .from("corretor_whatsapp_instancias")
          .select("corretor_id, grupo_id, status_conexao")
          .in("grupo_id", ids)
          .order("id")
          .range(de, ate),
      "os WhatsApps",
    ),
  ]);
  if (mensalidades.error) throw new Error(`Falha ao ler as mensalidades: ${mensalidades.error.message}`);
  if (custos.error) throw new Error(`Falha ao ler o custo da IA: ${custos.error.message}`);
  if (sinais.error) throw new Error(`Falha ao ler a saúde da IA: ${sinais.error.message}`);

  const cambio = cambioUsdBrl();
  const mensalidadeDe = new Map((mensalidades.data ?? []).map((m) => [m.id, m.mensalidade === null ? null : Number(m.mensalidade)]));
  const ativos = new Set(corretores.map((c) => c.id));
  const sinaisDe = new Map((sinais.data ?? []).map((s) => [s.grupo_id, s]));

  const resultado: Record<string, SaudeDaPlataforma> = {};
  for (const g of grupos) {
    // Só o WhatsApp de corretor ativo conta: o de quem saiu não é problema do grupo.
    const numeros = instancias.filter((i) => i.grupo_id === g.id && ativos.has(i.corretor_id));
    const conectados = numeros.filter((i) => i.status_conexao === "conectado").length;
    const s = sinaisDe.get(g.id);
    const mensalidade = mensalidadeDe.get(g.id) ?? null;
    const custo = custoDaIa({
      tokens: (custos.data ?? [])
        .filter((c) => c.grupo_id === g.id)
        .map((c) => ({
          modelo: c.modelo,
          finalidade: c.finalidade,
          chamadas: Number(c.chamadas),
          tokensEntrada: Number(c.tokens_entrada),
          tokensSaida: Number(c.tokens_saida),
          segundosDeAudio: Number(c.segundos_de_audio),
        })),
      respostas: g.usoDaIa.respostas,
      mensalidade,
      cambio,
    });
    const { nivel, motivos } = saudeDoGrupo({
      situacao: g.situacao,
      corretoresAtivos: g.corretoresAtivos,
      whatsappsConectados: conectados,
      whatsappsCadastrados: numeros.length,
      tentativasNas24h: Number(s?.tentativas ?? 0),
      respondidasNas24h: Number(s?.respondidas ?? 0),
      errosDeEnvioNas24h: Number(s?.erros_de_envio ?? 0),
      fallbacksNas24h: Number(s?.fallbacks ?? 0),
      cota: g.usoDaIa,
      cobranca: g.cobranca,
      custo: custo.fracaoDaMensalidade === null ? null : { alerta: custo.alerta, percentual: custo.fracaoDaMensalidade * 100 },
    });
    resultado[g.id] = {
      nivel,
      motivos,
      whatsapp: { conectados, cadastrados: numeros.length },
      ultimaRespostaEm: s?.ultima_resposta_em ?? null,
      errosDeEnvioNas24h: Number(s?.erros_de_envio ?? 0),
      fallbacksNas24h: Number(s?.fallbacks ?? 0),
      mensalidade,
      custo,
      cambio,
    };
  }
  return resultado;
}
