"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { Interruptor } from "@/app/corretor/(painel)/marketing/impulsionamentos/Interruptor";
import {
  CANAIS,
  CRITERIOS,
  descreverRegra,
  ROTULO_DO_CANAL,
  ROTULO_DO_CRITERIO,
  type Criterio,
  type RegraDeDistribuicao,
} from "@/lib/crm/regrasDeDistribuicao";
import {
  alternarRegraDeDistribuicao,
  criarRegraDeDistribuicao,
  excluirRegraDeDistribuicao,
  moverRegraDeDistribuicao,
  simularDistribuicao,
  type AmostraDeLead,
  type ResultadoDaSimulacao,
} from "./regrasAcoes";

const campo = "text-fluid-sm border-linha-forte bg-campo text-titulo min-h-11 w-full min-w-0 rounded-lg border px-3";

/** O que cada critério pede, em uma linha (os rótulos moram em `regrasDeDistribuicao.ts`). */
const AJUDA: Record<Criterio, string> = {
  regiao: "Bairro ou cidade do imóvel, ou a região que o lead pediu. Separe por vírgula.",
  faixa_valor: "Pelo orçamento do lead ou, sem ele, pelo valor de partida do imóvel.",
  origem: "Por onde o lead chegou.",
  desempenho: "Pula quem está com leads parados (48h sem contato) e segue a roleta com os outros.",
};

/**
 * Distribuição por regra (0246, 29/10/2026), na tela de Leads da equipe.
 *
 * As regras valem EM ORDEM, antes da roleta: a primeira que casa com o lead
 * e tem alguém disponível decide; sem nenhuma, a roleta de sempre (a de
 * hoje, sem mudança). "Simular" pergunta ao banco quem receberia um lead de
 * exemplo, pela mesma conta, sem gravar nada.
 */
export function RegrasDeDistribuicao({
  regras,
  equipe,
  imoveis,
}: {
  regras: RegraDeDistribuicao[];
  equipe: { id: string; nome: string }[];
  imoveis: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const { avisar, falhar } = useAvisos();
  const [ocupado, iniciar] = useTransition();
  const [criando, setCriando] = useState(false);
  const nomes = new Map(equipe.map((c) => [c.id, c.nome]));

  const agir = (acao: () => Promise<{ ok?: string; erro?: string }>, depois?: () => void) =>
    iniciar(async () => {
      try {
        const r = await acao();
        if (r.erro) return falhar(r.erro);
        if (r.ok) avisar(r.ok);
        depois?.();
        router.refresh();
      } catch {
        falhar("Não foi possível salvar agora. Tente novamente.");
      }
    });

  return (
    <section className="space-y-4" aria-labelledby="regras-de-distribuicao">
      <div>
        <h2 id="regras-de-distribuicao" className="text-fluid-sm text-titulo font-medium">
          Regras de distribuição
        </h2>
        <p className="text-fluid-xs text-apoio mt-1">
          Valem de cima para baixo, antes da roleta: a primeira que combina com o lead e tem alguém disponível decide.
          Se nenhuma combinar, a distribuição automática segue como hoje.
        </p>
      </div>

      {regras.length === 0 ? (
        <p className="cartao text-fluid-sm text-corpo p-4">Nenhuma regra: todo lead vai pela roleta de sempre.</p>
      ) : (
        <ol className="space-y-2">
          {regras.map((r, i) => (
            <li key={r.id} className={`cartao flex flex-wrap items-center gap-3 p-3 sm:p-4 ${r.ativa ? "" : "opacity-70"}`}>
              <span className="text-fluid-sm text-tenue w-6 shrink-0 text-center font-bold tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="text-fluid-sm text-titulo block font-medium break-words">
                  {r.nome} <span className="text-fluid-xs text-apoio font-normal">· {ROTULO_DO_CRITERIO[r.criterio]}</span>
                </span>
                <span className="text-fluid-xs text-apoio block break-words">{descreverRegra(r, nomes)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  aria-label={`Subir a regra ${r.nome}`}
                  disabled={ocupado || i === 0}
                  onClick={() => agir(() => moverRegraDeDistribuicao(r.id, "subir"))}
                  className="botao-icone min-h-11 min-w-11 disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Descer a regra ${r.nome}`}
                  disabled={ocupado || i === regras.length - 1}
                  onClick={() => agir(() => moverRegraDeDistribuicao(r.id, "descer"))}
                  className="botao-icone min-h-11 min-w-11 disabled:opacity-40"
                >
                  ↓
                </button>
                <Interruptor
                  ligado={r.ativa}
                  rotulo={`Regra ${r.nome} ${r.ativa ? "ligada" : "desligada"}`}
                  desativado={ocupado}
                  aoMudar={(novo) => agir(() => alternarRegraDeDistribuicao(r.id, novo))}
                />
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => {
                    if (window.confirm(`Apagar a regra "${r.nome}"?`)) agir(() => excluirRegraDeDistribuicao(r.id));
                  }}
                  className="botao-secundario text-fluid-xs min-h-11 px-3"
                >
                  Apagar
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}

      {criando ? (
        <NovaRegra
          equipe={equipe}
          ocupado={ocupado}
          aoCancelar={() => setCriando(false)}
          aoSalvar={(digitada) => agir(() => criarRegraDeDistribuicao(digitada), () => setCriando(false))}
        />
      ) : (
        <button type="button" onClick={() => setCriando(true)} className="botao-secundario text-fluid-sm min-h-11 px-4">
          + Nova regra
        </button>
      )}

      <Simulador imoveis={imoveis} />
    </section>
  );
}

function NovaRegra({
  equipe,
  ocupado,
  aoCancelar,
  aoSalvar,
}: {
  equipe: { id: string; nome: string }[];
  ocupado: boolean;
  aoCancelar: () => void;
  aoSalvar: (digitada: Parameters<typeof criarRegraDeDistribuicao>[0]) => void;
}) {
  const [nome, setNome] = useState("");
  const [criterio, setCriterio] = useState<Criterio>("regiao");
  const [regioes, setRegioes] = useState("");
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");
  const [origens, setOrigens] = useState<string[]>([]);
  const [teto, setTeto] = useState("3");
  const [quem, setQuem] = useState<string[]>([]);

  const alternar = (lista: string[], item: string) => (lista.includes(item) ? lista.filter((x) => x !== item) : [...lista, item]);

  return (
    <form
      className="cartao space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        aoSalvar({ nome, criterio, regioes, valorMin, valorMax, origens, maxLeadsParados: teto, corretores: quem });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-fluid-xs text-tenue mb-1 block">Nome da regra</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} className={campo} placeholder="Ex.: Alphaville para a Ana" />
        </label>
        <label className="block">
          <span className="text-fluid-xs text-tenue mb-1 block">Critério</span>
          <select value={criterio} onChange={(e) => setCriterio(e.target.value as Criterio)} className={`select-seta ${campo}`}>
            {CRITERIOS.map((c) => (
              <option key={c} value={c}>
                {ROTULO_DO_CRITERIO[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-fluid-xs text-apoio">{AJUDA[criterio]}</p>

      {criterio === "regiao" && (
        <label className="block">
          <span className="text-fluid-xs text-tenue mb-1 block">Regiões ou bairros</span>
          <input value={regioes} onChange={(e) => setRegioes(e.target.value)} className={campo} placeholder="Alphaville, Tamboré, Barueri" />
        </label>
      )}
      {criterio === "faixa_valor" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-fluid-xs text-tenue mb-1 block">A partir de (R$)</span>
            <input inputMode="decimal" value={valorMin} onChange={(e) => setValorMin(e.target.value)} className={campo} />
          </label>
          <label className="block">
            <span className="text-fluid-xs text-tenue mb-1 block">Até (R$)</span>
            <input inputMode="decimal" value={valorMax} onChange={(e) => setValorMax(e.target.value)} className={campo} />
          </label>
        </div>
      )}
      {criterio === "origem" && (
        <fieldset className="flex flex-wrap gap-3">
          <legend className="text-fluid-xs text-tenue mb-1">Origens</legend>
          {CANAIS.map((c) => (
            <label key={c} className="text-fluid-sm text-corpo flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={origens.includes(c)} onChange={() => setOrigens((o) => alternar(o, c))} className="accent-acento h-4 w-4" />
              {ROTULO_DO_CANAL[c]}
            </label>
          ))}
        </fieldset>
      )}
      {criterio === "desempenho" && (
        <label className="block sm:max-w-xs">
          <span className="text-fluid-xs text-tenue mb-1 block">Pular quem tem esta quantidade de leads parados (ou mais)</span>
          <input inputMode="numeric" value={teto} onChange={(e) => setTeto(e.target.value.replace(/\D/g, "").slice(0, 3))} className={campo} />
        </label>
      )}
      {criterio !== "desempenho" && (
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
          <legend className="text-fluid-xs text-tenue mb-1">Quem recebe (a roleta escolhe entre eles)</legend>
          {equipe.map((c) => (
            <label key={c.id} className="text-fluid-sm text-corpo flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={quem.includes(c.id)} onChange={() => setQuem((q) => alternar(q, c.id))} className="accent-acento h-4 w-4" />
              {c.nome}
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={ocupado} className="text-fluid-sm bg-acento text-sobre-cor min-h-11 rounded-xl px-5 font-bold disabled:opacity-60">
          {ocupado ? "Salvando…" : "Criar regra"}
        </button>
        <button type="button" onClick={aoCancelar} className="botao-secundario text-fluid-sm min-h-11 px-4">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Simulador({ imoveis }: { imoveis: { id: string; nome: string }[] }) {
  const [amostra, setAmostra] = useState<AmostraDeLead>({ empreendimentoId: "", bairro: "", cidade: "", regiao: "", valor: "", canal: "site" });
  const [resultado, setResultado] = useState<ResultadoDaSimulacao | null>(null);
  const [simulando, iniciar] = useTransition();
  const mudar = (campoDaAmostra: keyof AmostraDeLead, valor: string) => setAmostra((a) => ({ ...a, [campoDaAmostra]: valor }));

  return (
    <details className="cartao p-4">
      <summary className="text-fluid-sm text-titulo min-h-11 cursor-pointer font-medium">Simular: quem receberia um lead?</summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          iniciar(async () => {
            try {
              setResultado(await simularDistribuicao(amostra));
            } catch {
              setResultado({ erro: "Não foi possível simular agora." });
            }
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-3">
            <span className="text-fluid-xs text-tenue mb-1 block">Interesse (opcional: traz bairro, cidade e valor do cadastro)</span>
            <select value={amostra.empreendimentoId} onChange={(e) => mudar("empreendimentoId", e.target.value)} className={`select-seta ${campo}`}>
              <option value="">Nenhum</option>
              {imoveis.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-fluid-xs text-tenue mb-1 block">Bairro</span>
            <input value={amostra.bairro} onChange={(e) => mudar("bairro", e.target.value)} className={campo} />
          </label>
          <label className="block">
            <span className="text-fluid-xs text-tenue mb-1 block">Cidade</span>
            <input value={amostra.cidade} onChange={(e) => mudar("cidade", e.target.value)} className={campo} />
          </label>
          <label className="block">
            <span className="text-fluid-xs text-tenue mb-1 block">Região pedida</span>
            <input value={amostra.regiao} onChange={(e) => mudar("regiao", e.target.value)} className={campo} />
          </label>
          <label className="block">
            <span className="text-fluid-xs text-tenue mb-1 block">Valor (R$)</span>
            <input inputMode="decimal" value={amostra.valor} onChange={(e) => mudar("valor", e.target.value)} className={campo} />
          </label>
          <label className="block">
            <span className="text-fluid-xs text-tenue mb-1 block">Origem</span>
            <select value={amostra.canal} onChange={(e) => mudar("canal", e.target.value)} className={`select-seta ${campo}`}>
              {CANAIS.map((c) => (
                <option key={c} value={c}>
                  {ROTULO_DO_CANAL[c]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" disabled={simulando} className="botao-secundario text-fluid-sm min-h-11 px-4 disabled:opacity-60">
          {simulando ? "Simulando…" : "Simular"}
        </button>
        {resultado && (
          <p role="status" className={`text-fluid-sm ${resultado.erro ? "text-alerta" : "text-titulo"}`}>
            {resultado.erro
              ? resultado.erro
              : resultado.quem
                ? `Iria para ${resultado.quem.nome}, ${resultado.quem.regra ? `pela regra "${resultado.quem.regra}"` : "pela roleta de sempre"}. Nada foi gravado.`
                : "Ninguém disponível agora: o lead ficaria sem dono até alguém assumir."}
          </p>
        )}
      </form>
    </details>
  );
}
