"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import {
  CANAIS_DE_CAMPANHA,
  compararCampanhas,
  porcentagem,
  MINIMO_PARA_PORCENTAGEM,
  type CriterioDoComparativo,
  type Degraus,
  type LinhaDoComparativo,
  type ResumoImpulsionamento,
  type totaisDosImpulsionamentos,
} from "@/lib/crm/impulsionamentosCalculo";
import {
  contarPorFiltro,
  ordenarCampanhas,
  passaNoFiltro,
  situacaoDaCampanha,
  visitaramDe,
  type FiltroDaLista,
  type OrdemDaLista,
  type Situacao,
} from "@/lib/crm/listaDeCampanhas";
import { TITULO_SEM_ETIQUETA } from "@/lib/whatsapp/anuncioMeta";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import {
  agruparAnuncio,
  apagarCampanha,
  criarCampanha,
  desvincularCliente,
  salvarGastoDoImpulsionamento,
  vincularClientes,
} from "./acoes";

type Totais = ReturnType<typeof totaisDosImpulsionamentos>;
export type ClienteDaLista = { id: string; nome: string };
type Msg = { tipo: "ok" | "erro"; texto: string } | null;
type Resultado = { ok?: string; erro?: string };

const CAMPO =
  "w-full rounded-xl border border-linha-forte bg-campo px-3 py-2.5 text-fluid-sm text-titulo outline-none";
const BOTAO =
  "min-h-11 rounded-xl bg-acento px-5 text-fluid-sm font-semibold text-sobre-cor disabled:opacity-60";
const BOTAO_SECUNDARIO =
  "botao-solido min-h-11 px-4 text-fluid-sm font-semibold text-acento disabled:opacity-60";

const reais = (v: number | null) =>
  v === null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const dataCurta = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso.length === 10 ? `${iso}T12:00:00-03:00` : iso));

const valorNoCampo = (v: number | null) =>
  v === null ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function nomeDoResumo(r: ResumoImpulsionamento): string {
  if (r.chave === "sem-etiqueta") return `${TITULO_SEM_ETIQUETA}, sem identificação do post`;
  return r.titulo ?? (r.criadaPeloCorretor ? "Campanha sem nome" : "Post impulsionado");
}

/** Roda uma action e traduz o desfecho numa mensagem de tela. */
function useAcao() {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (acao: () => Promise<Resultado>, depois?: () => void) =>
    iniciar(async () => {
      setMsg(null);
      try {
        const r = await acao();
        if (r.erro) setMsg({ tipo: "erro", texto: r.erro });
        else {
          setMsg({ tipo: "ok", texto: r.ok ?? "Salvo." });
          depois?.();
          router.refresh();
        }
      } catch (e) {
        setMsg({
          tipo: "erro",
          texto: ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.",
        });
      }
    });
  return { msg, pendente, rodar };
}

function Mensagem({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p
      role={msg.tipo === "erro" ? "alert" : "status"}
      className={msg.tipo === "erro" ? "text-fluid-sm text-perigo" : "text-fluid-sm text-ok"}
    >
      {msg.texto}
    </p>
  );
}

export function ListaDeImpulsionamentos({
  resumos,
  totais,
  meuId,
  verEquipe,
  nomes,
  imoveis,
  ligados,
  listasPorCartao = {},
  candidatos,
  hoje,
  indisponivel,
  abrirNova = false,
}: {
  resumos: ResumoImpulsionamento[];
  totais: Totais;
  meuId: string;
  verEquipe: boolean;
  nomes: Record<string, string>;
  imoveis: { id: string; nome: string }[];
  ligados: Record<string, ClienteDaLista[]>;
  /** Quantos clientes de cada cartão receberam e responderam lista de transmissão. */
  listasPorCartao?: Record<string, { receberam: number; responderam: number }>;
  candidatos: ClienteDaLista[];
  hoje: string;
  indisponivel: boolean;
  /** Vem do botão "Nova campanha" do cabeçalho (`?nova=1`): o formulário já abre. */
  abrirNova?: boolean;
}) {
  const comparativo = useMemo(() => compararCampanhas(resumos, nomeDoResumo), [resumos]);
  const [filtro, setFiltro] = useState<FiltroDaLista>("todas");
  const [ordem, setOrdem] = useState<OrdemDaLista>("recentes");
  const contagens = useMemo(() => contarPorFiltro(resumos, hoje), [resumos, hoje]);
  const visiveis = useMemo(
    () =>
      ordenarCampanhas(
        resumos.filter((r) => passaNoFiltro(r, filtro, hoje)),
        ordem,
        comparativo.linhas.map((l) => l.id),
      ),
    [resumos, filtro, ordem, hoje, comparativo],
  );
  const minhasCampanhas = resumos
    .filter((r) => r.criadaPeloCorretor && r.corretorId === meuId)
    .map((r) => ({ id: r.id, nome: nomeDoResumo(r) }));

  if (indisponivel) {
    return (
      <p className="cartao p-4 text-fluid-sm text-corpo">
        O registro de anúncios ainda não está ativo nesta instalação.
      </p>
    );
  }

  const temComparacao = comparativo.linhas.length >= 2;

  return (
    <div className="space-y-6">
      <NovaCampanha imoveis={imoveis} abertoDeInicio={abrirNova} />
      <ComoFunciona aberto={resumos.length === 0} />

      {resumos.length > 0 && <Totais totais={totais} verSemGasto={() => setFiltro("sem_gasto")} />}

      {resumos.length > 0 && (
        <section className="space-y-3" aria-labelledby="lista-titulo">
          <div className="cartao space-y-4 p-4">
            <div className="space-y-1">
              <h2 id="lista-titulo" className="text-fluid-base font-semibold text-titulo">
                {verEquipe ? "Campanhas da equipe" : "Suas campanhas"}
              </h2>
              {temComparacao && <p className="text-fluid-sm text-pretty text-corpo">{veredito(comparativo)}</p>}
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Mostrar">
                {FILTROS.filter((f) => f.id === "todas" || contagens[f.id] > 0).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={filtro === f.id}
                    onClick={() => setFiltro(f.id)}
                    className={`${CHIP} ${filtro === f.id ? CHIP_ATIVO : CHIP_INATIVO}`}
                  >
                    {f.rotulo}
                    <span className="tabular-nums opacity-80">{contagens[f.id]}</span>
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-fluid-xs text-corpo">
                <span className="shrink-0">Ordenar por</span>
                <select
                  value={ordem}
                  onChange={(e) => setOrdem(e.target.value as OrdemDaLista)}
                  className={`${CAMPO} select-seta min-h-11 py-2 lg:w-56`}
                >
                  {ORDENS.filter((o) => o.id !== "melhor" || temComparacao).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {visiveis.length === 0 ? (
            <p className="cartao p-4 text-fluid-sm text-corpo">Nenhuma campanha neste filtro.</p>
          ) : (
            <ul className="space-y-3">
              {visiveis.map((r) => (
                <li key={r.id}>
                  <Cartao
                    resumo={r}
                    melhor={r.id === comparativo.melhor}
                    situacao={situacaoDaCampanha(r, hoje)}
                    editavel={r.corretorId === meuId}
                    dono={verEquipe ? (nomes[r.corretorId] ?? null) : null}
                    imoveis={imoveis}
                    campanhas={minhasCampanhas}
                    ligados={ligados[r.id] ?? []}
                    listas={listasPorCartao[r.id]}
                    candidatos={candidatos}
                    hoje={hoje}
                  />
                </li>
              ))}
            </ul>
          )}

          {temComparacao && (
            <p className="px-1 text-fluid-xs text-pretty text-apoio">
              &quot;Melhor custo&quot; decide pelo degrau mais fundo que dá para comparar: visita, depois cliente
              qualificado, depois cliente. Cliente barato que não visita não vende. Campanha com menos de{" "}
              {MINIMO_PARA_PORCENTAGEM} clientes aparece, mas não disputa.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

const FILTROS: { id: FiltroDaLista; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "no_ar", rotulo: "No ar" },
  { id: "sem_gasto", rotulo: "Sem gasto" },
  { id: "encerradas", rotulo: "Encerradas" },
];

const ORDENS: { id: OrdemDaLista; rotulo: string }[] = [
  { id: "recentes", rotulo: "Cliente mais recente" },
  { id: "melhor", rotulo: "Melhor custo" },
  { id: "clientes", rotulo: "Mais clientes" },
  { id: "investimento", rotulo: "Maior investimento" },
];

// Os mesmos chips do painel do Resumo (`PainelDeIndicadores`).
const CHIP =
  "min-h-11 rounded-full border px-4 text-fluid-xs font-semibold transition-colors inline-flex items-center gap-2";
const CHIP_ATIVO = "border-acento bg-acento text-sobre-cor";
const CHIP_INATIVO = "border-linha-forte bg-superficie text-titulo shadow-sm hover:border-acento hover:text-acento";

const DEGRAUS_DO_TOTAL = [
  { rotulo: "Clientes", quantos: (t: Totais) => t.clientes, custo: (t: Totais) => t.custoPorLead },
  { rotulo: "Se qualificaram", quantos: (t: Totais) => t.qualificados, custo: (t: Totais) => t.custoPorQualificado },
  { rotulo: "Visitaram", quantos: (t: Totais) => t.visitas, custo: (t: Totais) => t.custoPorVisita },
  { rotulo: "Fecharam", quantos: (t: Totais) => t.fechados, custo: (t: Totais) => t.custoPorFechado },
] as const;

/**
 * O topo da tela: quanto foi investido e, degrau por degrau, quantos clientes
 * isso trouxe e quanto custou cada um. Contagem e custo são da mesma
 * população (as campanhas com valor informado), então a conta fecha.
 */
function Totais({ totais, verSemGasto }: { totais: Totais; verSemGasto: () => void }) {
  const semValor = totais.semGasto > 0;
  return (
    <section className="cartao space-y-4 p-4" aria-labelledby="totais-titulo">
      <div className="flex flex-col-reverse gap-1">
        <h2 id="totais-titulo" className="text-fluid-xs text-corpo">
          Investido{totais.anuncios - totais.semGasto > 0 ? ` em ${totais.anuncios - totais.semGasto} ${totais.anuncios - totais.semGasto === 1 ? "campanha" : "campanhas"}` : ""}
        </h2>
        <p className="text-fluid-2xl font-semibold text-titulo tabular-nums">{reais(totais.gasto)}</p>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DEGRAUS_DO_TOTAL.map((d) => {
          const custo = d.custo(totais);
          return (
            <div key={d.rotulo} className="min-w-0 rounded-xl bg-vidro px-3 py-2.5">
              <dt className="text-fluid-xs text-corpo">{d.rotulo}</dt>
              <dd>
                <span className="block text-fluid-xl font-semibold text-titulo tabular-nums">{d.quantos(totais)}</span>
                <span className="block text-fluid-xs text-corpo tabular-nums">
                  {custo === null ? "sem custo ainda" : `${reais(custo)} cada`}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>

      {semValor && (
        <div className="flex flex-col gap-2 rounded-xl bg-alerta-lavado px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-fluid-sm text-pretty text-titulo">
            {totais.semGasto === 1 ? "1 campanha está" : `${totais.semGasto} campanhas estão`} sem o valor gasto
            {totais.clientesSemGasto > 0
              ? `, e ${totais.clientesSemGasto === 1 ? "o cliente" : `os ${totais.clientesSemGasto} clientes`} ${totais.semGasto === 1 ? "dela" : "delas"} ${totais.clientesSemGasto === 1 ? "fica" : "ficam"} fora destes números`
              : ""}
            . Informe o gasto para entrarem na conta e na comparação.
          </p>
          <button
            type="button"
            onClick={() => {
              verSemGasto();
              document.getElementById("lista-titulo")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={`${BOTAO_SECUNDARIO} shrink-0`}
          >
            Ver {totais.semGasto === 1 ? "qual" : "quais"}
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * O formulário abre pelo botão "Nova campanha" do cabeçalho da página
 * (`?nova=1`); a aba não repete o botão (29/10/2026). Ao fechar, o `nova=1`
 * sai do endereço, para o próximo toque no cabeçalho abrir de novo.
 */
function NovaCampanha({ imoveis, abertoDeInicio }: { imoveis: { id: string; nome: string }[]; abertoDeInicio: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(abertoDeInicio);
  const [pedidoAnterior, setPedidoAnterior] = useState(abertoDeInicio);
  if (abertoDeInicio !== pedidoAnterior) {
    setPedidoAnterior(abertoDeInicio);
    if (abertoDeInicio) setAberto(true);
  }
  const [form, setForm] = useState({ nome: "", canal: "instagram", valor: "", imovel: "", inicio: "", fim: "" });
  const { msg, pendente, rodar } = useAcao();
  const campo = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const fechar = () => {
    setAberto(false);
    router.replace("?aba=campanhas", { scroll: false });
  };

  if (!aberto) return msg ? <Mensagem msg={msg} /> : null;

  return (
    <form
      className="cartao space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        rodar(
          () =>
            criarCampanha({
              nome: form.nome,
              canal: form.canal,
              valor: form.valor,
              empreendimentoId: form.imovel || null,
              inicio: form.inicio,
              fim: form.fim,
            }),
          () => {
            setForm({ nome: "", canal: "instagram", valor: "", imovel: "", inicio: "", fim: "" });
            fechar();
          },
        );
      }}
    >
      <h2 className="text-fluid-base font-semibold text-titulo">Nova campanha</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className="text-fluid-xs text-corpo">Nome</span>
          <input value={form.nome} onChange={campo("nome")} placeholder="Ex.: Vitra outubro" className={CAMPO} />
        </label>
        <label className="space-y-1">
          <span className="text-fluid-xs text-corpo">Onde roda</span>
          <select value={form.canal} onChange={campo("canal")} className={`${CAMPO} select-seta`}>
            {Object.entries(CANAIS_DE_CAMPANHA).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-fluid-xs text-corpo">Valor investido (R$)</span>
          <input inputMode="decimal" value={form.valor} onChange={campo("valor")} placeholder="Ex.: 300" className={CAMPO} />
        </label>
        <label className="space-y-1">
          <span className="text-fluid-xs text-corpo">Começou em</span>
          <input type="date" value={form.inicio} onChange={campo("inicio")} className={CAMPO} />
        </label>
        <label className="space-y-1">
          <span className="text-fluid-xs text-corpo">Termina em (opcional)</span>
          <input type="date" value={form.fim} onChange={campo("fim")} className={CAMPO} />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-fluid-xs text-corpo">Imóvel (opcional)</span>
          <select value={form.imovel} onChange={campo("imovel")} className={`${CAMPO} select-seta`}>
            <option value="">Não informado</option>
            {imoveis.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-fluid-xs text-corpo">
        Depois de criar, ligue a ela os clientes que vieram da campanha. Se for um impulsionamento com
        botão de WhatsApp, o anúncio aparece aqui sozinho no primeiro cliente, e você o coloca dentro
        da campanha.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pendente} className={BOTAO}>
          {pendente ? "Criando…" : "Criar campanha"}
        </button>
        <button type="button" onClick={fechar} className={BOTAO_SECUNDARIO}>
          Cancelar
        </button>
      </div>
      <Mensagem msg={msg} />
    </form>
  );
}

function ComoFunciona({ aberto }: { aberto: boolean }) {
  return (
    <details className="cartao p-4" open={aberto}>
      <summary className="min-h-11 cursor-pointer text-fluid-sm font-semibold text-titulo">
        Como funciona
      </summary>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-fluid-sm text-corpo">
        <li>
          Impulsionamento do Instagram ou Facebook com destino{" "}
          <strong className="text-titulo">WhatsApp</strong> (o mesmo conectado em Assistente → Minha IA):
          o anúncio aparece aqui sozinho, com o primeiro cliente que chegar por ele.
        </li>
        <li>
          Campanha de outro lugar (Google, portal, panfleto), ou que ainda não trouxe ninguém: crie em{" "}
          <strong className="text-titulo">Nova campanha</strong>, no topo da página, e ligue a ela os
          clientes que vieram dela.
        </li>
        <li>
          Digite <strong className="text-titulo">quanto gastou</strong>. O custo por cliente e por visita
          sai na hora.
        </li>
        <li>
          A qualidade é o que o cliente fez: <strong className="text-titulo">conversou</strong> (mandou
          mais de uma mensagem), <strong className="text-titulo">se qualificou</strong> (disse renda ou
          orçamento, ou a IA o leu como quente ou morno), visitou e fechou.
        </li>
      </ol>
      {aberto && (
        <p className="mt-3 text-fluid-sm text-corpo">Ainda não há anúncio nem campanha registrada.</p>
      )}
    </details>
  );
}

const COLUNAS_DO_CUSTO = [
  { criterio: "cliente", rotulo: "Por cliente", valor: (l: LinhaDoComparativo) => l.custoPorLead },
  { criterio: "qualificado", rotulo: "Por qualificado", valor: (l: LinhaDoComparativo) => l.custoPorQualificado },
  { criterio: "visita", rotulo: "Por visita", valor: (l: LinhaDoComparativo) => l.custoPorVisita },
] as const;

const O_QUE_SAI_MAIS_BARATO: Record<CriterioDoComparativo, string> = {
  visita: "a visita mais barata",
  qualificado: "o cliente qualificado mais barato",
  cliente: "o cliente mais barato",
};

/** A frase que responde a pergunta do cartão, antes de qualquer número. */
function veredito(c: ReturnType<typeof compararCampanhas>): string {
  const melhor = c.linhas.find((l) => l.id === c.melhor);
  const segunda = c.linhas.find((l) => l.id === c.segunda);
  if (!c.criterio || !melhor || !segunda) {
    return `Ainda é cedo para dizer: é preciso duas campanhas com ${MINIMO_PARA_PORCENTAGEM} clientes ou mais.`;
  }
  const coluna = COLUNAS_DO_CUSTO.find((k) => k.criterio === c.criterio)!;
  return `${melhor.nome} traz ${O_QUE_SAI_MAIS_BARATO[c.criterio]}: ${reais(coluna.valor(melhor))}, contra ${reais(coluna.valor(segunda))} de ${segunda.nome}.`;
}

const DEGRAUS: { chave: Exclude<keyof Degraus, "chegaram" | "sairam">; rotulo: string }[] = [
  { chave: "conversaram", rotulo: "Conversaram" },
  { chave: "qualificados", rotulo: "Se qualificaram" },
  { chave: "visitaram", rotulo: "Visitaram" },
  { chave: "fecharam", rotulo: "Fecharam" },
];

/** "3 de 12 · 25%", ou só "2 de 3" quando a amostra é pequena para porcentagem. */
function deQuantos(parte: number, total: number): string {
  const p = porcentagem(parte, total);
  return p === null ? `${parte} de ${total}` : `${parte} de ${total} · ${p}%`;
}

/**
 * O que os clientes de uma campanha fizeram, degrau por degrau. Cada barra é
 * a fração de quem chegou: o comprimento mostra onde a campanha perde gente.
 */
function DegrausDoCliente({ degraus }: { degraus: Degraus }) {
  const total = degraus.chegaram;
  if (total === 0) return null;

  return (
    <figure className="space-y-2">
      <figcaption className="text-fluid-xs text-corpo">
        O que {total === 1 ? "o cliente fez" : `os ${total} clientes fizeram`}
      </figcaption>
      <ol className="space-y-1.5">
        {DEGRAUS.map((d) => (
          <li key={d.chave} className="grid grid-cols-[7.5rem_1fr] items-center gap-x-3 text-fluid-xs sm:grid-cols-[8.5rem_1fr_7rem]">
            <span className="text-corpo">{d.rotulo}</span>
            <span aria-hidden className="h-2 overflow-hidden rounded-full bg-vidro-forte">
              <span
                className="block h-full rounded-full bg-acento"
                style={{ width: `${(degraus[d.chave] / total) * 100}%` }}
              />
            </span>
            <span className="col-start-2 font-semibold text-titulo tabular-nums sm:col-start-3 sm:text-right">
              {deQuantos(degraus[d.chave], total)}
            </span>
          </li>
        ))}
      </ol>
      {degraus.sairam > 0 && (
        <p className="text-fluid-xs text-corpo">
          {degraus.sairam === 1 ? "1 saiu" : `${degraus.sairam} saíram`} (pediu para parar ou foi marcado
          como perdido).
        </p>
      )}
    </figure>
  );
}

/**
 * Uma campanha da lista. Recolhida, mostra o que decide (situação, quanto
 * custou, quantos chegaram e visitaram, custo por cliente e por visita) e,
 * sem gasto informado, pede o valor. Os detalhes (degraus, anúncios de
 * dentro, edição, clientes ligados, apagar) abrem sob demanda (29/10/2026).
 */
function Cartao({
  resumo,
  melhor,
  situacao,
  editavel,
  dono,
  imoveis,
  campanhas,
  ligados,
  listas,
  candidatos,
  hoje,
}: {
  listas?: { receberam: number; responderam: number };
  resumo: ResumoImpulsionamento;
  melhor: boolean;
  situacao: Situacao;
  editavel: boolean;
  dono: string | null;
  imoveis: { id: string; nome: string }[];
  campanhas: { id: string; nome: string }[];
  ligados: ClienteDaLista[];
  candidatos: ClienteDaLista[];
  hoje: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [focarGasto, setFocarGasto] = useState(false);
  const [dia, setDia] = useState(hoje);
  const [valor, setValor] = useState(valorNoCampo(resumo.valorGasto));
  const [imovel, setImovel] = useState(resumo.empreendimentoId ?? "");
  const { msg, pendente, rodar } = useAcao();
  const idDosDetalhes = useId();
  const manual = Boolean(resumo.criadaPeloCorretor);
  const canal = resumo.canal ? CANAIS_DE_CAMPANHA[resumo.canal] : null;
  const semGasto = resumo.gastoTotal === null;

  const periodo = manual
    ? resumo.inicio
      ? `desde ${dataCurta(resumo.inicio)}${resumo.fim ? ` até ${dataCurta(resumo.fim)}` : ""}`
      : `criada em ${dataCurta(resumo.primeiroLeadEm)}`
    : resumo.leads === 0
      ? `visto em ${dataCurta(resumo.ultimoLeadEm)}`
      : `primeiro cliente em ${dataCurta(resumo.primeiroLeadEm)}, último em ${dataCurta(resumo.ultimoLeadEm)}`;

  return (
    <article className="cartao space-y-4 p-4">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-fluid-base min-w-0 font-semibold break-words text-titulo">{nomeDoResumo(resumo)}</h3>
          {melhor && (
            <span className="rounded-full border border-acento-linha bg-acento-lavado px-2 py-0.5 text-fluid-xs font-semibold text-acento-forte">
              Melhor custo
            </span>
          )}
          <span className="rounded-full bg-vidro px-2 py-0.5 text-fluid-xs text-corpo">
            {manual ? `Campanha${canal ? ` · ${canal}` : ""}` : "Anúncio detectado"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-vidro px-2 py-0.5 text-fluid-xs text-corpo">
            <span aria-hidden className={`size-2 rounded-full ${situacao === "no_ar" ? "bg-ok" : "bg-tenue"}`} />
            {situacao === "no_ar" ? "No ar" : "Encerrada"}
          </span>
        </div>
        <p className="text-fluid-xs text-corpo">
          {dono ? `${dono} · ` : ""}
          {periodo}
          {resumo.url && (
            <>
              {" · "}
              <a
                href={resumo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-transparent hover:decoration-current"
              >
                ver o post
              </a>
            </>
          )}
        </p>
      </header>

      {/* Investido em linha própria até caber tudo numa linha só: cinco
          números em duas colunas deixavam um sozinho no fim. */}
      <dl className="grid grid-cols-2 gap-2 text-fluid-sm sm:grid-cols-4 lg:grid-cols-5">
        <Mini rotulo="Investido" valor={reais(resumo.gastoTotal)} className="col-span-2 sm:col-span-4 lg:col-span-1" />
        <Mini rotulo="Clientes" valor={String(resumo.leads)} />
        <Mini rotulo="Visitaram" valor={visitaramDe(resumo)} />
        <Mini rotulo="Por cliente" valor={reais(resumo.custoPorLead)} />
        <Mini rotulo="Por visita" valor={reais(resumo.custoPorVisita)} />
      </dl>

      {semGasto && (
        <div className="flex flex-col gap-2 rounded-xl bg-alerta-lavado px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-fluid-sm text-pretty text-titulo">
            {editavel
              ? "Sem o valor gasto não dá para saber quanto custou cada cliente."
              : "O dono ainda não informou o valor gasto."}
          </p>
          {editavel && (
            <button
              type="button"
              onClick={() => {
                setAberto(true);
                setFocarGasto(true);
              }}
              className={`${BOTAO} shrink-0`}
            >
              Informar gasto
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={idDosDetalhes}
        onClick={() => setAberto((a) => !a)}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-linha px-5 text-fluid-sm font-semibold text-acento-forte hover:bg-vidro lg:ml-auto lg:w-auto"
      >
        {aberto ? "Fechar detalhes" : editavel ? "Detalhes e edição" : "Ver detalhes"}
        <ChevronDown aria-hidden className={`size-4 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>

      {aberto && (
        <div id={idDosDetalhes} className="space-y-4 border-t border-linha pt-4">
          <DegrausDoCliente degraus={resumo.degraus} />
          {resumo.custoPorQualificado !== null && (
            <p className="text-fluid-xs text-corpo">
              Custo por cliente qualificado:{" "}
              <span className="font-semibold text-titulo tabular-nums">{reais(resumo.custoPorQualificado)}</span>
            </p>
          )}

          {listas && listas.receberam > 0 && (
            <p className="text-fluid-xs text-corpo">
              Lista de transmissão: {listas.receberam} cliente{listas.receberam === 1 ? "" : "s"} desta campanha
              recebe{listas.receberam === 1 ? "u" : "ram"} uma lista, {listas.responderam} respond
              {listas.responderam === 1 ? "eu" : "eram"}.
            </p>
          )}

          {resumo.anuncios.length > 0 && (
            <div className="space-y-2">
              <p className="text-fluid-xs text-corpo">Anúncios dentro desta campanha</p>
              <ul className="space-y-1">
                {resumo.anuncios.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-vidro px-3 py-2">
                    <span className="text-fluid-sm min-w-0 break-words text-titulo">
                      {a.titulo ?? "Post impulsionado"}
                      {a.valorGasto !== null && ` · ${reais(a.valorGasto)}`}
                      {a.agrupadoSozinho && (
                        <span className="ml-1 text-fluid-xs text-corpo">· entrou sozinho pela data e pelo canal</span>
                      )}
                    </span>
                    {editavel && !a.agrupadoSozinho && (
                      <button
                        type="button"
                        disabled={pendente}
                        onClick={() => rodar(() => agruparAnuncio({ anuncioId: a.id, campanhaId: null }))}
                        className="botao-solido min-h-11 px-3 text-fluid-xs font-semibold text-perigo"
                      >
                        Tirar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
        </div>
      )}

      {editavel ? (
        <form
          className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            rodar(() =>
              salvarGastoDoImpulsionamento({ id: resumo.id, valor, empreendimentoId: imovel || null, dia }),
            );
          }}
        >
          <label className="space-y-1">
            <span className="text-fluid-xs text-corpo">Gasto total até o dia (R$)</span>
            <input
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Ex.: 50"
              // "Informar gasto" abre os detalhes já com o cursor aqui.
              autoFocus={focarGasto}
              className={CAMPO}
            />
          </label>
          <label className="space-y-1">
            <span className="text-fluid-xs text-corpo">Dia</span>
            <input type="date" value={dia} max={hoje} onChange={(e) => setDia(e.target.value)} className={CAMPO} />
          </label>
          <label className="space-y-1">
            <span className="text-fluid-xs text-corpo">Imóvel (opcional)</span>
            <select value={imovel} onChange={(e) => setImovel(e.target.value)} className={`${CAMPO} select-seta`}>
              <option value="">Não informado</option>
              {imoveis.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={pendente} className={`${BOTAO} self-end`}>
            {pendente ? "Salvando…" : "Salvar"}
          </button>
        </form>
      ) : (
        <p className="text-fluid-sm text-corpo">
          Gasto informado: <span className="text-titulo">{reais(resumo.gastoTotal)}</span>
        </p>
      )}

      {editavel && !manual && campanhas.length > 0 && (
        <label className="block space-y-1">
          <span className="text-fluid-xs text-corpo">Faz parte de uma campanha?</span>
          <select
            defaultValue=""
            disabled={pendente}
            onChange={(e) =>
              e.target.value && rodar(() => agruparAnuncio({ anuncioId: resumo.id, campanhaId: e.target.value }))
            }
            className={`${CAMPO} select-seta`}
          >
            <option value="">Não, fica solto</option>
            {campanhas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      )}

      {editavel && manual && (
        <ClientesDaCampanha
          campanhaId={resumo.id}
          ligados={ligados}
          candidatos={candidatos}
          rodar={rodar}
          pendente={pendente}
        />
      )}

      {editavel && manual && <ApagarCampanha rodar={() => rodar(() => apagarCampanha(resumo.id))} pendente={pendente} />}
        </div>
      )}

      <Mensagem msg={msg} />
    </article>
  );
}

function ClientesDaCampanha({
  campanhaId,
  ligados,
  candidatos,
  rodar,
  pendente,
}: {
  campanhaId: string;
  ligados: ClienteDaLista[];
  candidatos: ClienteDaLista[];
  rodar: (acao: () => Promise<Resultado>, depois?: () => void) => void;
  pendente: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const termo = busca.trim().toLowerCase();
  const visiveis = candidatos.filter((c) => !termo || c.nome.toLowerCase().includes(termo)).slice(0, 40);

  return (
    <div className="space-y-2">
      <p className="text-fluid-xs text-corpo">
        {ligados.length === 0
          ? "Nenhum cliente ligado à mão ainda. Os que chegaram pelos anúncios de dentro já contam."
          : `Clientes ligados à mão (${ligados.length})`}
      </p>
      {ligados.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {ligados.map((c) => (
            <li key={c.id} className="flex items-center gap-1 rounded-full bg-vidro pl-3 text-fluid-xs text-titulo">
              <span className="break-words">{c.nome}</span>
              <button
                type="button"
                aria-label={`Tirar ${c.nome} da campanha`}
                disabled={pendente}
                onClick={() => rodar(() => desvincularCliente(c.id))}
                className="flex h-11 w-11 items-center justify-center text-corpo hover:text-titulo botao-icone"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {!aberto ? (
        <button type="button" onClick={() => setAberto(true)} className={BOTAO_SECUNDARIO}>
          Ligar clientes
        </button>
      ) : (
        <div className="space-y-2 rounded-xl border border-linha p-3">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente"
            className={CAMPO}
          />
          {visiveis.length === 0 ? (
            <p className="text-fluid-sm text-corpo">Nenhum cliente disponível para ligar.</p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {visiveis.map((c) => (
                <li key={c.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-vidro">
                    <input
                      type="checkbox"
                      checked={marcados.has(c.id)}
                      onChange={(e) =>
                        setMarcados((m) => {
                          const n = new Set(m);
                          if (e.target.checked) n.add(c.id);
                          else n.delete(c.id);
                          return n;
                        })
                      }
                      className="h-5 w-5"
                    />
                    <span className="text-fluid-sm min-w-0 break-words text-titulo">{c.nome}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pendente || marcados.size === 0}
              onClick={() =>
                rodar(
                  () => vincularClientes({ campanhaId, leadIds: [...marcados] }),
                  () => {
                    setMarcados(new Set());
                    setAberto(false);
                  },
                )
              }
              className={BOTAO}
            >
              {marcados.size > 0 ? `Ligar ${marcados.size}` : "Ligar"}
            </button>
            <button type="button" onClick={() => setAberto(false)} className={BOTAO_SECUNDARIO}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ApagarCampanha({ rodar, pendente }: { rodar: () => void; pendente: boolean }) {
  const [confirmando, setConfirmando] = useState(false);
  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="botao-solido min-h-11 px-4 text-fluid-sm font-semibold text-perigo"
      >
        Apagar campanha
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-perigo-lavado px-3 py-2">
      <span className="text-fluid-sm text-titulo">Apagar? Os clientes continuam na carteira.</span>
      <button
        type="button"
        disabled={pendente}
        onClick={rodar}
        className="min-h-11 rounded-xl bg-perigo px-4 text-fluid-sm font-semibold text-sobre-cor"
      >
        Apagar
      </button>
      <button type="button" onClick={() => setConfirmando(false)} className={BOTAO_SECUNDARIO}>
        Cancelar
      </button>
    </div>
  );
}

function Mini({ rotulo, valor, className = "" }: { rotulo: string; valor: string; className?: string }) {
  return (
    <div className={`flex flex-col-reverse rounded-xl bg-vidro px-3 py-2 ${className}`}>
      <dt className="text-fluid-xs text-corpo">{rotulo}</dt>
      <dd className="font-semibold text-titulo tabular-nums">{valor}</dd>
    </div>
  );
}
