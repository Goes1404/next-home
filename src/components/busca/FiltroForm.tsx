import Link from "next/link";
import type { FiltrosEmpreendimento, Ordenacao } from "@/lib/types";
import { ORDENACAO_LABEL, TIPO_LABEL } from "@/lib/types";

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
  ordenacaoAtual: Ordenacao;
  regioes: { cidades: string[]; bairros: string[] };
  /** Id único por instância — o form aparece 1x no desktop e 1x no sheet mobile. */
  idPrefixo: string;
  className?: string;
  /**
   * Versão de entrada, para o hero do institucional: só tipo, cidade e valor,
   * e o botão vira "Buscar imóveis". Quem chega na home ainda não sabe o que
   * quer refinar — a listagem é que oferece o conjunto completo de filtros.
   */
  compacto?: boolean;
};

/**
 * Form GET puro: submeter recarrega `/empreendimentos` com a nova query
 * string, então filtrar funciona mesmo sem JavaScript.
 */
export function FiltroForm({
  filtrosAtuais,
  ordenacaoAtual,
  regioes,
  idPrefixo,
  className,
  compacto = false,
}: FiltroFormProps) {
  const temFiltro = Object.values(filtrosAtuais).some((v) => v != null && v !== "");

  return (
    <form action="/empreendimentos" method="get" className={className}>
      {/* 6 colunas só a partir de lg: em telas médias os selects ficariam
          estreitos demais e cortariam o rótulo da opção escolhida. */}
      <div
        className={
          compacto
            ? "grid grid-cols-2 gap-3 sm:grid-cols-3"
            : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        }
      >
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

        {!compacto && (
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
        )}

        {/* No compacto o par tipo/cidade ocupa a primeira linha do mobile e o
            valor fica sozinho na segunda — full width em vez de meia coluna
            solta ao lado de um vazio. */}
        <div className={compacto ? "col-span-2 sm:col-span-1" : undefined}>
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

        {!compacto && (
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
        )}

        {!compacto && (
          <div>
            <label
              htmlFor={`${idPrefixo}-ordenar`}
              className="text-fluid-xs mb-1 block text-mist-400"
            >
              Ordenar por
            </label>
            <select
              id={`${idPrefixo}-ordenar`}
              name="ordenar"
              defaultValue={ordenacaoAtual}
              className={CAMPO}
            >
              {Object.entries(ORDENACAO_LABEL).map(([valor, label]) => (
                <option key={valor} value={valor}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="submit"
          className={
            compacto
              ? "w-full rounded-full bg-brand-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-400 sm:w-auto sm:px-8"
              : "rounded-full bg-brand-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-400"
          }
        >
          {compacto ? "Buscar imóveis" : "Filtrar"}
        </button>
        {!compacto && temFiltro && (
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
