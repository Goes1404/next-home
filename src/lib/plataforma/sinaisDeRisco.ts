import "server-only";

import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { lerCobrancaDoGrupo } from "@/lib/planos/cobrancaDoGrupo";
import { createServiceClient } from "@/lib/supabase/service";
import { maisRecente } from "./painelDeNumeros";
import {
  calcularRisco,
  DIAS_DA_JANELA_DE_LEADS,
  whatsappForaDesde,
  type ContaEmRisco,
  type SinaisDeRisco,
} from "./riscoDeCancelamento";

/**
 * Os sinais do risco de cancelamento, conta a conta (29/10/2026). Usado pelo
 * aviso diário das 9h aos administradores (`avisarRiscosDoDia`, no tique dos
 * follow-ups) e pelas telas da plataforma (lista de contas e tela da conta),
 * que chamam depois de `exigirAdminDaPlataformaNaPagina`.
 *
 * `agrega-por-grupo` na guarda `servicoComGrupo.test.ts`: lê a lista de
 * grupos e roda o laço `for (const { id: grupoId } of grupos)`; toda outra
 * leitura filtra o grupo da volta (`grupo_id`, ou `grupo_origem_id` nos
 * chamados, que são tabela global). Só CONTAGENS e datas: leads contados com
 * `head: true` (nenhuma linha volta), nada de conversa, ficha nem nome de
 * cliente. Os logins vêm do Auth (`last_sign_in_at`), casados pela ficha.
 *
 * A conta da casa (Next Home) e as canceladas ficam de fora. Falha numa
 * conta tira só ela da lista (com log); falha na lista de contas ou no Auth
 * devolve `null` e a tela diz "não medido".
 */

type Servico = ReturnType<typeof createServiceClient>;

const DIA = 86_400_000;
const POR_PAGINA = 1000;
/** Teto de páginas do Auth: 20 mil logins, como `atividade.ts`. */
const PAGINAS_DO_AUTH = 20;

/** O último login de cada usuário do Auth, numa ou duas chamadas. */
async function loginsDoAuth(servico: Servico): Promise<Map<string, string | null>> {
  const porUsuario = new Map<string, string | null>();
  for (let pagina = 1; pagina <= PAGINAS_DO_AUTH; pagina++) {
    const { data, error } = await servico.auth.admin.listUsers({ page: pagina, perPage: POR_PAGINA });
    if (error) throw new Error(`logins não listados: ${error.message}`);
    const usuarios = data?.users ?? [];
    for (const u of usuarios) porUsuario.set(u.id, u.last_sign_in_at ?? null);
    if (usuarios.length < POR_PAGINA) return porUsuario;
  }
  throw new Error("logins passaram do teto de páginas");
}

/** Os sinais de UMA conta, cada leitura filtrada por ela. */
async function sinaisDoGrupo(
  servico: Servico,
  grupoId: string,
  criadoEm: string,
  logins: Map<string, string | null>,
  agora: Date,
): Promise<SinaisDeRisco> {
  const meio = new Date(agora.getTime() - DIAS_DA_JANELA_DE_LEADS * DIA).toISOString();
  const inicio = new Date(agora.getTime() - 2 * DIAS_DA_JANELA_DE_LEADS * DIA).toISOString();
  const [fichas, recentes, anteriores, instancias, chamados, cobranca] = await Promise.all([
    servico
      .from("corretores")
      .select("user_id")
      .eq("grupo_id", grupoId)
      .eq("ativo", true)
      .not("user_id", "is", null),
    servico.from("leads").select("id", { count: "exact", head: true }).eq("grupo_id", grupoId).gte("created_at", meio),
    servico
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("grupo_id", grupoId)
      .gte("created_at", inicio)
      .lt("created_at", meio),
    servico
      .from("corretor_whatsapp_instancias")
      .select("status_conexao, desconectado_em, sessao_caida_em, conectado_em, created_at")
      .eq("grupo_id", grupoId),
    servico
      .from("chamados_de_suporte")
      .select("id", { count: "exact", head: true })
      .eq("grupo_origem_id", grupoId)
      .in("status", ["novo", "em_atendimento"]),
    lerCobrancaDoGrupo(grupoId, agora),
  ]);
  const erro = fichas.error ?? recentes.error ?? anteriores.error ?? instancias.error ?? chamados.error;
  if (erro) throw new Error(erro.message);

  return {
    ultimoLoginDaEquipe: maisRecente((fichas.data ?? []).map((f) => (f.user_id ? (logins.get(f.user_id) ?? null) : null))),
    leadsUltimasDuasSemanas: recentes.count ?? 0,
    leadsDuasSemanasAntes: anteriores.count ?? 0,
    whatsappForaDesde: whatsappForaDesde(instancias.data ?? [], criadoEm),
    mensalidadeEmAberto: cobranca.estado === "pendente" || cobranca.estado === "suspenso",
    chamadosAbertos: chamados.count ?? 0,
  };
}

/**
 * O risco de cada conta viva (fora a da casa). `null` quando a lista de
 * contas ou os logins não puderam ser lidos.
 */
export async function lerRiscosDasContas(agora: Date = new Date()): Promise<ContaEmRisco[] | null> {
  const servico = createServiceClient();
  const { data: grupos, error } = await servico
    .from("grupos")
    .select("id, nome, criado_em")
    .neq("situacao", "encerrado")
    .is("cancelado_em", null)
    .neq("id", GRUPO_NEXT_HOME_ID);
  if (error) {
    console.error(`[risco] contas não lidas: ${error.message}`);
    return null;
  }
  if (!grupos?.length) return [];

  let logins: Map<string, string | null>;
  try {
    logins = await loginsDoAuth(servico);
  } catch (e) {
    console.error(`[risco] ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }

  const dados = new Map(grupos.map((g) => [g.id, g]));
  const lista: ContaEmRisco[] = [];
  for (const { id: grupoId } of grupos) {
    const conta = dados.get(grupoId)!;
    try {
      const sinais = await sinaisDoGrupo(servico, grupoId, conta.criado_em, logins, agora);
      lista.push({ grupoId, nome: conta.nome, risco: calcularRisco(sinais, agora) });
    } catch (e) {
      console.error(`[risco] conta ${grupoId} não medida: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return lista;
}

/**
 * O risco de UMA conta, para a tela dela na plataforma. Os logins vêm do Auth
 * um a um (só as fichas desta conta), em vez da lista inteira.
 */
export async function lerRiscoDaConta(grupoId: string, agora: Date = new Date()): Promise<ContaEmRisco | null> {
  if (grupoId === GRUPO_NEXT_HOME_ID) return null;
  const servico = createServiceClient();
  try {
    const { data: conta, error } = await servico.from("grupos").select("id, nome, criado_em").eq("id", grupoId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!conta) return null;
    const { data: fichas, error: erroDasFichas } = await servico
      .from("corretores")
      .select("user_id")
      .eq("grupo_id", grupoId)
      .eq("ativo", true)
      .not("user_id", "is", null);
    if (erroDasFichas) throw new Error(erroDasFichas.message);
    const logins = new Map<string, string | null>();
    for (const f of fichas ?? []) {
      if (!f.user_id) continue;
      const { data } = await servico.auth.admin.getUserById(f.user_id);
      logins.set(f.user_id, data?.user?.last_sign_in_at ?? null);
    }
    const sinais = await sinaisDoGrupo(servico, grupoId, conta.criado_em, logins, agora);
    return { grupoId, nome: conta.nome, risco: calcularRisco(sinais, agora) };
  } catch (e) {
    console.error(`[risco] conta ${grupoId} não medida: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
