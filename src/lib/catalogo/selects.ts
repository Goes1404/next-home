import type { CorretorPerfil } from "@/lib/types";

/**
 * Os SELECTs do catálogo público, num módulo sem dependência — para que
 * `queries.ts` (a API que as páginas usam) e `catalogo/cache.ts` (onde o
 * resultado é cacheado) importem a mesma string sem importar um ao outro.
 *
 * Sem o embed de `corretor` desde 28/09: o imóvel não tem mais corretor dono.
 */
export const SELECT_EMPREENDIMENTO = `
  *,
  tipologias(*),
  midias(*),
  lazer:empreendimento_lazer(lazer_itens(*)),
  unidades(tipologia_id, status)
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
