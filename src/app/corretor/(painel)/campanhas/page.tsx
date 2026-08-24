import type { Metadata } from "next";
import { CampanhasManager } from "./CampanhasManager";
import { AbasWhatsapp } from "@/app/corretor/(painel)/_componentes/AbasWhatsapp";
import { listarCampanhas, statusDisparo } from "./acoes";
import { getEmpreendimentos } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Campanhas de WhatsApp & Reativação | Next Home",
};

/**
 * As server actions desta página (`processarFilaAgora`) chegam a mandar
 * WhatsApp de verdade antes de responder. O teto padrão de 10s de uma
 * função Hobby cortaria o envio no meio.
 */
export const maxDuration = 60;

export default async function CampanhasPainelPage() {
  const [empreendimentos, campanhas, status] = await Promise.all([
    getEmpreendimentos(),
    listarCampanhas(),
    statusDisparo(),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-fluid-2xl text-titulo font-bold">WhatsApp</h1>
        <p className="text-fluid-sm mt-1 text-apoio">
          Crie a campanha e pronto: as mensagens saem sozinhas, uma a uma, com pausa entre elas.
          Nada aqui depende de você ficar clicando.
        </p>
      </div>

      <AbasWhatsapp
        ativa="campanhas"
        naFila={status?.pendentes}
        conectado={status ? status.statusConexao === "conectado" : undefined}
      />

      <CampanhasManager
        empreendimentos={empreendimentos}
        campanhasIniciais={campanhas}
        statusInicial={status}
      />
    </div>
  );
}
