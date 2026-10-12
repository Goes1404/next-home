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
 * deduplica os chamadores de uma mesma requisição) e o corretor sai da lista
 * de corretores já cacheada por etiqueta. Antes eram até oito consultas
 * iguais por página.
 *
 * Desde a F2b (12/10/2026) NENHUM layout nem página estática a chama:
 * `cookies()` torna a rota dinâmica, e o site público é servido do cache.
 * Quem a chama hoje são as rotas que precisam do corretor do link por
 * natureza — `/api/corretor-ativo` (a ilha `FundoDoLink` pergunta por ela
 * no navegador), `/api/leads`, `/api/clique-whatsapp`, `/wa` — e
 * `getEmpreendimentosDoLink`, usada só pelas duas listagens dinâmicas.
 * `cascaEstatica.test.ts` reprova um chamador novo em página pública.
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
