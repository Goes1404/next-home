import Link from "next/link";
import { precoBRL } from "@/lib/format";
import {
  ORDENACAO_LABEL,
  TIPO_LABEL,
  type FiltrosEmpreendimento,
  type Ordenacao,
} from "@/lib/types";

type Chip = { chave: keyof FiltrosEmpreendimento; label: string };

function chips(f: FiltrosEmpreendimento): Chip[] {
  const lista: Chip[] = [];
  if (f.busca) lista.push({ chave: "busca", label: `“${f.busca}”` });
  if (f.tipo) lista.push({ chave: "tipo", label: TIPO_LABEL[f.tipo] });
  if (f.cidade) lista.push({ chave: "cidade", label: f.cidade });
  if (f.bairro) lista.push({ chave: "bairro", label: f.bairro });
  if (f.precoMax != null) {
    lista.push({ chave: "precoMax", label: `Até ${precoBRL(f.precoMax)}` });
  }
  if (f.dormitoriosMin != null) {
    lista.push({ chave: "dormitoriosMin", label: `${f.dormitoriosMin}+ dorm.` });
  }
  return lista;
}

function comFiltros(f: FiltrosEmpreendimento, ordenacao: Ordenacao): URLSearchParams {
  const p = new URLSearchParams();
  if (f.busca) p.set("busca", f.busca);
  if (f.tipo) p.set("tipo", f.tipo);
  if (f.cidade) p.set("cidade", f.cidade);
  if (f.bairro) p.set("bairro", f.bairro);
  if (f.precoMax != null) p.set("precoMax", String(f.precoMax));
  if (f.dormitoriosMin != null) p.set("dormitoriosMin", String(f.dormitoriosMin));
  if (ordenacao !== "destaque") p.set("ordenar", ordenacao);
  return p;
}

/**
 * Resumo do que está filtrado, com remoção individual.
 *
 * Sem isso o único jeito de descobrir os filtros ativos é reabrir o
 * formulário — no mobile, onde ele vive dentro de um sheet, isso significa
 * duas interações só para lembrar o que se pediu.
 */
export function FiltrosAtivos({
  filtros,
  ordenacao,
}: {
  filtros: FiltrosEmpreendimento;
  ordenacao: Ordenacao;
}) {
  const ativos = chips(filtros);
  const ordenacaoVisivel = ordenacao !== "destaque";

  if (ativos.length === 0 && !ordenacaoVisivel) return null;

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      {ativos.map((chip) => {
        const params = comFiltros(filtros, ordenacao);
        params.delete(chip.chave);
        const href = params.size ? `/empreendimentos?${params}` : "/empreendimentos";

        return (
          <Link
            key={chip.chave}
            href={href}
            scroll={false}
            aria-label={`Remover filtro ${chip.label}`}
            className="text-fluid-sm group inline-flex items-center gap-1.5 rounded-full border border-brand-500/40 bg-brand-500/10 py-1.5 pr-2.5 pl-3.5 text-corpo transition-colors hover:border-brand-400 hover:bg-brand-500/20"
          >
            {chip.label}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth={2.2}
              stroke="currentColor"
              aria-hidden
              className="h-3.5 w-3.5 text-legenda transition-colors group-hover:text-titulo"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
        );
      })}

      {ordenacaoVisivel && (
        <span className="text-fluid-sm inline-flex items-center rounded-full border border-linha/10 px-3.5 py-1.5 text-legenda">
          {ORDENACAO_LABEL[ordenacao]}
        </span>
      )}

      {ativos.length > 0 && (
        <Link
          href="/empreendimentos"
          scroll={false}
          className="text-fluid-sm ml-1 text-legenda underline-offset-4 hover:text-corpo hover:underline"
        >
          Limpar tudo
        </Link>
      )}
    </div>
  );
}
