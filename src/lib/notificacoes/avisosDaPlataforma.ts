import "server-only";
import { after } from "next/server";
import { lerCobrancaDoGrupo } from "@/lib/planos/cobrancaDoGrupo";
import { resumoDosRiscos } from "@/lib/plataforma/riscoDeCancelamento";
import { lerRiscosDasContas } from "@/lib/plataforma/sinaisDeRisco";
import { createServiceClient } from "@/lib/supabase/service";
import { notificarAdminsDaPlataforma, type Notificacao } from "./push";
import { horaEMinutoEmSP } from "./relogio";
import { resumoDasCobrancas, type CobrancaParaAviso } from "./regrasDosAvisosDaPlataforma";

/**
 * Os atendimentos da Astro no celular de quem administra a plataforma
 * (29/10/2026, 0239): conta nova, conta suspensa ou reativada, e o resumo
 * diário das mensalidades atrasadas. O pedido de contratação avisa de
 * `astro/contratar/acoes.ts`; o pedido de suporte, de onde ele nasce.
 *
 * Tudo DEPOIS da resposta (`after`) e sem lançar: aviso é bônus, nunca motivo
 * de a ação do ADM falhar.
 */

/**
 * `after` fora de uma requisição (teste, script) lança: aviso nunca derruba
 * a ação, então o agendamento em si também é protegido.
 */
function depoisDaResposta(fn: () => Promise<unknown>): void {
  try {
    after(fn);
  } catch {
    // Sem requisição em curso: não há resposta para esperar; o aviso não sai.
  }
}

/**
 * Um atendimento novo (contato pelo site, suporte pelo painel; 0240,
 * 29/10/2026) no celular dos administradores, depois da resposta. Quem chama
 * monta o texto; ele nunca leva telefone, e-mail nem dado de lead.
 */
export function avisarAtendimento(n: Notificacao): void {
  depoisDaResposta(() => notificarAdminsDaPlataforma(createServiceClient(), n));
}

/** Conta criada pela plataforma (avisa o OUTRO ADM; quem criou também recebe). */
export function avisarContaNova(nome: string, tipo: string): void {
  depoisDaResposta(() =>
    notificarAdminsDaPlataforma(createServiceClient(), {
      titulo: "Conta nova na Astro",
      corpo: `${nome} (${tipo === "independente" ? "corretor independente" : "imobiliária"}) foi criada.`,
      url: "/plataforma",
      tag: "conta-nova",
    }),
  );
}

/** Suspensão ou reativação feita à mão na plataforma (o nome vem de quem chama). */
export function avisarSituacaoDaConta(grupoId: string, nome: string, para: "suspenso" | "ativo"): void {
  depoisDaResposta(() =>
    notificarAdminsDaPlataforma(createServiceClient(), {
      titulo: para === "suspenso" ? "Conta suspensa" : "Conta reativada",
      corpo: `${nome} foi ${para === "suspenso" ? "suspensa" : "reativada"}.`,
      url: `/plataforma/grupos/${grupoId}`,
      tag: `situacao-${grupoId}`,
    }),
  );
}

/**
 * O resumo diário das mensalidades (no tique dos follow-ups): às 9h de São
 * Paulo, no primeiro tique da hora (minuto < 5, o tique é de 5 em 5 min), uma
 * notificação só com as contas pendentes e as suspensas por atraso. Sem
 * nenhuma, não avisa. Devolve 1 se avisou.
 *
 * Grupo a grupo pela mesma conta do painel (`lerCobrancaDoGrupo`): o número
 * é o que o cliente vê na faixa de cobrança dele.
 */
export async function avisarCobrancasDoDia(agora: Date = new Date()): Promise<number> {
  const { hora, minuto } = horaEMinutoEmSP(agora);
  if (hora !== 9 || minuto >= 5) return 0;
  const servico = createServiceClient();
  const { data: grupos, error } = await servico
    .from("grupos")
    .select("id, nome")
    .neq("situacao", "encerrado")
    .is("cancelado_em", null);
  if (error || !grupos?.length) return 0;

  const nomes = new Map(grupos.map((g) => [g.id, g.nome]));
  const lista: CobrancaParaAviso[] = [];
  for (const { id: grupoId } of grupos) {
    const s = await lerCobrancaDoGrupo(grupoId, agora);
    lista.push({
      nome: nomes.get(grupoId) ?? "Conta",
      estado: s.estado,
      diasDeAtraso: s.diasDeAtraso,
      temEmAberto: s.competenciaEmAberto !== null,
    });
  }
  const resumo = resumoDasCobrancas(lista);
  if (!resumo) return 0;
  await notificarAdminsDaPlataforma(servico, { ...resumo, url: "/plataforma", tag: "cobrancas-do-dia" });
  return 1;
}

/**
 * O alerta diário de risco de cancelamento (29/10/2026), no mesmo tique e na
 * mesma hora do resumo das mensalidades: às 9h de São Paulo, no primeiro
 * tique da hora. Uma notificação com as contas de risco médio ou alto (até
 * três nomes e o motivo principal de cada uma; a lista inteira, com os
 * motivos, está em `/plataforma?ver=risco`). Sem conta em risco, ou sem
 * conseguir medir, não avisa. Devolve 1 se avisou.
 *
 * Os sinais saem de `lerRiscosDasContas` (laço por grupo, só contagens).
 */
export async function avisarRiscosDoDia(agora: Date = new Date()): Promise<number> {
  const { hora, minuto } = horaEMinutoEmSP(agora);
  if (hora !== 9 || minuto >= 5) return 0;
  const riscos = await lerRiscosDasContas(agora);
  if (!riscos) return 0;
  const resumo = resumoDosRiscos(riscos);
  if (!resumo) return 0;
  await notificarAdminsDaPlataforma(createServiceClient(), { ...resumo, url: "/plataforma?ver=risco", tag: "riscos-do-dia" });
  return 1;
}
