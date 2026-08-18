import { getEmpreendimentos } from "@/lib/queries";
import { ListaImoveisClient } from "./ListaImoveisClient";

export const metadata = {
  title: "Gestão & Edição de Imóveis | Painel do Corretor",
  description: "Edite fotos, textos, preços, plantas e características dos imóveis do catálogo.",
};

export const dynamic = "force-dynamic";

export default async function ImoveisPage() {
  const imoveis = await getEmpreendimentos();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <span className="text-[11px] uppercase font-bold tracking-wider text-acento-suave">
          Catálogo & Portfólio
        </span>
        <h1 className="text-fluid-xl font-bold text-titulo">
          Edição & Gestão de Imóveis
        </h1>
        <p className="text-fluid-xs text-apoio max-w-2xl">
          Altere fotos, textos comerciais, preços, tipologias e diferenciais de lazer diretamente pelo celular ou computador.
        </p>
      </div>

      <ListaImoveisClient imoveis={imoveis} />
    </div>
  );
}
