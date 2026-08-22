import type { Metadata } from "next";
import { getCorretoresParaAdmin } from "@/lib/corretorSessao";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { ContasManager } from "./ContasManager";

export const metadata: Metadata = { title: "Contas da equipe" };

export default async function ContasPage() {
  // Repetida de propósito — ver o comentário do layout.
  const eu = await exigirGestorNaPagina();
  const corretores = await getCorretoresParaAdmin();

  return <ContasManager corretores={corretores} meuId={eu.id} />;
}
