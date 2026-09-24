import { getEmpreendimentosDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { ordemDoSite } from "@/lib/imoveis/ordemDaVitrine";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { AbasImoveis } from "@/app/corretor/(painel)/_componentes/AbasImoveis";
import { OrdemNoSite, type ItemDaTela } from "./OrdemNoSite";

export const metadata = {
  title: "Ordem no site | Painel do Corretor",
  description: "Escolha a sequência em que o site mostra os imóveis.",
};

export const dynamic = "force-dynamic";

/**
 * A ordem em que o site mostra o catálogo (24/09/2026).
 *
 * Só os PUBLICADOS: rascunho não aparece no site, e posicioná-lo aqui seria
 * arrumar uma vitrine que ninguém vê. A foto é `galeria[0]`, nunca `capa` —
 * `capa` nunca é nula (cai no logotipo), e a miniatura com o logotipo em
 * todo imóvel sem foto apagaria a diferença entre eles.
 */
export default async function OrdemPage() {
  const imoveis = await getEmpreendimentosDoPainel();

  const itens: ItemDaTela[] = ordemDoSite(
    imoveis
      .filter((i) => i.publicado ?? true)
      .map((i) => ({
        slug: i.slug,
        nome: i.nome,
        destaque: Boolean(i.destaque),
        bairro: [i.bairro, i.cidade].filter(Boolean).join(", "),
        foto: i.galeria?.[0]?.url ?? null,
      })),
  );

  return (
    <div className="space-y-6">
      <CabecalhoDeTela
        secao="Imóveis"
        titulo="Ordem no site"
        descricao="Suba, desça e destaque: é nesta sequência que o visitante vê os imóveis."
      />
      <AbasImoveis ativa="/corretor/imoveis/ordem" />
      {itens.length === 0 ? (
        <p className="cartao text-fluid-sm p-5 text-apoio">Nenhum imóvel publicado ainda.</p>
      ) : (
        <OrdemNoSite iniciais={itens} />
      )}
    </div>
  );
}
