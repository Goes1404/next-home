import type { Metadata } from "next";
import { buscarCatalogoAtualParaConciliacao, buscarHistoricoLotes } from "./actions";
import { PrecosManager } from "./PrecosManager";
import { souGestor } from "@/lib/corretorSessao";

export const metadata: Metadata = { title: "Atualização de Preços em Massa" };

export default async function PrecosPage() {
  const [catalogo, historico, gestor] = await Promise.all([
    buscarCatalogoAtualParaConciliacao(),
    buscarHistoricoLotes(),
    souGestor(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-fluid-2xl font-bold text-titulo">Atualização de Preços em Massa</h1>
        <p className="text-fluid-sm mt-1 text-apoio">
          Concilie tabelas mensais de incorporadoras (Excel / Google Sheets) e atualize os valores do catálogo com preview visual e rollback.
        </p>
      </div>

      <PrecosManager catalogoInicial={catalogo} historicoInicial={historico} />
    </div>
  );
}
