import type { Metadata } from "next";
import { Quadro } from "./Quadro";
import { AbasLeads } from "@/app/corretor/(painel)/_componentes/AbasLeads";
import { getContagemPorEtapa, getLeadsDoFunil, souGestor } from "@/lib/corretorSessao";

export const metadata: Metadata = { title: "Funil" };

export default async function FunilPage() {
  // Uma consulta só serve os dois papéis: a policy da 0007 decide se "os
  // meus leads" são os do corretor ou os da imobiliária inteira. A contagem
  // vem à parte porque o quadro tem teto (`TETO_DO_QUADRO`): o cabeçalho da
  // coluna mostra o total real mesmo quando nem todo cartão coube.
  const [leads, contagens, gestor] = await Promise.all([
    getLeadsDoFunil(),
    getContagemPorEtapa(),
    souGestor(),
  ]);

  return (
    <div>
      <h1 className="text-fluid-2xl text-titulo">Funil de vendas</h1>
      <p className="text-fluid-sm mt-2 text-apoio">
        {gestor
          ? "Todos os contatos da equipe. Arraste o cartão ou use o seletor para mudar de etapa."
          : "Seus contatos, da chegada ao fechamento. Arraste o cartão ou use o seletor para mudar de etapa."}
      </p>

      <AbasLeads ativa="funil" />

      <Quadro leads={leads} contagens={contagens} mostrarDono={gestor} />
    </div>
  );
}
