import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";

/**
 * As leituras do painel da plataforma (fase 2A, desenho §11).
 *
 * Pela chave de serviço, porque o administrador da plataforma lê TODOS os
 * grupos e a RLS (0184) recorta a sessão ao grupo de quem está logado. Por
 * isso cada função pede a PROVA da guarda (`exigirAdminDaPlataforma*`,
 * `src/lib/guardas.ts`) no parâmetro: quem chama não tem como esquecê-la, e a
 * guarda `servicoComGrupo.test.ts` (categoria `plataforma-admin`) confere que
 * todo importador a chama antes.
 *
 * O que fica de fora é a outra metade da regra: só cadastro e contagens
 * (`head: true`), nunca conversa, mensagem, dossiê nem ficha de lead (§4).
 */

type Grupo = Database["public"]["Tables"]["grupos"]["Row"];

export type ResumoDeGrupo = {
  id: string;
  nome: string;
  slug: string;
  tipo: Grupo["tipo"];
  plano: Grupo["plano"];
  situacao: Grupo["situacao"];
  criadoEm: string;
  /** Fichas de corretor ativas no grupo. */
  corretoresAtivos: number;
  /** Desses, quantos têm login (`user_id`). */
  comLogin: number;
  /** Números de WhatsApp do grupo que estão no ar agora. */
  numerosConectados: number;
};

type Servico = ReturnType<typeof createServiceClient>;

/** Contagem que falha derruba a tela: zero calado mentiria sobre o grupo. */
function contagem(resposta: { count: number | null; error: { message: string } | null }, oQue: string): number {
  if (resposta.error) throw new Error(`Falha ao contar ${oQue}: ${resposta.error.message}`);
  return resposta.count ?? 0;
}

async function contarDoGrupo(servico: Servico, grupoId: string) {
  const [ativos, comLogin, conectados] = await Promise.all([
    servico
      .from("corretores")
      .select("id", { count: "exact", head: true })
      .eq("grupo_id", grupoId)
      .eq("ativo", true),
    servico
      .from("corretores")
      .select("id", { count: "exact", head: true })
      .eq("grupo_id", grupoId)
      .eq("ativo", true)
      .not("user_id", "is", null),
    servico
      .from("corretor_whatsapp_instancias")
      .select("id", { count: "exact", head: true })
      .eq("grupo_id", grupoId)
      .eq("status_conexao", "conectado"),
  ]);
  return {
    corretoresAtivos: contagem(ativos, "corretores ativos"),
    comLogin: contagem(comLogin, "corretores com login"),
    numerosConectados: contagem(conectados, "números conectados"),
  };
}

/** Todos os grupos da plataforma, do mais antigo ao mais novo, com os números de cada um. */
// A prova não é lida: existe para o chamador não conseguir pular a guarda.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function listarGruposDaPlataforma(_prova: { userId: string }): Promise<ResumoDeGrupo[]> {
  const servico = createServiceClient();
  const { data, error } = await servico
    .from("grupos")
    .select("id, nome, slug, tipo, plano, situacao, criado_em")
    .order("criado_em", { ascending: true });
  if (error) throw new Error(`Falha ao listar os grupos: ${error.message}`);

  return Promise.all(
    (data ?? []).map(async (g) => ({
      id: g.id,
      nome: g.nome,
      slug: g.slug,
      tipo: g.tipo,
      plano: g.plano,
      situacao: g.situacao,
      criadoEm: g.criado_em,
      ...(await contarDoGrupo(servico, g.id)),
    })),
  );
}

/** O cadastro de um grupo, como a tela de grupo da plataforma mostra e edita. */
export type CadastroDeGrupo = ResumoDeGrupo & {
  contatoNome: string | null;
  contatoEmail: string | null;
  contatoTelefone: string | null;
  razaoSocial: string | null;
  documento: string | null;
  creci: string | null;
  creciTipo: "J" | "F" | null;
  encarregadoNome: string | null;
  encarregadoEmail: string | null;
};

/**
 * Um grupo pelo id, com o cadastro e os números; `null` se não existe. A
 * prova não é lida: existe para o chamador não conseguir pular a guarda.
 */
export async function lerGrupoDaPlataforma(_prova: { userId: string }, grupoId: string): Promise<CadastroDeGrupo | null> {
  const servico = createServiceClient();
  const { data: g, error } = await servico
    .from("grupos")
    .select(
      "id, nome, slug, tipo, plano, situacao, criado_em, contato_cobranca_nome, contato_cobranca_email, contato_cobranca_telefone, razao_social, documento, creci, creci_tipo, encarregado_lgpd_nome, encarregado_lgpd_email",
    )
    .eq("id", grupoId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler o grupo: ${error.message}`);
  if (!g) return null;
  return {
    id: g.id,
    nome: g.nome,
    slug: g.slug,
    tipo: g.tipo,
    plano: g.plano,
    situacao: g.situacao,
    criadoEm: g.criado_em,
    contatoNome: g.contato_cobranca_nome,
    contatoEmail: g.contato_cobranca_email,
    contatoTelefone: g.contato_cobranca_telefone,
    razaoSocial: g.razao_social,
    documento: g.documento,
    creci: g.creci,
    creciTipo: g.creci_tipo,
    encarregadoNome: g.encarregado_lgpd_nome,
    encarregadoEmail: g.encarregado_lgpd_email,
    ...(await contarDoGrupo(servico, g.id)),
  };
}
