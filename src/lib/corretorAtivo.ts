import { cache } from "react";
import { cookies } from "next/headers";
import { corretoresPublicos } from "@/lib/catalogo/cache";
import type { Corretor } from "@/lib/types";

export { COOKIE_CORRETOR_ATIVO } from "./corretorAtivoCookie";
import { COOKIE_CORRETOR_ATIVO } from "./corretorAtivoCookie";

export type CorretorAtivo = Corretor & { id: string };

/**
 * Corretor "dono" do link que o visitante usou pra chegar no site. Quando
 * presente, sobrepõe o corretor cadastrado em cada empreendimento — é assim
 * que um corretor nunca perde um lead pra outro só porque o cliente navegou
 * até um produto que não é "dele" no cadastro.
 *
 * Falha aberta: cookie ausente, slug inválido ou sem correspondência →
 * `null`, e a página cai no comportamento padrão (corretor do
 * empreendimento, ou a linha geral da imobiliária).
 *
 * Desde a F2 do roadmap de performance (13/09/2026) esta função custa ZERO
 * idas ao banco por requisição: o cookie é lido uma vez (`cache()` do React
 * deduplica os cinco a oito chamadores que uma página tem — layout, página,
 * Footer, CtaFinal, queries) e o corretor sai da lista de corretores já
 * cacheada por etiqueta. Antes eram até oito consultas iguais por página.
 */
export const getCorretorAtivo = cache(async (): Promise<CorretorAtivo | null> => {
  const cookieStore = await cookies();
  const slug = cookieStore.get(COOKIE_CORRETOR_ATIVO)?.value;
  if (!slug) return null;

  const corretor = (await corretoresPublicos()).find((c) => c.slug === slug);
  if (!corretor) return null;

  return {
    id: corretor.id,
    nome: corretor.nome,
    creci: corretor.creci,
    whatsapp: corretor.whatsapp,
    fotoUrl: corretor.fotoUrl,
    videoUrl: corretor.videoUrl,
    fundoTipo: corretor.fundoTipo,
    fundoFotoUrl: corretor.fundoFotoUrl,
  };
});
