"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "../../_componentes/Avisos";
import { formatarDocumento, type ConfigFiscal, type DadosFiscaisDaVenda, type Regime } from "@/lib/financeiro/fiscal";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { definirVinculoDoCorretor, salvarConfigFiscal, salvarDadosFiscaisDaVenda, type ResultadoFiscal } from "./acoes";

const campo =
  "text-fluid-sm border-linha-forte bg-campo text-corpo min-h-11 w-full min-w-0 rounded-lg border px-3 disabled:opacity-50";
const rotulo = "text-fluid-xs mb-1 block text-tenue";
const botao =
  "text-fluid-sm bg-acento text-sobre-cor min-h-11 rounded-xl px-4 font-medium disabled:opacity-50";

function useAcao() {
  const [pendente, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();
  const router = useRouter();
  const rodar = (acao: () => Promise<ResultadoFiscal>) =>
    iniciar(async () => {
      try {
        const r = await acao();
        if (r.erro) return falhar(r.erro);
        if (r.ok) avisar(r.ok);
        router.refresh();
      } catch (e) {
        falhar(ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Não deu para completar. Confira a conexão e tente de novo.");
      }
    });
  return { pendente, rodar };
}

const paraPct = (n: number) => String(Math.round(n * 10000) / 100).replace(".", ",");
const dePct = (s: string) => Number(s.replace(",", ".")) / 100;
const deReais = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

export function FormularioDaConfig({ config }: { config: ConfigFiscal }) {
  const [regime, setRegime] = useState<Regime>(config.regime);
  const [simples, setSimples] = useState(paraPct(config.aliquotaSimples));
  const [iss, setIss] = useState(paraPct(config.aliquotaIss));
  const [teto, setTeto] = useState(String(config.tetoInss).replace(".", ","));
  const [cnpj, setCnpj] = useState(formatarDocumento(config.cnpj));
  const [razao, setRazao] = useState(config.razaoSocial ?? "");
  const { pendente, rodar } = useAcao();

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() =>
          salvarConfigFiscal({
            regime,
            aliquotaSimples: dePct(simples),
            aliquotaIss: dePct(iss),
            tetoInss: deReais(teto),
            cnpj: cnpj || null,
            razaoSocial: razao || null,
          }),
        );
      }}
    >
      <label className="block">
        <span className={rotulo}>Regime tributário</span>
        <select className={campo} value={regime} onChange={(e) => setRegime(e.target.value as Regime)}>
          <option value="simples">Simples Nacional</option>
          <option value="presumido">Lucro presumido</option>
        </select>
      </label>
      {regime === "simples" ? (
        <label className="block">
          <span className={rotulo}>Alíquota efetiva do DAS (%)</span>
          <input className={campo} inputMode="decimal" value={simples} onChange={(e) => setSimples(e.target.value)} />
        </label>
      ) : (
        <label className="block">
          <span className={rotulo}>ISS do município (%)</span>
          <input className={campo} inputMode="decimal" value={iss} onChange={(e) => setIss(e.target.value)} />
        </label>
      )}
      <label className="block">
        <span className={rotulo}>Teto do INSS no mês (R$)</span>
        <input className={campo} inputMode="decimal" value={teto} onChange={(e) => setTeto(e.target.value)} />
      </label>
      <label className="block">
        <span className={rotulo}>CNPJ da imobiliária</span>
        <input className={campo} inputMode="numeric" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
      </label>
      <label className="block sm:col-span-2">
        <span className={rotulo}>Razão social</span>
        <input className={campo} value={razao} onChange={(e) => setRazao(e.target.value)} maxLength={200} />
      </label>
      <div className="sm:col-span-2">
        <button type="submit" className={botao} disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar configuração"}
        </button>
      </div>
    </form>
  );
}

/** CPF/CNPJ das partes e a NFS-e da comissão de uma venda. */
export function FormularioDaVenda({
  vendaId,
  dados,
  compradorPadrao,
  vendedorPadrao,
}: {
  vendaId: string;
  dados: DadosFiscaisDaVenda | undefined;
  compradorPadrao: string | null;
  vendedorPadrao: string | null;
}) {
  const [compradorNome, setCompradorNome] = useState(dados?.compradorNome ?? compradorPadrao ?? "");
  const [compradorDoc, setCompradorDoc] = useState(formatarDocumento(dados?.compradorDocumento ?? null));
  const [vendedorNome, setVendedorNome] = useState(dados?.vendedorNome ?? vendedorPadrao ?? "");
  const [vendedorDoc, setVendedorDoc] = useState(formatarDocumento(dados?.vendedorDocumento ?? null));
  const [nota, setNota] = useState(dados?.notaNumero ?? "");
  const [emitida, setEmitida] = useState(dados?.notaEmitidaEm ?? "");
  const { pendente, rodar } = useAcao();

  return (
    <form
      className="grid gap-3 pt-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() =>
          salvarDadosFiscaisDaVenda({
            vendaId,
            compradorNome: compradorNome || null,
            compradorDocumento: compradorDoc || null,
            vendedorNome: vendedorNome || null,
            vendedorDocumento: vendedorDoc || null,
            notaNumero: nota || null,
            notaEmitidaEm: emitida || null,
          }),
        );
      }}
    >
      <label className="block">
        <span className={rotulo}>Comprador</span>
        <input className={campo} value={compradorNome} onChange={(e) => setCompradorNome(e.target.value)} maxLength={200} />
      </label>
      <label className="block">
        <span className={rotulo}>CPF/CNPJ do comprador</span>
        <input className={campo} inputMode="numeric" value={compradorDoc} onChange={(e) => setCompradorDoc(e.target.value)} />
      </label>
      <label className="block">
        <span className={rotulo}>Vendedor (construtora)</span>
        <input className={campo} value={vendedorNome} onChange={(e) => setVendedorNome(e.target.value)} maxLength={200} />
      </label>
      <label className="block">
        <span className={rotulo}>CPF/CNPJ do vendedor</span>
        <input className={campo} inputMode="numeric" value={vendedorDoc} onChange={(e) => setVendedorDoc(e.target.value)} />
      </label>
      <label className="block">
        <span className={rotulo}>Nº da NFS-e da comissão</span>
        <input className={campo} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={40} />
      </label>
      <label className="block">
        <span className={rotulo}>Emitida em</span>
        <input className={campo} type="date" value={emitida} onChange={(e) => setEmitida(e.target.value)} />
      </label>
      <div className="sm:col-span-2">
        <button type="submit" className={botao} disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

export function VinculoDoCorretor({ corretorId, vinculo }: { corretorId: string; vinculo: "autonomo" | "pj" }) {
  const { pendente, rodar } = useAcao();
  return (
    <select
      aria-label="Como o corretor recebe"
      className={`${campo} sm:w-auto`}
      value={vinculo}
      disabled={pendente}
      onChange={(e) => rodar(() => definirVinculoDoCorretor(corretorId, e.target.value as "autonomo" | "pj"))}
    >
      <option value="autonomo">Autônomo (RPA)</option>
      <option value="pj">PJ / MEI (emite nota)</option>
    </select>
  );
}
