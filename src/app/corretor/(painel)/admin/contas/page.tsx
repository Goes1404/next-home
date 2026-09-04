import type { Metadata } from "next";
import { AbasAdmin } from "@/app/corretor/(painel)/_componentes/AbasAdmin";
import { getCorretoresParaAdmin } from "@/lib/corretorSessao";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { ContasManager } from "./ContasManager";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";

export const metadata: Metadata = { title: "Contas da equipe" };

export default async function ContasPage() {
  // Repetida de propósito — ver o comentário do layout.
  const eu = await exigirGestorNaPagina();
  const corretores = await getCorretoresParaAdmin();

  return (
    <div className="space-y-6">
      <div>
        <CabecalhoDeTela secao="Administração" titulo="Contas e papéis" descricao="Quem entra no painel, com qual papel, e quem está na escala de distribuição." />
      </div>

      <AbasAdmin ativa="/corretor/admin/contas" />

      <ContasManager corretores={corretores} meuId={eu.id} />
    </div>
  );
}
