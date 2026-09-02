import type { Metadata } from "next";
import { CampanhasManager } from "./CampanhasManager";
import { AbasWhatsapp } from "@/app/corretor/(painel)/_componentes/AbasWhatsapp";
import { listarCampanhas, statusDisparo } from "./acoes";
import { getEmpreendimentos } from "@/lib/queries";
import { CabecalhoDeTela } from "../_componentes/CabecalhoDeTela";

export const metadata: Metadata = {
  title: "Listas de Transmissão de WhatsApp | Next Home",
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
        <CabecalhoDeTela
          titulo="Listas de transmissão"
          descricao="Monte a lista e pronto: as mensagens saem sozinhas, uma a uma, com pausa entre elas. Nada aqui depende de você ficar clicando."
        />
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
