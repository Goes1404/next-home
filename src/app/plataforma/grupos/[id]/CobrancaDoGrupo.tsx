"use client";

import { useState, useTransition } from "react";
import { dataCompleta, diaEMes, type EstadoDaCobranca, type SituacaoDaCobranca } from "@/lib/planos/cobranca";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import type { PagamentoRegistrado } from "@/lib/plataforma/grupos";
import {
  ajustarCobrancaDoGrupo,
  registrarPagamento,
  removerPagamento,
  type ResultadoDaCobranca,
} from "../../cobrancaAcoes";

const CLASSE_DO_CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 w-full rounded-xl border px-3.5 py-2.5 focus:outline-none";
const BOTAO_PRINCIPAL =
  "text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 cursor-pointer items-center rounded-xl px-5 font-bold disabled:opacity-60";
const BOTAO_SECUNDARIO =
  "botao-secundario text-fluid-sm text-titulo flex min-h-11 cursor-pointer items-center rounded-xl px-4 font-medium disabled:opacity-60";

/** Classes por extenso: montada em tempo de execução, a classe não existiria. */
const ESTADO: Record<EstadoDaCobranca, { rotulo: string; classe: string }> = {
  isento: { rotulo: "Isento (preço de custo)", classe: "bg-campo text-apoio border-linha-forte" },
  teste: { rotulo: "Teste grátis", classe: "bg-campo text-titulo border-linha-forte" },
  em_dia: { rotulo: "Em dia", classe: "bg-ok-lavado text-ok border-ok-linha" },
  pendente: { rotulo: "Vencida", classe: "bg-alerta-lavado text-alerta border-alerta-linha" },
  suspenso: { rotulo: "Suspenso", classe: "bg-perigo-lavado text-perigo border-perigo-linha" },
};

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const MES = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" });

const mesDaCompetencia = (competencia: string) => MES.format(new Date(`${competencia}T00:00:00Z`));

/**
 * A cobrança do grupo na tela da plataforma (fase 2C): o estado, o histórico
 * e o registro de pagamento à mão. Quem suspende por atraso é a conta de
 * `cobranca.ts` (a mesma do webhook): aqui só se vê. A suspensão MANUAL subiu
 * para "Situação e plano", no alto da página (29/10/2026).
 */
export function CobrancaDoGrupo({
  grupoId,
  cobranca,
  mensalidade,
  diaDoVencimento,
  pagamentos,
  suspensoManual,
  hoje,
}: {
  grupoId: string;
  cobranca: SituacaoDaCobranca;
  mensalidade: number | null;
  diaDoVencimento: number;
  pagamentos: PagamentoRegistrado[];
  /** `grupos.situacao === 'suspenso'`: a suspensão feita à mão. */
  suspensoManual: boolean;
  /** O dia de hoje em São Paulo, `AAAA-MM-DD`. */
  hoje: string;
}) {
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const [pendente, iniciar] = useTransition();
  const [competencia, setCompetencia] = useState((cobranca.competenciaEmAberto ?? hoje.slice(0, 7) + "-01").slice(0, 7));
  const [valor, setValor] = useState(mensalidade === null ? "" : String(mensalidade).replace(".", ","));
  const [pagoEm, setPagoEm] = useState(hoje);
  const [observacao, setObservacao] = useState("");
  const [mensalidadeDigitada, setMensalidadeDigitada] = useState(
    mensalidade === null ? "" : String(mensalidade).replace(".", ","),
  );
  const [diaDigitado, setDiaDigitado] = useState(String(diaDoVencimento));

  const agir = (acao: () => Promise<ResultadoDaCobranca>, sucesso: string, aoDarCerto?: () => void) =>
    iniciar(async () => {
      setAviso(null);
      try {
        const r = await acao();
        setAviso(r.ok ? { texto: sucesso, erro: false } : { texto: r.erro, erro: true });
        if (r.ok) aoDarCerto?.();
      } catch (e) {
        setAviso({
          texto: ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Não foi possível falar com o servidor. Tente de novo.",
          erro: true,
        });
      }
    });

  const estado = ESTADO[cobranca.estado];

  return (
    <section className="cartao flex flex-col gap-5 p-5" aria-labelledby="titulo-cobranca">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="titulo-cobranca" className="text-fluid-sm text-titulo font-bold">
          Cobrança
        </h2>
        <span className={`text-fluid-xs rounded-full border px-2.5 py-1 ${estado.classe}`}>{estado.rotulo}</span>
      </div>

      <dl className="text-fluid-sm grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <div>
          <dt className="text-apoio text-fluid-xs">Mensalidade</dt>
          <dd className="text-titulo">{mensalidade === null ? "Não definida" : REAIS.format(mensalidade)}</dd>
        </div>
        <div>
          <dt className="text-apoio text-fluid-xs">Vence todo dia</dt>
          <dd className="text-titulo">{diaDoVencimento}</dd>
        </div>
        <div>
          <dt className="text-apoio text-fluid-xs">Próximo vencimento</dt>
          <dd className="text-titulo">{dataCompleta(cobranca.proximoVencimento)}</dd>
        </div>
        {cobranca.fimDoTeste && (
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-apoio text-fluid-xs">Teste grátis</dt>
            <dd className="text-titulo">
              {cobranca.estado === "teste"
                ? `Acaba em ${dataCompleta(cobranca.fimDoTeste)} (${cobranca.diasDeTesteRestantes === 1 ? "1 dia restante" : `${cobranca.diasDeTesteRestantes} dias restantes`}). Sem pagamento, suspende no mesmo dia.`
                : `Acabou em ${dataCompleta(cobranca.fimDoTeste)}.`}
            </dd>
          </div>
        )}
        {cobranca.competenciaEmAberto && cobranca.vencimento && (
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-apoio text-fluid-xs">Em aberto</dt>
            <dd className="text-titulo">
              {mesDaCompetencia(cobranca.competenciaEmAberto)}, venceu em {dataCompleta(cobranca.vencimento)} (
              {cobranca.diasDeAtraso === 0 ? "vence hoje" : `${cobranca.diasDeAtraso} dias de atraso`})
              {cobranca.estado === "pendente" && cobranca.suspendeEm
                ? `. Suspende em ${diaEMes(cobranca.suspendeEm)}.`
                : "."}
            </dd>
          </div>
        )}
      </dl>
      {suspensoManual && (
        <p className="text-fluid-xs text-apoio">
          Este grupo está suspenso à mão. Registrar pagamento não o reativa: use &quot;Reativar grupo&quot; em Situação e plano, no alto da página.
        </p>
      )}

      {aviso && (
        <p
          role={aviso.erro ? "alert" : "status"}
          className={`text-fluid-sm rounded-xl border px-4 py-3 ${
            aviso.erro ? "border-perigo-linha bg-perigo-lavado text-perigo" : "border-ok-linha bg-ok-lavado text-ok"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <form
        className="border-linha flex flex-col gap-3 border-t pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          agir(() => registrarPagamento(grupoId, { competencia, valor, pagoEm, observacao }), "Pagamento registrado.", () =>
            setObservacao(""),
          );
        }}
      >
        <h3 className="text-fluid-sm text-titulo font-medium">Registrar pagamento</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
            Mês pago
            <input
              type="month"
              name="competencia"
              required
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              className={CLASSE_DO_CAMPO}
            />
          </label>
          <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
            Valor (R$)
            <input
              name="valor"
              inputMode="decimal"
              required
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="250,00"
              className={CLASSE_DO_CAMPO}
            />
          </label>
          <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
            Data do pagamento
            <input
              type="date"
              name="pagoEm"
              required
              max={hoje}
              value={pagoEm}
              onChange={(e) => setPagoEm(e.target.value)}
              className={CLASSE_DO_CAMPO}
            />
          </label>
        </div>
        <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
          Observação (opcional)
          <input
            name="observacao"
            maxLength={300}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Pix, comprovante enviado por WhatsApp…"
            className={CLASSE_DO_CAMPO}
          />
        </label>
        <div>
          <button type="submit" disabled={pendente} className={BOTAO_PRINCIPAL}>
            {pendente ? "Salvando…" : "Registrar pagamento"}
          </button>
        </div>
      </form>

      <div className="border-linha flex flex-col gap-3 border-t pt-5">
        <h3 className="text-fluid-sm text-titulo font-medium">Últimos pagamentos</h3>
        {pagamentos.length === 0 ? (
          <p className="text-fluid-sm text-apoio">Nenhum pagamento registrado.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pagamentos.map((p) => (
              <li
                key={p.id}
                className="border-linha flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-fluid-sm text-titulo break-words">
                    {mesDaCompetencia(p.competencia)}: {REAIS.format(p.valor)}
                  </p>
                  <p className="text-fluid-xs text-apoio break-words">
                    Pago em {dataCompleta(p.pagoEm)}
                    {p.observacao ? `. ${p.observacao}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => {
                    if (!window.confirm(`Remover o pagamento de ${mesDaCompetencia(p.competencia)}? Use só para registro errado.`)) return;
                    agir(() => removerPagamento(grupoId, p.id), "Pagamento removido.");
                  }}
                  className={BOTAO_SECUNDARIO}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        className="border-linha flex flex-col gap-3 border-t pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          agir(
            () => ajustarCobrancaDoGrupo(grupoId, { mensalidade: mensalidadeDigitada, diaDoVencimento: diaDigitado }),
            "Mensalidade e vencimento salvos.",
          );
        }}
      >
        <h3 className="text-fluid-sm text-titulo font-medium">Mensalidade e vencimento</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
            Mensalidade combinada (R$)
            <input
              name="mensalidade"
              inputMode="decimal"
              value={mensalidadeDigitada}
              onChange={(e) => setMensalidadeDigitada(e.target.value)}
              placeholder="Em branco = não definida"
              className={CLASSE_DO_CAMPO}
            />
          </label>
          <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
            Dia do vencimento (1 a 28)
            <input
              name="diaDoVencimento"
              inputMode="numeric"
              required
              value={diaDigitado}
              onChange={(e) => setDiaDigitado(e.target.value)}
              className={CLASSE_DO_CAMPO}
            />
          </label>
        </div>
        <p className="text-fluid-xs text-apoio">
          Sem pro rata: vence todo mês no mesmo dia. A suspensão automática vale no 5º dia depois do vencimento sem
          pagamento; o plano de preço de custo (Next Home) nunca é cobrado.
        </p>
        <div>
          <button type="submit" disabled={pendente} className={BOTAO_PRINCIPAL}>
            {pendente ? "Salvando…" : "Salvar mensalidade e vencimento"}
          </button>
        </div>
      </form>
    </section>
  );
}
