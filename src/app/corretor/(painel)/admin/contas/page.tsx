import type { Metadata } from "next";
import { AbasAdmin } from "@/app/corretor/(painel)/_componentes/AbasAdmin";
import { getCorretoresParaAdmin } from "@/lib/corretorSessao";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { ContasManager } from "./ContasManager";

export const metadata: Metadata = { title: "Contas da equipe" };

export default async function ContasPage() {
  // Repetida de propósito — ver o comentário do layout.
  const eu = await exigirGestorNaPagina();
  const corretores = await getCorretoresParaAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-fluid-2xl text-titulo font-bold">Administração</h1>
        <p className="text-fluid-sm text-apoio mt-1">
          Quem entra no painel, com qual papel, e quem está na escala de distribuição.
        </p>
      </div>

      <AbasAdmin ativa="contas" />

      <ContasManager corretores={corretores} meuId={eu.id} />
    </div>
  );
}
