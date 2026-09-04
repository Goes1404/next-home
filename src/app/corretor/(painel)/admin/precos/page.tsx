import type { Metadata } from "next";
import { AbasAdmin } from "@/app/corretor/(painel)/_componentes/AbasAdmin";
import { buscarCatalogoAtualParaConciliacao, buscarHistoricoLotes } from "./actions";
import { PrecosManager } from "./PrecosManager";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";

export const metadata: Metadata = { title: "Atualização de Preços em Massa" };

export default async function PrecosPage() {
  /*
   * Reajuste em massa mexe no preço de TODO o catálogo de uma vez. O item já
   * era gestor-only no menu, mas a página só calculava `souGestor()` e
   * ignorava o resultado — quem digitasse a URL entrava. Aqui a guarda é de
   * verdade; as policies da 0031 fecham o mesmo buraco no banco.
   */
  await exigirGestorNaPagina();

  const [catalogo, historico] = await Promise.all([
    buscarCatalogoAtualParaConciliacao(),
    buscarHistoricoLotes(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <CabecalhoDeTela secao="Administração" titulo="Preços" descricao="Preços do catálogo, atualizados em lote." />
      </div>

      <AbasAdmin ativa="/corretor/admin/precos" />

      <div>
        <h2 className="text-fluid-lg font-bold text-titulo">Atualização de Preços em Massa</h2>
        <p className="text-fluid-sm mt-1 text-apoio">
          Concilie tabelas mensais de incorporadoras (Excel / Google Sheets) e atualize os valores do catálogo com preview visual e rollback.
        </p>
      </div>

      <PrecosManager catalogoInicial={catalogo} historicoInicial={historico} />
    </div>
  );
}
