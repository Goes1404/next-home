import type { Metadata } from "next";
import { GerenciarTemplates } from "./GerenciarTemplates";
import { getMeusTemplates } from "@/lib/corretorSessao";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const templates = await getMeusTemplates();

  return (
    <div>
      <h1 className="text-fluid-2xl text-titulo">Templates de mensagem</h1>
      <p className="text-fluid-sm mt-2 text-apoio">
        Modelos que você usa no disparo em massa. Só você vê e edita os seus.
      </p>
      <div className="mt-6">
        <GerenciarTemplates templatesIniciais={templates} />
      </div>
    </div>
  );
}
