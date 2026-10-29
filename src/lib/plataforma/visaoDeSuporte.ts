import "server-only";

import { creciParaExibir } from "@/lib/corretores/cadastroPendente";
import { createServiceClient } from "@/lib/supabase/service";
import { ETAPAS_FUNIL, type EtapaFunil } from "@/lib/types";
import { acessoAindaVale } from "./acessoDeSuporte";

/**
 * As leituras da visão de suporte de UMA conta (`/plataforma/grupos/<id>/
 * suporte`, 29/10/2026). Pela chave de serviço, depois da guarda: cada função
 * pede a PROVA de `exigirAdminDaPlataforma*` no parâmetro, como `grupos.ts`.
 *
 * A regra do produto e da política de privacidade: o administrador da
 * plataforma NUNCA vê conversa, mensagem, dossiê, nota nem identidade de lead
 * (nome, telefone, e-mail). Aqui `leads` e `visitas` só são CONTADOS
 * (`head: true`: nenhuma linha volta). A equipe (corretores) é o pessoal do
 * cliente, não cliente final: nome, papel, situação, se o CRECI está
 * preenchido e o último login — o mesmo que a tela de acessos já mostra. Do
 * WhatsApp, só o status da conexão de cada número, nunca o número nem
 * mensagem. A guarda `servicoComGrupo.test.ts` (categoria
 * `plataforma-admin`) e `visaoDeSuporte.test.ts` cobram isso.
 */

type Servico = ReturnType<typeof createServiceClient>;

function contagem(resposta: { count: number | null; error: { message: string } | null }, oQue: string): number {
  if (resposta.error) throw new Error(`Falha ao contar ${oQue}: ${resposta.error.message}`);
  return resposta.count ?? 0;
}

export type AcessoDeSuporte = { id: string; criadoEm: string; motivo: string | null };

/**
 * O acesso registrado que libera a tela: do PRÓPRIO administrador da sessão,
 * para ESTE grupo, e recente (`acessoAindaVale`). `null` = a tela pede o
 * registro antes de mostrar qualquer número.
 */
export async function lerAcessoDeSuporte(
  prova: { userId: string },
  grupoId: string,
  acessoId: string,
  agora: Date = new Date(),
): Promise<AcessoDeSuporte | null> {
  const servico = createServiceClient();
  const { data, error } = await servico
    .from("acessos_de_suporte")
    .select("id, criado_em, motivo, admin_user_id, grupo_alvo_id")
    .eq("id", acessoId)
    .eq("grupo_alvo_id", grupoId)
    .eq("admin_user_id", prova.userId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler o acesso de suporte: ${error.message}`);
  if (!data || !acessoAindaVale(data.criado_em, agora)) return null;
  return { id: data.id, criadoEm: data.criado_em, motivo: data.motivo };
}

export type FunilEmNumeros = {
  /** Leads não arquivados por etapa. */
  porEtapa: Record<EtapaFunil, number>;
  arquivados: number;
  criadosEm7Dias: number;
  criadosEm30Dias: number;
  /** Visitas marcadas daqui para a frente (status `marcada`). */
  visitasMarcadas: number;
};

/** O funil da conta só em contagens: nenhuma linha de lead nem de visita volta. */
export async function lerFunilEmNumeros(
  _prova: { userId: string },
  grupoId: string,
  agora: Date = new Date(),
): Promise<FunilEmNumeros> {
  const servico = createServiceClient();
  const ha = (dias: number) => new Date(agora.getTime() - dias * 86_400_000).toISOString();
  const [porEtapa, arquivados, em7, em30, visitas] = await Promise.all([
    Promise.all(
      ETAPAS_FUNIL.map(async (etapa) => {
        const r = await servico
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("grupo_id", grupoId)
          .eq("etapa", etapa)
          .is("arquivado_em", null);
        return [etapa, contagem(r, `leads em ${etapa}`)] as const;
      }),
    ),
    servico
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("grupo_id", grupoId)
      .not("arquivado_em", "is", null),
    servico
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("grupo_id", grupoId)
      .gte("created_at", ha(7)),
    servico
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("grupo_id", grupoId)
      .gte("created_at", ha(30)),
    servico
      .from("visitas")
      .select("id", { count: "exact", head: true })
      .eq("grupo_id", grupoId)
      .eq("status", "marcada")
      .gte("inicio", agora.toISOString()),
  ]);
  return {
    porEtapa: Object.fromEntries(porEtapa) as Record<EtapaFunil, number>,
    arquivados: contagem(arquivados, "leads arquivados"),
    criadosEm7Dias: contagem(em7, "leads dos últimos 7 dias"),
    criadosEm30Dias: contagem(em30, "leads dos últimos 30 dias"),
    visitasMarcadas: contagem(visitas, "visitas marcadas"),
  };
}

export type StatusDoWhatsapp = "conectado" | "conectando" | "desconectado";

export type PessoaDaEquipe = {
  corretorId: string;
  nome: string;
  papel: "corretor" | "gestor";
  ativo: boolean;
  /** O CRECI está preenchido de verdade (não é o marcador `PENDENTE-`/`PREENCHER-`). */
  creciOk: boolean;
  temLogin: boolean;
  /** Último login no Auth; `null` = nunca entrou (ou o Auth não respondeu). */
  ultimoAcesso: string | null;
  /** Um status por número cadastrado do corretor (normalmente um). */
  whatsapp: { status: StatusDoWhatsapp; desde: string | null }[];
};

function statusDoWhatsapp(valor: string): StatusDoWhatsapp {
  return valor === "conectado" || valor === "conectando" ? valor : "desconectado";
}

/**
 * A equipe da conta com o status do WhatsApp de cada um. O último login vem
 * do Auth, um por login (a equipe de uma conta é pequena; a prontidão da
 * equipe do gestor faz a mesma leitura).
 */
export async function lerEquipeDoSuporte(_prova: { userId: string }, grupoId: string): Promise<PessoaDaEquipe[]> {
  const servico = createServiceClient();
  const [fichas, instancias] = await Promise.all([
    servico
      .from("corretores")
      .select("id, nome, papel, ativo, creci, user_id")
      .eq("grupo_id", grupoId)
      .order("ativo", { ascending: false })
      .order("nome", { ascending: true }),
    servico
      .from("corretor_whatsapp_instancias")
      .select("corretor_id, status_conexao, conectado_em, desconectado_em")
      .eq("grupo_id", grupoId),
  ]);
  if (fichas.error) throw new Error(`Falha ao ler a equipe: ${fichas.error.message}`);
  if (instancias.error) throw new Error(`Falha ao ler os WhatsApps: ${instancias.error.message}`);
  const logins = await ultimosLogins(
    servico,
    (fichas.data ?? []).flatMap((c) => (c.user_id ? [c.user_id] : [])),
  );
  return (fichas.data ?? []).map((c) => ({
    corretorId: c.id,
    nome: c.nome,
    papel: c.papel === "gestor" ? "gestor" : "corretor",
    ativo: c.ativo,
    creciOk: creciParaExibir(c.creci) !== null,
    temLogin: c.user_id !== null,
    ultimoAcesso: c.user_id ? (logins.get(c.user_id) ?? null) : null,
    whatsapp: (instancias.data ?? [])
      .filter((i) => i.corretor_id === c.id)
      .map((i) => {
        const status = statusDoWhatsapp(i.status_conexao);
        return { status, desde: status === "conectado" ? i.conectado_em : i.desconectado_em };
      }),
  }));
}

/** `last_sign_in_at` de cada login; o que o Auth não devolver fica fora (vira "sem registro"). */
async function ultimosLogins(servico: Servico, userIds: string[]): Promise<Map<string, string | null>> {
  const saida = new Map<string, string | null>();
  await Promise.all(
    userIds.map(async (id) => {
      const { data, error } = await servico.auth.admin.getUserById(id);
      if (error) {
        console.error(`[plataforma] login ${id} não lido no Auth: ${error.message}`);
        return;
      }
      saida.set(id, data.user?.last_sign_in_at ?? null);
    }),
  );
  return saida;
}
