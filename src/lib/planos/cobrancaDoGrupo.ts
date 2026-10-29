import "server-only";

import { diaEmSP } from "@/lib/crm/resumoDoDia";
import { createServiceClient } from "@/lib/supabase/service";
import { estaSuspenso, situacaoDaCobranca, type SituacaoDaCobranca } from "./cobranca";

/**
 * A situação da cobrança de um grupo (fase 2C), a mesma conta em todo lugar
 * (`cobranca.ts`).
 *
 * Pela chave de serviço: `pagamentos_do_grupo` não tem grant para ninguém, e
 * `mensalidade`/`dia_do_vencimento` também não. Toda leitura leva o grupo no
 * filtro; o grupo vem de quem chama, que já o validou (a instância do
 * webhook, a sessão do painel).
 *
 * Falha de leitura NÃO suspende: devolve `em_dia` (com log), como a cota da
 * IA. "Não sei se pagou" calaria o atendimento de todos os clientes do grupo
 * por uma piscada do banco, e isso é pior que um dia a mais de serviço.
 */
export async function lerCobrancaDoGrupo(grupoId: string, agora: Date = new Date()): Promise<SituacaoDaCobranca> {
  const servico = createServiceClient();
  const [grupo, pagamentos] = await Promise.all([
    servico.from("grupos").select("plano, situacao, criado_em, dia_do_vencimento, teste_ate").eq("id", grupoId).maybeSingle(),
    servico.from("pagamentos_do_grupo").select("competencia").eq("grupo_id", grupoId),
  ]);

  const erro = grupo.error ?? pagamentos.error;
  if (erro || !grupo.data) {
    console.error(
      `[cobrança] grupo ${grupoId}: leitura falhou, a operação segue liberada: ${erro?.message ?? "grupo não encontrado"}`,
    );
    return {
      estado: "em_dia",
      competenciaEmAberto: null,
      vencimento: null,
      diasDeAtraso: 0,
      suspendeEm: null,
      proximoVencimento: diaEmSP(agora),
      fimDoTeste: null,
      diasDeTesteRestantes: 0,
      testeTerminouSemPagamento: false,
      emAberto: [],
    };
  }

  return situacaoDaCobranca({
    plano: grupo.data.plano,
    suspensoManual: grupo.data.situacao === "suspenso",
    criadoEm: grupo.data.criado_em,
    diaDoVencimento: grupo.data.dia_do_vencimento,
    competenciasPagas: (pagamentos.data ?? []).map((p) => p.competencia),
    hoje: agora,
    testeAte: grupo.data.teste_ate,
  });
}

/** O grupo está suspenso (à mão ou por atraso)? Erro de leitura = não. */
export async function grupoSuspenso(grupoId: string, agora: Date = new Date()): Promise<boolean> {
  return estaSuspenso(await lerCobrancaDoGrupo(grupoId, agora));
}

/**
 * A assinatura do grupo no Asaas (0241), para o botão "Pagar agora" do
 * painel: `null` sem assinatura ou com erro de leitura (o botão só some).
 * Lê UMA linha pelo id que quem chama validou (a sessão do painel).
 */
export async function lerAssinaturaDoGrupo(grupoId: string): Promise<string | null> {
  const { data, error } = await createServiceClient()
    .from("grupos")
    .select("asaas_assinatura_id")
    .eq("id", grupoId)
    .maybeSingle();
  if (error) {
    console.error(`[cobrança] assinatura do grupo ${grupoId} não lida: ${error.message}`);
    return null;
  }
  return data?.asaas_assinatura_id ?? null;
}
