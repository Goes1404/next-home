import type { Metadata } from "next";
import { AbasMarketing } from "@/app/corretor/(painel)/_componentes/AbasMarketing";
import { GerenciarTemplates } from "./GerenciarTemplates";
import { getMeusTemplates } from "@/lib/corretorSessao";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const templates = await getMeusTemplates();

  return (
    <div>
      <CabecalhoDeTela secao="Marketing" titulo="Modelos de mensagem" descricao="Modelos de mensagem que você usa no disparo em massa. Só você vê e edita os seus." />

      <div className="mt-5">
        <AbasMarketing ativa="/corretor/templates" />
      </div>
      <div className="mt-6">
        <GerenciarTemplates templatesIniciais={templates} />
      </div>
    </div>
  );
}
