import type { Metadata } from "next";
import Link from "next/link";
import { CampanhasManager } from "./CampanhasManager";
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-fluid-2xl text-titulo font-bold">Campanhas de WhatsApp</h1>
          <p className="text-fluid-sm mt-1 text-apoio">
            Crie a campanha e pronto: as mensagens saem sozinhas, uma a uma, com delay humanizado e
            proteção anti-ban. Nada aqui depende de você ficar clicando.
          </p>
        </div>
        {/* Templates saíram do menu (roadmap: 7 destinos); o caminho é por aqui. */}
        <Link
          href="/corretor/templates"
          className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha hover:text-titulo inline-flex min-h-10 items-center rounded-full border px-4 transition-colors"
        >
          Meus templates
        </Link>
      </div>

      <CampanhasManager
        empreendimentos={empreendimentos}
        campanhasIniciais={campanhas}
        statusInicial={status}
      />
    </div>
  );
}
