"use client";

import { useCallback, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Settings2 } from "lucide-react";
import { Gaveta } from "./Gaveta";

export type OpcaoDoNovo = { chave: string; rotulo: string; descricao: string; conteudo: React.ReactNode };

/**
 * O que a gaveta "Novo" oferece. Com uma opção só (o corretor), o formulário
 * já abre; com duas (o gestor), pergunta antes qual — os dois empilhados
 * pediam rolagem para chegar ao segundo.
 */
export function OpcoesDoNovo({ opcoes }: { opcoes: OpcaoDoNovo[] }) {
  const [escolhida, setEscolhida] = useState<string | null>(opcoes.length === 1 ? opcoes[0].chave : null);
  const atual = opcoes.find((o) => o.chave === escolhida);

  if (atual) {
    return (
      <div className="space-y-3">
        {opcoes.length > 1 && (
          <button
            type="button"
            onClick={() => setEscolhida(null)}
            className="botao-secundario inline-flex min-h-10 items-center gap-1 px-3 text-sm"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden /> Voltar
          </button>
        )}
        {atual.conteudo}
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {opcoes.map((o) => (
        <li key={o.chave}>
          <button
            type="button"
            onClick={() => setEscolhida(o.chave)}
            className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-linha bg-superficie px-4 py-3 text-left transition-colors hover:bg-elevado"
          >
            <span className="min-w-0 flex-1">
              <span className="text-fluid-sm block font-medium text-titulo">{o.rotulo}</span>
              {o.descricao && <span className="text-fluid-xs block text-apoio">{o.descricao}</span>}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-tenue" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Os dois botões do topo da Agenda (visual de 28/10/2026): "Novo" (bloquear
 * horário; reunião, para o gestor) e os ajustes (horários de visita e o link
 * do calendário do celular). Tiraram do pé da página as caixas recolhidas,
 * que pareciam parte da lista.
 */
export function AcoesDaAgenda({ opcoes, ajustes }: { opcoes: OpcaoDoNovo[]; ajustes?: React.ReactNode }) {
  const [aberta, setAberta] = useState<"novo" | "ajustes" | null>(null);
  const fechar = useCallback(() => setAberta(null), []);

  return (
    <div className="flex items-center gap-2">
      {ajustes && (
        <button
          type="button"
          onClick={() => setAberta("ajustes")}
          aria-label="Ajustes da agenda"
          className="botao-secundario flex min-h-11 min-w-11 items-center justify-center gap-2 px-3 text-sm"
        >
          <Settings2 className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Ajustes</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => setAberta("novo")}
        className="botao-solido flex min-h-11 items-center gap-1.5 px-4 text-sm"
      >
        <Plus className="h-4 w-4" aria-hidden /> Novo
      </button>

      <Gaveta titulo="Novo na agenda" aberta={aberta === "novo"} onFechar={fechar}>
        <OpcoesDoNovo opcoes={opcoes} />
      </Gaveta>
      {ajustes && (
        <Gaveta titulo="Ajustes da agenda" aberta={aberta === "ajustes"} onFechar={fechar} larga>
          <div className="space-y-4">{ajustes}</div>
        </Gaveta>
      )}
    </div>
  );
}
