import "server-only";

import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { lerMarcaDoCrm } from "@/lib/marcaDoCrm/ler";
import type { MarcaDoCrm } from "@/lib/marcaDoCrm/marca";
import { getCorretorPorSlug, getEmpreendimentoBySlug } from "@/lib/queries";
import { linkWhatsappPara } from "@/lib/site";
import type { CorretorPerfil, Empreendimento } from "@/lib/types";
import { lerGrupoPorSlug } from "./ler";

/**
 * A ficha pública do imóvel de uma imobiliária sem site (21/10/2026,
 * `src/app/imovel/[grupo]/[slug]`).
 *
 * Tudo sai do GRUPO da URL: o catálogo publicado (`grupo_id` na leitura), a
 * marca e o corretor. Nulo para grupo inexistente ou imóvel que não é
 * publicado DESTE grupo — o mesmo 404 neutro nos casos, para a URL não
 * revelar o que existe em outro grupo.
 *
 * O corretor (`?c=`) só vale se for ativo e do mesmo grupo: a leitura da
 * equipe pública é filtrada por `grupo_id`. Sem `c` válido a ficha não tem
 * botão de WhatsApp; nunca se sorteia corretor.
 */
export type FichaPublica = {
  grupoId: string;
  marca: MarcaDoCrm;
  imovel: Empreendimento;
  corretor: CorretorPerfil | null;
};

export async function lerFichaPublica(p: {
  grupoSlug: string;
  imovelSlug: string;
  corretorSlug?: string | null;
}): Promise<FichaPublica | null> {
  const grupo = await lerGrupoPorSlug(p.grupoSlug);
  // A Next Home tem site próprio; a ficha é do grupo sem site.
  if (!grupo || grupo.id === GRUPO_NEXT_HOME_ID) return null;

  const imovel = await getEmpreendimentoBySlug(grupo.id, p.imovelSlug);
  if (!imovel) return null;

  const c = (p.corretorSlug ?? "").trim();
  const [marca, corretor] = await Promise.all([
    lerMarcaDoCrm(grupo.id),
    /^[a-z0-9-]{1,120}$/.test(c) ? getCorretorPorSlug(grupo.id, c) : Promise.resolve(null),
  ]);
  return { grupoId: grupo.id, marca, imovel, corretor };
}

/** O WhatsApp do corretor com a mensagem que cita o imóvel; nulo sem número. */
export function linkDoWhatsappDaFicha(
  corretor: Pick<CorretorPerfil, "nome" | "whatsapp"> | null,
  imovelNome: string,
): string | null {
  if (!corretor) return null;
  const numero = (corretor.whatsapp ?? "").replace(/\D/g, "");
  if (!numero) return null;
  const primeiroNome = corretor.nome.trim().split(/\s+/)[0] || "";
  return linkWhatsappPara(numero, `Oi${primeiroNome ? `, ${primeiroNome}` : ""}! Vi o ${imovelNome} e quero saber mais.`);
}
