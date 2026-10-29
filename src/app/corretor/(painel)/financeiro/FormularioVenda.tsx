"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import {
  dividirIgualmente,
  formatarPercentual,
  formatarReais,
  hojeEmSaoPaulo,
  lerPercentual,
  lerReais,
  problemasDaVenda,
  resolverPar,
  type ModoValor,
  type VendaDigitada,
} from "@/lib/financeiro/venda";
import {
  dividirEmParcelas,
  valorDaImobiliaria,
  ROTULO_PAGADOR,
  type FormaRecebimento,
  type Pagador,
  type ParcelaNova,
} from "@/lib/financeiro/parcelas";
import { buscarLeadsParaVenda, excluirVenda, salvarVenda, type LeadParaVenda } from "./acoes";

export type VendaInicial = {
  id: string;
  leadId: string | null;
  leadNome: string | null;
  empreendimentoId: string | null;
  imovelDescricao: string;
  unidade: string;
  dataVenda: string;
  valorVenda: number;
  comissaoPercentual: number | null;
  comissaoValor: number;
  observacao: string;
  participantes: {
    corretorId: string;
    partePercentual: number;
    repassePercentual: number | null;
    repasseValor: number;
    formaRecebimento: FormaRecebimento;
  }[];
  parcelas: ParcelaNova[];
};

/** Uma parcela no formulário: o valor fica em texto enquanto se digita. */
type LinhaDeParcela = { chave: number; valor: string; venceEm: string; pagador: Pagador };

type Linha = {
  chave: number;
  corretorId: string;
  parte: string;
  repasseModo: ModoValor;
  repasse: string;
  forma: FormaRecebimento;
};

const campo =
  "text-fluid-sm border-linha-forte bg-campo text-corpo min-h-11 w-full min-w-0 rounded-lg border px-3 disabled:opacity-50";
const rotulo = "text-fluid-xs mb-1 block text-tenue";
const OUTRO = "__outro__";

const numeroParaCampo = (n: number | null | undefined): string =>
  n === null || n === undefined ? "" : n.toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false });

/** Alternador % | R$ — dois botões de 44px, não um select escondido. */
function ModoToggle({ modo, aoMudar, rotuloAcessivel }: { modo: ModoValor; aoMudar: (m: ModoValor) => void; rotuloAcessivel: string }) {
  return (
    <div role="group" aria-label={rotuloAcessivel} className="border-linha-forte inline-flex shrink-0 overflow-hidden rounded-lg border">
      {(["percentual", "valor"] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={modo === m}
          onClick={() => aoMudar(m)}
          className={`text-fluid-sm min-h-11 min-w-11 px-3 font-medium transition-colors ${
            modo === m ? "bg-acento text-sobre-cor" : "bg-campo text-apoio hover:text-titulo"
          }`}
        >
          {m === "percentual" ? "%" : "R$"}
        </button>
      ))}
    </div>
  );
}

export function FormularioVenda({
  inicial,
  leadInicial,
  empreendimentos,
  equipe,
  eu,
  ultimoRepasse,
  podeExcluir,
  gestor = false,
}: {
  inicial: VendaInicial | null;
  leadInicial: LeadParaVenda | null;
  empreendimentos: { id: string; nome: string }[];
  equipe: { id: string; nome: string }[];
  eu: { id: string; nome: string };
  ultimoRepasse: number | null;
  podeExcluir: boolean;
  /** Só o gestor marca "recebe direto" (0232). */
  gestor?: boolean;
}) {
  const router = useRouter();
  const { avisar, falhar } = useAvisos();
  const [salvando, iniciar] = useTransition();
  const [tentou, setTentou] = useState(false);
  const proximaChave = useRef(1);

  const [lead, setLead] = useState<{ id: string; nome: string } | null>(
    inicial?.leadId ? { id: inicial.leadId, nome: inicial.leadNome ?? "Lead" } : leadInicial ? { id: leadInicial.id, nome: leadInicial.nome } : null,
  );
  const [busca, setBusca] = useState("");
  const [sugestoes, setSugestoes] = useState<LeadParaVenda[]>([]);

  const imovelInicial = inicial
    ? (inicial.empreendimentoId ?? (inicial.imovelDescricao ? OUTRO : ""))
    : (leadInicial?.empreendimentoId ?? "");
  const [imovel, setImovel] = useState(imovelInicial);
  const [imovelDescricao, setImovelDescricao] = useState(inicial?.imovelDescricao ?? "");
  const [unidade, setUnidade] = useState(inicial?.unidade ?? "");
  const [dataVenda, setDataVenda] = useState(inicial?.dataVenda ?? hojeEmSaoPaulo());
  const [valor, setValor] = useState(inicial ? numeroParaCampo(inicial.valorVenda) : "");
  const [comissaoModo, setComissaoModo] = useState<ModoValor>(
    inicial && inicial.comissaoPercentual === null ? "valor" : "percentual",
  );
  const [comissao, setComissao] = useState(
    inicial ? numeroParaCampo(inicial.comissaoPercentual ?? inicial.comissaoValor) : "",
  );
  // Parcelas (0232): fechado = uma parcela só, que o servidor monta. Venda já
  // dividida abre com a lista à mostra.
  const [dividir, setDividir] = useState((inicial?.parcelas.length ?? 0) > 1);
  const [parcelas, setParcelas] = useState<LinhaDeParcela[]>(() =>
    (inicial?.parcelas ?? []).map((p, i) => ({
      chave: -(i + 1),
      valor: numeroParaCampo(p.valor),
      venceEm: p.venceEm ?? "",
      pagador: p.pagador,
    })),
  );
  const [quantas, setQuantas] = useState("2");
  const [observacao, setObservacao] = useState(inicial?.observacao ?? "");

  const [linhas, setLinhas] = useState<Linha[]>(() => {
    if (inicial && inicial.participantes.length > 0) {
      return inicial.participantes.map((p, i) => ({
        chave: -(i + 1),
        corretorId: p.corretorId,
        parte: numeroParaCampo(p.partePercentual),
        repasseModo: p.repassePercentual === null ? "valor" : "percentual",
        repasse: numeroParaCampo(p.repassePercentual ?? p.repasseValor),
        forma: p.formaRecebimento,
      }));
    }
    return [{ chave: 0, corretorId: eu.id, parte: "100", repasseModo: "percentual", repasse: numeroParaCampo(ultimoRepasse), forma: "repasse" }];
  });

  const nomes = useMemo(() => {
    const m = new Map(equipe.map((c) => [c.id, c.nome]));
    m.set(eu.id, eu.nome);
    return m;
  }, [equipe, eu]);
  const opcoesCorretor = useMemo(() => {
    const todos = [...equipe];
    if (!todos.some((c) => c.id === eu.id)) todos.unshift(eu);
    // Participante antigo que saiu da equipe ativa continua escolhível.
    for (const l of linhas) {
      if (l.corretorId && !todos.some((c) => c.id === l.corretorId)) {
        todos.push({ id: l.corretorId, nome: nomes.get(l.corretorId) ?? "Corretor" });
      }
    }
    return todos;
  }, [equipe, eu, linhas, nomes]);

  const valorNumero = lerReais(valor);
  const comissaoNumero = comissaoModo === "percentual" ? lerPercentual(comissao) : lerReais(comissao);
  const comissaoPar =
    valorNumero !== null && comissaoNumero !== null ? resolverPar(valorNumero, { modo: comissaoModo, numero: comissaoNumero }) : null;

  const digitada: VendaDigitada = {
    leadId: lead?.id ?? null,
    empreendimentoId: imovel && imovel !== OUTRO ? imovel : null,
    imovelDescricao: imovel === OUTRO ? imovelDescricao : "",
    unidade,
    dataVenda,
    valorVenda: valorNumero,
    comissao: comissaoNumero === null ? null : { modo: comissaoModo, numero: comissaoNumero },
    observacao,
    participantes: linhas.map((l) => {
      const n = l.repasseModo === "percentual" ? lerPercentual(l.repasse) : lerReais(l.repasse);
      return {
        corretorId: l.corretorId,
        partePercentual: lerPercentual(l.parte) ?? 0,
        repasse: { modo: l.repasseModo, numero: n ?? 0 },
        // Do corretor a forma nem viaja: o banco mantém a gravada.
        ...(gestor ? { formaRecebimento: l.forma } : {}),
      };
    }),
    parcelas: dividir
      ? parcelas.map((p, i) => ({ numero: i + 1, valor: lerReais(p.valor) ?? 0, pagador: p.pagador, venceEm: p.venceEm || null }))
      : [],
  };
  // Do corretor a forma não viaja, mas a soma das parcelas é contra a forma
  // gravada (que a linha já traz).
  const problemas = problemasDaVenda(digitada, hojeEmSaoPaulo(), new Map(linhas.map((l) => [l.corretorId, l.forma])));

  function mudarLinha(chave: number, mudanca: Partial<Linha>) {
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, ...mudanca } : l)));
  }

  function adicionarCorretor() {
    setLinhas((atual) => {
      const novas = [
        ...atual,
        { chave: proximaChave.current++, corretorId: "", parte: "", repasseModo: "percentual" as ModoValor, repasse: "", forma: "repasse" as FormaRecebimento },
      ];
      // Dividir por igual é o ponto de partida mais comum; o corretor ajusta.
      const partes = dividirIgualmente(novas.length);
      return novas.map((l, i) => ({ ...l, parte: numeroParaCampo(partes[i]) }));
    });
  }

  function removerCorretor(chave: number) {
    setLinhas((atual) => {
      const restantes = atual.filter((l) => l.chave !== chave);
      const partes = dividirIgualmente(restantes.length);
      return restantes.map((l, i) => ({ ...l, parte: numeroParaCampo(partes[i]) }));
    });
  }

  async function procurar(termo: string) {
    setBusca(termo);
    if (termo.trim().length < 2) {
      setSugestoes([]);
      return;
    }
    try {
      setSugestoes(await buscarLeadsParaVenda(termo));
    } catch {
      setSugestoes([]);
    }
  }

  function escolherLead(l: LeadParaVenda) {
    setLead({ id: l.id, nome: l.nome });
    setBusca("");
    setSugestoes([]);
    if (!imovel && l.empreendimentoId) setImovel(l.empreendimentoId);
  }

  function salvar() {
    setTentou(true);
    if (problemas.length > 0) {
      falhar(problemas[0]);
      return;
    }
    iniciar(async () => {
      try {
        const r = await salvarVenda(inicial?.id ?? null, digitada);
        if (r.erro) {
          falhar(r.erro);
          return;
        }
        avisar(r.ok ?? "Venda salva.");
        router.push("/corretor/financeiro");
      } catch {
        falhar("Não deu para salvar. Confira a conexão e tente de novo.");
      }
    });
  }

  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  function excluir() {
    if (!inicial) return;
    if (!confirmarExclusao) {
      setConfirmarExclusao(true);
      return;
    }
    iniciar(async () => {
      try {
        const r = await excluirVenda(inicial.id);
        if (r.erro) {
          falhar(r.erro);
          setConfirmarExclusao(false);
          return;
        }
        avisar(r.ok ?? "Venda excluída.");
        router.push("/corretor/financeiro");
      } catch {
        falhar("Não deu para excluir. Confira a conexão e tente de novo.");
      }
    });
  }

  const somaPartes = digitada.participantes.reduce((s, p) => s + p.partePercentual, 0);
  const daImobiliaria = comissaoPar
    ? valorDaImobiliaria(
        comissaoPar.valor,
        digitada.participantes.map((p, i) => ({
          formaRecebimento: linhas[i]?.forma ?? "repasse",
          repasseValor: resolverPar(comissaoPar.valor, p.repasse).valor,
        })),
      )
    : null;
  const somaParcelas = digitada.parcelas.reduce((s, p) => s + p.valor, 0);

  function gerarParcelas() {
    const n = Math.min(24, Math.max(1, Math.round(Number(quantas) || 1)));
    if (daImobiliaria === null) return;
    const primeira = parcelas[0]?.venceEm || null;
    setParcelas(
      dividirEmParcelas(daImobiliaria, n, primeira, parcelas[0]?.pagador ?? "construtora").map((p) => ({
        chave: proximaChave.current++,
        valor: numeroParaCampo(p.valor),
        venceEm: p.venceEm ?? "",
        pagador: p.pagador,
      })),
    );
  }

  function abrirParcelas() {
    setDividir(true);
    if (parcelas.length === 0 && daImobiliaria !== null) {
      setParcelas(
        dividirEmParcelas(daImobiliaria, 2, null, "construtora").map((p) => ({
          chave: proximaChave.current++,
          valor: numeroParaCampo(p.valor),
          venceEm: "",
          pagador: p.pagador,
        })),
      );
    }
  }

  const mudarParcela = (chave: number, m: Partial<LinhaDeParcela>) =>
    setParcelas((ps) => ps.map((p) => (p.chave === chave ? { ...p, ...m } : p)));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        salvar();
      }}
    >
      <section className="cartao space-y-3 p-4 sm:p-5">
        <h2 className="text-fluid-base text-titulo font-medium">O que foi vendido</h2>

        <div>
          <span className={rotulo}>Cliente (lead)</span>
          {lead ? (
            <div className="flex min-h-11 flex-wrap items-center gap-2">
              <span className="text-fluid-sm text-titulo bg-acento-lavado border-acento-linha min-w-0 rounded-full border px-3 py-2 break-words">
                {lead.nome}
              </span>
              <button type="button" onClick={() => setLead(null)} className="text-fluid-xs text-apoio hover:text-titulo min-h-11 px-2 underline">
                Trocar
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                type="search"
                value={busca}
                onChange={(e) => procurar(e.target.value)}
                placeholder="Nome do cliente"
                aria-label="Buscar o lead da venda"
                className={campo}
              />
              {sugestoes.length > 0 && (
                <ul className="border-linha bg-elevado mt-1 overflow-hidden rounded-lg border">
                  {sugestoes.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => escolherLead(s)}
                        className="text-fluid-sm text-corpo hover:bg-vidro flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left"
                      >
                        <span className="min-w-0 truncate">{s.nome}</span>
                        {s.telefone && <span className="text-tenue shrink-0 text-fluid-xs">{s.telefone}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-fluid-xs text-tenue mt-1">Opcional. Ligar ao lead leva o cartão dele para Fechado.</p>
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="venda-imovel">
              Imóvel
            </label>
            <select id="venda-imovel" value={imovel} onChange={(e) => setImovel(e.target.value)} className={campo}>
              <option value="">Escolha o imóvel</option>
              {empreendimentos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
              <option value={OUTRO}>Outro, fora do catálogo</option>
            </select>
          </div>
          {imovel === OUTRO && (
            <div className="sm:col-span-2">
              <label className={rotulo} htmlFor="venda-imovel-desc">
                Qual imóvel
              </label>
              <input id="venda-imovel-desc" value={imovelDescricao} onChange={(e) => setImovelDescricao(e.target.value)} className={campo} />
            </div>
          )}
          <div>
            <label className={rotulo} htmlFor="venda-unidade">
              Unidade
            </label>
            <input id="venda-unidade" value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="Torre B, ap 142" className={campo} />
          </div>
          <div>
            <label className={rotulo} htmlFor="venda-data">
              Data da venda
            </label>
            <input
              id="venda-data"
              type="date"
              value={dataVenda}
              max={hojeEmSaoPaulo()}
              onChange={(e) => setDataVenda(e.target.value)}
              className={campo}
            />
          </div>
        </div>
      </section>

      <section className="cartao space-y-3 p-4 sm:p-5">
        <h2 className="text-fluid-base text-titulo font-medium">Valor e comissão</h2>
        <div>
          <label className={rotulo} htmlFor="venda-valor">
            Valor da venda (VGV)
          </label>
          <input
            id="venda-valor"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="R$ 0"
            className={campo}
          />
          {valorNumero !== null && <p className="text-fluid-xs text-apoio mt-1">{formatarReais(valorNumero)}</p>}
        </div>
        <div>
          <label className={rotulo} htmlFor="venda-comissao">
            Comissão da imobiliária nesta venda
          </label>
          <div className="flex gap-2">
            <ModoToggle modo={comissaoModo} aoMudar={setComissaoModo} rotuloAcessivel="Comissão em percentual ou em reais" />
            <input
              id="venda-comissao"
              inputMode="decimal"
              value={comissao}
              onChange={(e) => setComissao(e.target.value)}
              placeholder={comissaoModo === "percentual" ? "5" : "R$ 0"}
              className={campo}
            />
          </div>
          {comissaoPar && (
            <p className="text-fluid-xs text-apoio mt-1">
              {comissaoModo === "percentual"
                ? `= ${formatarReais(comissaoPar.valor)}`
                : comissaoPar.percentual !== null
                  ? `= ${formatarPercentual(comissaoPar.percentual)} da venda`
                  : null}
            </p>
          )}
        </div>
      </section>

      <section className="cartao space-y-3 p-4 sm:p-5">
        <div>
          <h2 className="text-fluid-base text-titulo font-medium">Quem vendeu</h2>
          <p className="text-fluid-xs text-tenue mt-1">
            A parte da venda conta no ranking de VGV. O repasse é quanto da comissão fica com cada corretor.
          </p>
        </div>

        <ul className="space-y-3">
          {linhas.map((l, i) => {
            const n = l.repasseModo === "percentual" ? lerPercentual(l.repasse) : lerReais(l.repasse);
            const repassePar = comissaoPar && n !== null ? resolverPar(comissaoPar.valor, { modo: l.repasseModo, numero: n }) : null;
            return (
              <li key={l.chave} className="border-linha space-y-3 rounded-xl border p-3">
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <label className={rotulo} htmlFor={`venda-corretor-${l.chave}`}>
                      Corretor {linhas.length > 1 ? i + 1 : ""}
                    </label>
                    <select
                      id={`venda-corretor-${l.chave}`}
                      value={l.corretorId}
                      onChange={(e) => mudarLinha(l.chave, { corretorId: e.target.value })}
                      className={campo}
                    >
                      <option value="">Escolha</option>
                      {opcoesCorretor.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  {linhas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removerCorretor(l.chave)}
                      aria-label="Tirar este corretor da divisão"
                      className="text-apoio hover:text-titulo border-linha-forte min-h-11 min-w-11 shrink-0 rounded-lg border px-3"
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={rotulo} htmlFor={`venda-parte-${l.chave}`}>
                      Parte da venda (%)
                    </label>
                    <input
                      id={`venda-parte-${l.chave}`}
                      inputMode="decimal"
                      value={l.parte}
                      onChange={(e) => mudarLinha(l.chave, { parte: e.target.value })}
                      className={campo}
                    />
                  </div>
                  <div>
                    <label className={rotulo} htmlFor={`venda-repasse-${l.chave}`}>
                      Repasse da comissão
                    </label>
                    <div className="flex gap-2">
                      <ModoToggle
                        modo={l.repasseModo}
                        aoMudar={(m) => mudarLinha(l.chave, { repasseModo: m })}
                        rotuloAcessivel="Repasse em percentual ou em reais"
                      />
                      <input
                        id={`venda-repasse-${l.chave}`}
                        inputMode="decimal"
                        value={l.repasse}
                        onChange={(e) => mudarLinha(l.chave, { repasse: e.target.value })}
                        placeholder={l.repasseModo === "percentual" ? "40" : "R$ 0"}
                        className={campo}
                      />
                    </div>
                    {repassePar && (
                      <p className="text-fluid-xs text-apoio mt-1">
                        {l.repasseModo === "percentual"
                          ? `= ${formatarReais(repassePar.valor)}`
                          : repassePar.percentual !== null
                            ? `= ${formatarPercentual(repassePar.percentual)} da comissão`
                            : null}
                      </p>
                    )}
                  </div>
                </div>
                {gestor && (
                  <div>
                    <label className={rotulo} htmlFor={`venda-forma-${l.chave}`}>
                      Como a parte dele é paga
                    </label>
                    <select
                      id={`venda-forma-${l.chave}`}
                      value={l.forma}
                      onChange={(e) => mudarLinha(l.chave, { forma: e.target.value as FormaRecebimento })}
                      className={campo}
                    >
                      <option value="repasse">A imobiliária recebe e repassa</option>
                      <option value="direto">Recebe direto de quem paga</option>
                    </select>
                    {l.forma === "direto" && (
                      <p className="text-fluid-xs text-apoio mt-1">
                        A parte dele não passa pelo caixa nem entra na receita da imobiliária. Só vale com contrato de associação.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={adicionarCorretor}
            className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha min-h-11 rounded-lg border px-4 font-medium"
          >
            + Adicionar corretor
          </button>
          {linhas.length > 1 && (
            <span className={`text-fluid-xs ${Math.abs(somaPartes - 100) > 0.01 ? "text-perigo" : "text-apoio"}`}>
              Partes somam {formatarPercentual(Math.round(somaPartes * 1000) / 1000)}
            </span>
          )}
        </div>
      </section>

      <section className="cartao space-y-3 p-4 sm:p-5">
        {!dividir ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-fluid-xs text-tenue">
              A comissão entra de uma vez{daImobiliaria !== null ? ` (${formatarReais(daImobiliaria)} para a imobiliária)` : ""}.
            </p>
            <button
              type="button"
              onClick={abrirParcelas}
              className="text-fluid-sm min-h-11 px-1 font-medium link-acao"
            >
              Dividir em parcelas
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <h2 className="text-fluid-base text-titulo font-medium">Parcelas da comissão</h2>
              <p className="text-fluid-xs text-tenue mt-1">
                O que a imobiliária recebe, parcela por parcela. O sinal do comprador e cada pagamento da construtora.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-24">
                <label className={rotulo} htmlFor="venda-quantas">
                  Quantas
                </label>
                <input id="venda-quantas" inputMode="numeric" value={quantas} onChange={(e) => setQuantas(e.target.value)} className={campo} />
              </div>
              <button
                type="button"
                onClick={gerarParcelas}
                className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha min-h-11 rounded-lg border px-4 font-medium"
              >
                Dividir igual
              </button>
            </div>
            <ul className="space-y-3">
              {parcelas.map((pc, i) => (
                <li key={pc.chave} className="border-linha grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                  <div>
                    <label className={rotulo} htmlFor={`parcela-valor-${pc.chave}`}>
                      Parcela {i + 1} (R$)
                    </label>
                    <input
                      id={`parcela-valor-${pc.chave}`}
                      inputMode="decimal"
                      value={pc.valor}
                      onChange={(e) => mudarParcela(pc.chave, { valor: e.target.value })}
                      className={campo}
                    />
                  </div>
                  <div>
                    <label className={rotulo} htmlFor={`parcela-vence-${pc.chave}`}>
                      Vencimento
                    </label>
                    <input
                      id={`parcela-vence-${pc.chave}`}
                      type="date"
                      value={pc.venceEm}
                      onChange={(e) => mudarParcela(pc.chave, { venceEm: e.target.value })}
                      className={campo}
                    />
                  </div>
                  <div>
                    <label className={rotulo} htmlFor={`parcela-pagador-${pc.chave}`}>
                      Quem paga
                    </label>
                    <select
                      id={`parcela-pagador-${pc.chave}`}
                      value={pc.pagador}
                      onChange={(e) => mudarParcela(pc.chave, { pagador: e.target.value as Pagador })}
                      className={campo}
                    >
                      {(Object.keys(ROTULO_PAGADOR) as Pagador[]).map((k) => (
                        <option key={k} value={k}>
                          {ROTULO_PAGADOR[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                  {parcelas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setParcelas((ps) => ps.filter((x) => x.chave !== pc.chave))}
                      aria-label={`Tirar a parcela ${i + 1}`}
                      className="text-apoio hover:text-titulo border-linha-forte min-h-11 min-w-11 rounded-lg border px-3"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() =>
                  setParcelas((ps) => [...ps, { chave: proximaChave.current++, valor: "", venceEm: "", pagador: ps[ps.length - 1]?.pagador ?? "construtora" }])
                }
                className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha min-h-11 rounded-lg border px-4 font-medium"
              >
                + Parcela
              </button>
              {daImobiliaria !== null && (
                <span className={`text-fluid-xs ${Math.abs(somaParcelas - daImobiliaria) > 0.01 ? "text-perigo" : "text-apoio"}`}>
                  Somam {formatarReais(somaParcelas)} de {formatarReais(daImobiliaria)}
                </span>
              )}
            </div>
          </div>
        )}
        <div>
          <label className={rotulo} htmlFor="venda-obs">
            Observação
          </label>
          <textarea
            id="venda-obs"
            rows={2}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            className={`${campo} py-2`}
          />
        </div>
      </section>

      {tentou && problemas.length > 0 && (
        <ul role="alert" className="border-perigo-linha bg-perigo-lavado text-fluid-sm text-titulo space-y-1 rounded-xl border p-3">
          {problemas.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={salvando}
          className="text-fluid-sm bg-acento text-sobre-cor min-h-11 rounded-xl px-6 font-bold disabled:opacity-60"
        >
          {salvando ? "Salvando…" : inicial ? "Salvar alterações" : "Registrar venda"}
        </button>
        {inicial && podeExcluir && (
          <button
            type="button"
            onClick={excluir}
            disabled={salvando}
            className={`text-fluid-sm min-h-11 rounded-xl border px-4 font-medium ${
              confirmarExclusao ? "border-perigo bg-perigo text-sobre-cor" : "border-linha-forte text-apoio hover:text-titulo"
            }`}
          >
            {confirmarExclusao ? "Toque de novo para excluir" : "Excluir venda"}
          </button>
        )}
      </div>
    </form>
  );
}
