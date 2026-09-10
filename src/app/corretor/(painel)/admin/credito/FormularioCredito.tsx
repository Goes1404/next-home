"use client";

import { useState } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import type { FaixaMcmv, ParametrosCredito } from "@/lib/credito/tipos";
import { salvarParametrosCredito } from "./acoes";

/**
 * A grade de parâmetros de crédito.
 *
 * A data de conferência vem PRIMEIRO e em destaque, porque é ela que decide
 * se o resto vale: número de crédito sem data é número que ninguém sabe se
 * ainda está de pé. Ao salvar, ela nasce como HOJE — quem revisou a tabela
 * hoje está afirmando que conferiu hoje —, e continua editável para quem está
 * só corrigindo um dígito.
 */

/** Percentual na tela, decimal no banco: ninguém digita 0,1149. */
const paraTela = (decimal: number) => Number((decimal * 100).toFixed(4));
const paraBanco = (percentual: number) => Number((percentual / 100).toFixed(6));

const hojeEmSaoPaulo = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

export function FormularioCredito({
  inicial,
  diasDesde,
}: {
  inicial: ParametrosCredito;
  /** Contado no SERVIDOR: relógio dentro do render é impureza. */
  diasDesde: number;
}) {
  const { avisar, falhar } = useAvisos();
  const [faixas, setFaixas] = useState<FaixaMcmv[]>(inicial.faixas);
  const [tetoFgts, setTetoFgts] = useState(inicial.tetoFgtsImovel);
  const [taxaSbpe, setTaxaSbpe] = useState(paraTela(inicial.taxaSbpeAnual));
  const [prazo, setPrazo] = useState(inicial.prazoMaximoMeses);
  const [comprometimento, setComprometimento] = useState(paraTela(inicial.comprometimentoMaximo));
  const [itbi, setItbi] = useState<[string, number][]>(
    Object.entries(inicial.itbiPorCidade).map(([c, a]) => [c, paraTela(a)]),
  );
  const [conferidoEm, setConferidoEm] = useState(hojeEmSaoPaulo());
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await salvarParametrosCredito({
        faixas: faixas.map((f) => ({ ...f, taxaAnual: f.taxaAnual })),
        tetoFgtsImovel: tetoFgts,
        taxaSbpeAnual: paraBanco(taxaSbpe),
        prazoMaximoMeses: prazo,
        comprometimentoMaximo: paraBanco(comprometimento),
        itbiPorCidade: Object.fromEntries(
          itbi.filter(([c]) => c.trim()).map(([c, a]) => [c.trim(), paraBanco(a)]),
        ),
        conferidoEm,
      });
      if ("erro" in r) falhar(r.erro);
      else avisar("Salvo. A próxima resposta do consultor já usa estes números.");
    } catch {
      // Erro de rede não devolve `{erro}` — sem este ramo a tela destrava muda.
      falhar("Não consegui salvar. Confira a conexão e tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="cartao space-y-2 p-4">
        <h2 className="text-fluid-sm text-titulo font-semibold">Última conferência na fonte</h2>
        <p className="text-apoio text-xs">
          É esta data que o consultor mostra ao corretor. Passando de 120 dias, ele passa a avisar
          que os números podem estar desatualizados.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={conferidoEm}
            onChange={(e) => setConferidoEm(e.target.value)}
            aria-label="Data da conferência"
            className="border-linha bg-elevado text-corpo min-h-11 rounded-xl border px-3 text-sm"
          />
          <span className="text-tenue text-xs">
            No banco: {inicial.conferidoEm} (faz {diasDesde} dia{diasDesde === 1 ? "" : "s"})
          </span>
        </div>
      </section>

      <section className="cartao space-y-3 p-4">
        <h2 className="text-fluid-sm text-titulo font-semibold">Faixas do MCMV</h2>
        <ul className="space-y-3">
          {faixas.map((f, i) => (
            <li key={i} className="border-linha grid gap-2 rounded-xl border p-3 sm:grid-cols-4">
              <Campo
                rotulo="Nome"
                tipo="text"
                valor={f.nome}
                aoMudar={(v) => trocar(setFaixas, i, { nome: String(v) })}
              />
              <Campo
                rotulo="Renda até (R$)"
                valor={f.rendaMax}
                aoMudar={(v) => trocar(setFaixas, i, { rendaMax: Number(v) })}
              />
              <Campo
                rotulo="Subsídio máx. (R$)"
                valor={f.subsidioMaximo}
                aoMudar={(v) => trocar(setFaixas, i, { subsidioMaximo: Number(v) })}
              />
              <Campo
                rotulo="Taxa (% a.a.)"
                valor={paraTela(f.taxaAnual)}
                passo="0.01"
                aoMudar={(v) => trocar(setFaixas, i, { taxaAnual: paraBanco(Number(v)) })}
              />
              <button
                type="button"
                onClick={() => setFaixas((l) => l.filter((_, n) => n !== i))}
                className="text-perigo hover:bg-perigo-lavado min-h-11 cursor-pointer rounded-xl px-3 text-left text-xs sm:col-span-4 sm:w-fit"
              >
                Remover faixa
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            setFaixas((l) => [...l, { nome: `Faixa ${l.length + 1}`, rendaMax: 0, subsidioMaximo: 0, taxaAnual: 0.05 }])
          }
          className="border-linha text-corpo hover:border-linha-forte min-h-11 cursor-pointer rounded-xl border px-4 text-sm"
        >
          Acrescentar faixa
        </button>
      </section>

      <section className="cartao grid gap-3 p-4 sm:grid-cols-2">
        <h2 className="text-fluid-sm text-titulo font-semibold sm:col-span-2">Fora do MCMV e limites</h2>
        <Campo rotulo="Teto do imóvel para usar FGTS (R$)" valor={tetoFgts} aoMudar={(v) => setTetoFgts(Number(v))} />
        <Campo rotulo="Taxa SBPE (% a.a.)" valor={taxaSbpe} passo="0.01" aoMudar={(v) => setTaxaSbpe(Number(v))} />
        <Campo rotulo="Prazo máximo (meses)" valor={prazo} aoMudar={(v) => setPrazo(Number(v))} />
        <Campo
          rotulo="Comprometimento máx. da renda (%)"
          valor={comprometimento}
          passo="0.5"
          aoMudar={(v) => setComprometimento(Number(v))}
        />
      </section>

      <section className="cartao space-y-3 p-4">
        <h2 className="text-fluid-sm text-titulo font-semibold">ITBI por cidade</h2>
        <p className="text-apoio text-xs">
          Cidade que não estiver aqui entra na conta com 2%, e a simulação diz isso em voz alta.
        </p>
        <ul className="space-y-2">
          {itbi.map(([cidade, aliquota], i) => (
            <li key={i} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
              <Campo
                rotulo="Cidade"
                tipo="text"
                valor={cidade}
                aoMudar={(v) => setItbi((l) => l.map((p, n) => (n === i ? [String(v), p[1]] : p)))}
              />
              <Campo
                rotulo="Alíquota (%)"
                valor={aliquota}
                passo="0.1"
                aoMudar={(v) => setItbi((l) => l.map((p, n) => (n === i ? [p[0], Number(v)] : p)))}
              />
              <button
                type="button"
                onClick={() => setItbi((l) => l.filter((_, n) => n !== i))}
                className="text-perigo min-h-11 cursor-pointer self-end px-3 text-xs"
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setItbi((l) => [...l, ["", 2]])}
          className="border-linha text-corpo hover:border-linha-forte min-h-11 cursor-pointer rounded-xl border px-4 text-sm"
        >
          Acrescentar cidade
        </button>
      </section>

      {/* Barra no polegar: é o gesto final da tela, e ela é usada no celular. */}
      <div className="acima-da-nav border-linha bg-elevado/95 sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3">
        <p className="text-tenue min-w-0 text-xs">
          O consultor passa a citar estes números na resposta seguinte.
        </p>
        <button
          type="button"
          onClick={() => void salvar()}
          disabled={salvando}
          className="bg-acento hover:bg-acento-hover text-sobre-cor min-h-11 shrink-0 cursor-pointer rounded-full px-6 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {salvando ? "Salvando…" : "Salvar parâmetros"}
        </button>
      </div>
    </div>
  );
}

function trocar(
  set: React.Dispatch<React.SetStateAction<FaixaMcmv[]>>,
  i: number,
  patch: Partial<FaixaMcmv>,
) {
  set((l) => l.map((f, n) => (n === i ? { ...f, ...patch } : f)));
}

function Campo({
  rotulo,
  valor,
  aoMudar,
  tipo = "number",
  passo,
}: {
  rotulo: string;
  valor: string | number;
  aoMudar: (v: string) => void;
  tipo?: "number" | "text";
  passo?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-tenue text-[11px] font-medium tracking-wide uppercase">{rotulo}</span>
      <input
        type={tipo}
        step={passo}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="border-linha bg-elevado text-corpo focus:border-linha-forte min-h-11 w-full rounded-xl border px-3 text-sm outline-none"
      />
    </label>
  );
}
