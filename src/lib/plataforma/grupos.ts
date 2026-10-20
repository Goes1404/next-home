import "server-only";

import { mesEmSaoPaulo, situacaoDaCota, tetoDeRespostasDaIa, type SituacaoDaCota } from "@/lib/planos/cotaDaIa";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";

/**
 * As leituras do painel da plataforma (fase 2A, desenho §11).
 *
 * Pela chave de serviço, porque o administrador da plataforma lê TODOS os
 * grupos e a RLS (0193) recorta a sessão ao grupo de quem está logado. Por
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
  /** Teto de respostas da IA ajustado pela plataforma; `null` = o do plano. */
  tetoAjustado: number | null;
  /** O teto que o plano daria sozinho (com os assentos); `null` = sem teto. */
  tetoDoPlano: number | null;
  /** Respostas da IA no mês (São Paulo) contra o teto (fase 2B). */
  usoDaIa: SituacaoDaCota;
};

type Servico = ReturnType<typeof createServiceClient>;

/** Contagem que falha derruba a tela: zero calado mentiria sobre o grupo. */
function contagem(resposta: { count: number | null; error: { message: string } | null }, oQue: string): number {
  if (resposta.error) throw new Error(`Falha ao contar ${oQue}: ${resposta.error.message}`);
  return resposta.count ?? 0;
}

/**
 * As contagens do grupo e o uso da IA no mês. A conta do teto é a de
 * `src/lib/planos/cotaDaIa.ts`, a mesma do webhook; a leitura é daqui
 * porque a plataforma quer o erro em voz alta (a lista cai), e o webhook
 * quer o contrário (a IA segue respondendo).
 */
async function contarDoGrupo(
  servico: Servico,
  grupo: { id: string; plano: Grupo["plano"]; teto_respostas_ia: number | null },
) {
  const grupoId = grupo.id;
  const [ativos, comLogin, conectados, instancias, uso] = await Promise.all([
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
    // Os assentos da cota (provisório): todo número cadastrado no grupo.
    servico.from("corretor_whatsapp_instancias").select("id", { count: "exact", head: true }).eq("grupo_id", grupoId),
    servico.from("uso_da_ia").select("respostas").eq("grupo_id", grupoId).eq("mes", mesEmSaoPaulo()).maybeSingle(),
  ]);
  if (uso.error) throw new Error(`Falha ao ler o uso da IA: ${uso.error.message}`);
  const assentos = contagem(instancias, "números cadastrados");
  const teto = tetoDeRespostasDaIa({ plano: grupo.plano, tetoAjustado: grupo.teto_respostas_ia, assentos });
  return {
    corretoresAtivos: contagem(ativos, "corretores ativos"),
    comLogin: contagem(comLogin, "corretores com login"),
    numerosConectados: contagem(conectados, "números conectados"),
    tetoAjustado: grupo.teto_respostas_ia,
    tetoDoPlano: tetoDeRespostasDaIa({ plano: grupo.plano, tetoAjustado: null, assentos }),
    usoDaIa: situacaoDaCota({ respostas: uso.data?.respostas ?? 0, teto }),
  };
}

/** Todos os grupos da plataforma, do mais antigo ao mais novo, com os números de cada um. */
// A prova não é lida: existe para o chamador não conseguir pular a guarda.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function listarGruposDaPlataforma(_prova: { userId: string }): Promise<ResumoDeGrupo[]> {
  const servico = createServiceClient();
  const { data, error } = await servico
    .from("grupos")
    .select("id, nome, slug, tipo, plano, situacao, criado_em, teto_respostas_ia")
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
      ...(await contarDoGrupo(servico, g)),
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
      "id, nome, slug, tipo, plano, situacao, criado_em, teto_respostas_ia, contato_cobranca_nome, contato_cobranca_email, contato_cobranca_telefone, razao_social, documento, creci, creci_tipo, encarregado_lgpd_nome, encarregado_lgpd_email",
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
    ...(await contarDoGrupo(servico, g)),
  };
}
