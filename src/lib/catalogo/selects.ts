import type { CorretorPerfil } from "@/lib/types";

/**
 * Os SELECTs do catálogo público, num módulo sem dependência — para que
 * `queries.ts` (a API que as páginas usam) e `catalogo/cache.ts` (onde o
 * resultado é cacheado) importem a mesma string sem importar um ao outro.
 *
 * Colunas explícitas no embed de `corretor` (em vez de `corretores(*)`): a
 * tabela ganhou `user_id`/`slug` (login de corretor) que não devem vazar
 * pela API pública de empreendimentos.
 *
 * O `!empreendimentos_corretor_id_fkey` no embed não é enfeite: existe no
 * banco uma tabela de junção `corretor_destaques (empreendimento_slug,
 * corretor_id)`. Com ela, o PostgREST passa a enxergar DOIS caminhos entre
 * `empreendimentos` e `corretores` (a chave estrangeira direta e o
 * muitos-para-muitos pela junção) e se recusa a adivinhar qual usar: toda
 * query com este select respondia PGRST201 ("more than one relationship was
 * found"). Como este select alimenta a home, a listagem, o portfólio, a
 * página de cada empreendimento e a do corretor, o site inteiro caía no
 * `error.tsx` contra o banco de produção. Nomear a constraint desfaz o
 * empate.
 */
export const SELECT_EMPREENDIMENTO = `
  *,
  corretor:corretores!empreendimentos_corretor_id_fkey(id, nome, creci, whatsapp, foto_url, video_url),
  tipologias(*),
  midias(*),
  lazer:empreendimento_lazer(lazer_itens(*))
`;

export const SELECT_CORRETOR =
  "id, slug, nome, creci, whatsapp, foto_url, video_url, fundo_tipo, fundo_foto_url, bio";

export type LinhaCorretor = {
  id: string;
  slug: string | null;
  nome: string;
  creci: string;
  whatsapp: string;
  foto_url: string | null;
  bio: string | null;
  video_url: string | null;
  fundo_tipo: string;
  fundo_foto_url: string | null;
};

export function mapCorretor(row: LinhaCorretor): CorretorPerfil {
  return {
    id: row.id,
    slug: row.slug!,
    nome: row.nome,
    creci: row.creci,
    whatsapp: row.whatsapp,
    fotoUrl: row.foto_url,
    videoUrl: row.video_url,
    fundoTipo: row.fundo_tipo as CorretorPerfil["fundoTipo"],
    fundoFotoUrl: row.fundo_foto_url,
    bio: row.bio,
  };
}
