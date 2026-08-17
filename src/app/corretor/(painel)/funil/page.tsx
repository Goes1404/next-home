import type { Metadata } from "next";
import { Quadro } from "./Quadro";
import { getLeadsDoFunil, souGestor } from "@/lib/corretorSessao";

export const metadata: Metadata = { title: "Funil" };

export default async function FunilPage() {
  // Uma consulta só serve os dois papéis: a policy da 0007 decide se "os
  // meus leads" são os do corretor ou os da imobiliária inteira.
  const [leads, gestor] = await Promise.all([getLeadsDoFunil(), souGestor()]);

  return (
    <div>
      <h1 className="text-fluid-2xl text-mist-50">Funil de vendas</h1>
      <p className="text-fluid-sm mt-2 text-mist-400">
        {gestor
          ? "Todos os contatos da equipe. Arraste o cartão ou use o seletor para mudar de etapa."
          : "Seus contatos, da chegada ao fechamento. Arraste o cartão ou use o seletor para mudar de etapa."}
      </p>

      <Quadro leads={leads} mostrarDono={gestor} />
    </div>
  );
}
