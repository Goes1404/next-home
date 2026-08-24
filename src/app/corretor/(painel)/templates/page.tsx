import type { Metadata } from "next";
import Link from "next/link";
import { GerenciarTemplates } from "./GerenciarTemplates";
import { getMeusTemplates } from "@/lib/corretorSessao";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const templates = await getMeusTemplates();

  return (
    <div>
      {/* A tela saiu do menu e passou a morar dentro de Campanhas. */}
      <Link
        href="/corretor/campanhas"
        className="text-fluid-sm inline-flex items-center gap-1.5 text-apoio transition-colors hover:text-titulo"
      >
        ← Campanhas
      </Link>
      <h1 className="text-fluid-2xl mt-3 text-titulo">Templates de mensagem</h1>
      <p className="text-fluid-sm mt-2 text-apoio">
        Modelos que você usa no disparo em massa. Só você vê e edita os seus.
      </p>
      <div className="mt-6">
        <GerenciarTemplates templatesIniciais={templates} />
      </div>
    </div>
  );
}
