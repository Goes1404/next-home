import type { Metadata } from "next";
import { CampanhasManager } from "./CampanhasManager";
import { getEmpreendimentos } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Campanhas de WhatsApp & Reativação | Next Home",
};

export default async function CampanhasPainelPage() {
  const empreendimentos = await getEmpreendimentos();

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-fluid-2xl text-mist-50 font-bold">Campanhas de WhatsApp</h1>
        <p className="text-fluid-sm mt-1 text-mist-400">
          Reative clientes e dispare novidades de imóveis em lote de forma 100% segura com IA e proteção anti-ban.
        </p>
      </div>

      <CampanhasManager empreendimentos={empreendimentos} />
    </div>
  );
}
