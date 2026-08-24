"use client";

import { useState } from "react";
import { OrigemDrive } from "./OrigemDrive";
import { OrigemPdf } from "./OrigemPdf";

/**
 * Casca da tela de importação: escolhe a origem do material e entrega o
 * resto para o componente do assunto.
 *
 * Nasce dividida por assunto porque as duas telas-monstro do painel
 * (`WhatsappManager`, 957 linhas; `CampanhasManager`, 552) já custaram uma
 * fase inteira de refatoração.
 */
export function ImportarClient({
  empreendimentoId,
  slug,
  nome,
  cadastroAtual,
}: {
  empreendimentoId: string;
  slug: string;
  nome: string;
  cadastroAtual: Record<string, unknown>;
}) {
  const [origem, setOrigem] = useState<"pdf" | "drive">("pdf");

  const aba = (valor: "pdf" | "drive", rotulo: string) => (
    <button
      key={valor}
      type="button"
      onClick={() => setOrigem(valor)}
      aria-pressed={origem === valor}
      className={`min-h-[44px] flex-1 rounded-xl px-4 text-fluid-xs font-bold transition-colors ${
        origem === valor ? "bg-acento text-white" : "bg-campo text-apoio"
      }`}
    >
      {rotulo}
    </button>
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-fluid-base font-bold text-titulo">Importar material</h2>
        <p className="text-fluid-xs text-apoio">{nome}</p>
      </header>

      <nav className="flex gap-2">
        {aba("pdf", "Apresentação em PDF")}
        {aba("drive", "Pasta do Drive")}
      </nav>

      {origem === "pdf" ? (
        <OrigemPdf empreendimentoId={empreendimentoId} slug={slug} cadastroAtual={cadastroAtual} />
      ) : (
        <OrigemDrive empreendimentoId={empreendimentoId} slug={slug} />
      )}
    </div>
  );
}
