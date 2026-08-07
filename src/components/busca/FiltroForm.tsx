import Link from "next/link";
import type { FiltrosEmpreendimento } from "@/lib/types";
import { TIPO_LABEL } from "@/lib/types";

/** Tetos de preço fixos — mais simples e mais rápido de escanear do que um slider. */
const FAIXAS_PRECO = [
  { valor: "500000", label: "Até R$ 500 mil" },
  { valor: "800000", label: "Até R$ 800 mil" },
  { valor: "1200000", label: "Até R$ 1,2 milhão" },
  { valor: "2000000", label: "Até R$ 2 milhões" },
];

const FAIXAS_DORMITORIOS = [
  { valor: "1", label: "1+ dormitório" },
  { valor: "2", label: "2+ dormitórios" },
  { valor: "3", label: "3+ dormitórios" },
  { valor: "4", label: "4+ dormitórios" },
];

const CAMPO =
  "w-full appearance-none rounded-xl border border-white/10 bg-ink-900 px-3.5 py-2.5 text-sm text-mist-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300";

export type FiltroFormProps = {
  filtrosAtuais: FiltrosEmpreendimento;
  regioes: { cidades: string[]; bairros: string[] };
  /** Id único por instância — o form aparece 1x no desktop e 1x no sheet mobile. */
  idPrefixo: string;
  className?: string;
};

/**
 * Form GET puro: submeter recarrega `/empreendimentos` com a nova query
 * string, então filtrar funciona mesmo sem JavaScript.
 */
export function FiltroForm({ filtrosAtuais, regioes, idPrefixo, className }: FiltroFormProps) {
  const temFiltro = Object.values(filtrosAtuais).some((v) => v != null && v !== "");

  return (
    <form action="/empreendimentos" method="get" className={className}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div>
          <label htmlFor={`${idPrefixo}-tipo`} className="text-fluid-xs mb-1 block text-mist-400">
            Tipo
          </label>
          <select
            id={`${idPrefixo}-tipo`}
            name="tipo"
            defaultValue={filtrosAtuais.tipo ?? ""}
            className={CAMPO}
          >
            <option value="">Qualquer</option>
            {Object.entries(TIPO_LABEL).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${idPrefixo}-cidade`} className="text-fluid-xs mb-1 block text-mist-400">
            Cidade
          </label>
          <select
            id={`${idPrefixo}-cidade`}
            name="cidade"
            defaultValue={filtrosAtuais.cidade ?? ""}
            className={CAMPO}
          >
            <option value="">Qualquer</option>
            {regioes.cidades.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${idPrefixo}-bairro`} className="text-fluid-xs mb-1 block text-mist-400">
            Bairro
          </label>
          <select
            id={`${idPrefixo}-bairro`}
            name="bairro"
            defaultValue={filtrosAtuais.bairro ?? ""}
            className={CAMPO}
          >
            <option value="">Qualquer</option>
            {regioes.bairros.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${idPrefixo}-preco`} className="text-fluid-xs mb-1 block text-mist-400">
            Valor
          </label>
          <select
            id={`${idPrefixo}-preco`}
            name="precoMax"
            defaultValue={filtrosAtuais.precoMax ? String(filtrosAtuais.precoMax) : ""}
            className={CAMPO}
          >
            <option value="">Qualquer</option>
            {FAIXAS_PRECO.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${idPrefixo}-dorms`} className="text-fluid-xs mb-1 block text-mist-400">
            Dormitórios
          </label>
          <select
            id={`${idPrefixo}-dorms`}
            name="dormitoriosMin"
            defaultValue={
              filtrosAtuais.dormitoriosMin ? String(filtrosAtuais.dormitoriosMin) : ""
            }
            className={CAMPO}
          >
            <option value="">Qualquer</option>
            {FAIXAS_DORMITORIOS.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="submit"
          className="rounded-full bg-brand-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-400"
        >
          Filtrar
        </button>
        {temFiltro && (
          <Link
            href="/empreendimentos"
            className="text-fluid-sm text-mist-300 underline-offset-4 hover:text-mist-50 hover:underline"
          >
            Limpar filtros
          </Link>
        )}
      </div>
    </form>
  );
}
