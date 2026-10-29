import Link from "next/link";
import { linkDeIndicacao } from "@/lib/indicacoes/codigo";
import { PAINEL_URL_PADRAO } from "@/lib/marcaDoCrm/marca";
import type { NegocioDoGrupo as Negocio } from "@/lib/plataforma/indicacoes";
import type { ContaEmRisco } from "@/lib/plataforma/riscoDeCancelamento";
import { VERSAO_DO_TERMO_DE_ADESAO } from "@/lib/termos/termoDeAdesao";
import { AplicarCredito } from "../../AplicarCredito";
import { SeloDoRisco } from "../../SeloDoRisco";

const DATA_E_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});
const REAL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * O negócio da Astro na tela da conta (0247, 29/10/2026): o risco de
 * cancelamento com os motivos, o aceite do termo de adesão, o código de
 * indicação, quem indicou a conta e os créditos que ela ganhou indicando
 * (com o "Marcar como aplicado"). Só cadastro e datas, nada de conversa.
 */
export function NegocioDoGrupo({
  grupoId,
  negocio,
  risco,
  ehContaDaCasa,
}: {
  grupoId: string;
  negocio: Negocio | null;
  risco: ContaEmRisco | null;
  ehContaDaCasa: boolean;
}) {
  const vigente = negocio?.aceites.find((a) => a.vigente) ?? null;
  const pendentes = negocio?.creditos.filter((c) => !c.aplicadoEm) ?? [];

  return (
    <section className="cartao flex flex-col gap-5 p-5" aria-labelledby="titulo-negocio">
      <h2 id="titulo-negocio" className="text-fluid-sm text-titulo font-bold">
        Relacionamento
      </h2>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-fluid-sm text-titulo font-medium">Risco de cancelamento</h3>
          <SeloDoRisco risco={risco?.risco} />
        </div>
        {ehContaDaCasa ? (
          <p className="text-fluid-sm text-apoio mt-1">A conta da casa não entra no cálculo.</p>
        ) : !risco ? (
          <p className="text-fluid-sm text-apoio mt-1">Não medido agora.</p>
        ) : risco.risco.motivos.length === 0 ? (
          <p className="text-fluid-sm text-apoio mt-1">Nenhum sinal de risco hoje.</p>
        ) : (
          <ul className="text-fluid-sm text-corpo mt-1 list-disc space-y-0.5 pl-5">
            {risco.risco.motivos.map((m) => (
              <li key={m.chave}>
                {m.texto} <span className="text-apoio">(+{m.pontos})</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {negocio === null ? (
        <p className="text-fluid-sm text-apoio border-linha border-t pt-4">
          Termo de adesão e indicações não lidos agora (a migration 0247 já foi aplicada?).
        </p>
      ) : (
        <>
          <div className="border-linha border-t pt-4">
            <h3 className="text-fluid-sm text-titulo font-medium">Termo de adesão</h3>
            {ehContaDaCasa ? (
              <p className="text-fluid-sm text-apoio mt-1">A conta da casa não assina o termo.</p>
            ) : vigente ? (
              <p className="text-fluid-sm text-corpo mt-1">
                Versão vigente aceita em {DATA_E_HORA.format(new Date(vigente.aceitoEm))} por {vigente.nome}
                {vigente.email ? ` (${vigente.email})` : ""}.
              </p>
            ) : (
              <p className="text-fluid-sm text-alerta mt-1">
                Ainda não aceitou a versão vigente ({VERSAO_DO_TERMO_DE_ADESAO}). O gestor vê o termo no próximo acesso.
              </p>
            )}
            {negocio.aceites.filter((a) => !a.vigente).length > 0 && (
              <p className="text-fluid-xs text-apoio mt-1">
                Versões anteriores:{" "}
                {negocio.aceites
                  .filter((a) => !a.vigente)
                  .map((a) => `${a.versao} em ${DATA_E_HORA.format(new Date(a.aceitoEm))}`)
                  .join("; ")}
              </p>
            )}
          </div>

          <div className="border-linha border-t pt-4">
            <h3 className="text-fluid-sm text-titulo font-medium">Indique e ganhe</h3>
            <dl className="text-fluid-sm mt-1 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-apoio text-fluid-xs">Link da conta</dt>
                <dd className="text-titulo break-all">
                  {negocio.codigo ? linkDeIndicacao(negocio.codigo, PAINEL_URL_PADRAO) : "sem código"}
                </dd>
              </div>
              <div>
                <dt className="text-apoio text-fluid-xs">Indicada por</dt>
                <dd className="text-titulo">
                  {negocio.indicadaPor ? (
                    <Link href={`/plataforma/grupos/${negocio.indicadaPor.id}`} className="underline underline-offset-4">
                      {negocio.indicadaPor.nome}
                    </Link>
                  ) : (
                    "ninguém"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-apoio text-fluid-xs">Contas que indicou</dt>
                <dd className="text-titulo">{negocio.indicacoesFeitas}</dd>
              </div>
            </dl>

            {negocio.creditos.length > 0 && (
              <ul className="mt-3 flex flex-col gap-3">
                {negocio.creditos.map((c) => (
                  <li key={c.id} className="border-linha flex flex-wrap items-start justify-between gap-3 rounded-xl border p-3">
                    <div className="min-w-0">
                      <p className="text-fluid-sm text-titulo font-medium">
                        {c.descricao}
                        {c.valorEstimado !== null ? ` (≈ ${REAL.format(c.valorEstimado)})` : ""}
                      </p>
                      <p className="text-fluid-xs text-apoio">
                        {c.indicada ? `${c.indicada.nome} pagou` : "Gerado"} em {DATA_E_HORA.format(new Date(c.criadoEm))}
                        {c.aplicadoEm ? ` · aplicado em ${DATA_E_HORA.format(new Date(c.aplicadoEm))}` : ""}
                      </p>
                    </div>
                    {!c.aplicadoEm && <AplicarCredito grupoId={grupoId} creditoId={c.id} />}
                  </li>
                ))}
              </ul>
            )}
            {pendentes.length > 0 && (
              <p className="text-fluid-xs text-alerta mt-2">
                {pendentes.length === 1 ? "1 crédito a aplicar" : `${pendentes.length} créditos a aplicar`} na próxima
                cobrança desta conta.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
