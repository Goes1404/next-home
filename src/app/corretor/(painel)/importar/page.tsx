import type { Metadata } from "next";
import { ImportarClient } from "./ImportarClient";
import { getCorretorLogado, souGestor } from "@/lib/corretorSessao";
import { getEmpreendimentos } from "@/lib/queries";

export const metadata: Metadata = { title: "Adicionar leads" };

export default async function ImportarPage() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null; // o layout já mostra o aviso de conta sem vínculo

  const [empreendimentos, gestor] = await Promise.all([getEmpreendimentos(), souGestor()]);

  return (
    <div>
      <h1 className="font-display text-titulo text-fluid-2xl">Adicionar leads</h1>
      <p className="text-fluid-sm text-apoio mt-2 max-w-2xl">
        Cadastre um contato na hora ou traga uma lista inteira de fora — planilha exportada de um
        portal, tabela colada do Excel ou PDF de relatório. Você revisa tudo antes de entrar no
        funil.
      </p>

      <ImportarClient
        // `id` é opcional no tipo (algumas consultas do catálogo público não
        // o trazem), e sem ele a opção não serviria para gravar o lead.
        empreendimentos={empreendimentos
          .filter((e): e is typeof e & { id: string } => Boolean(e.id))
          .map((e) => ({ id: e.id, nome: e.nome }))}
        ehGestor={gestor}
      />
    </div>
  );
}
