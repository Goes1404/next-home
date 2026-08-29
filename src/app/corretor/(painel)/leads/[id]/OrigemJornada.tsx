import { Megaphone, Route } from "lucide-react";
import { dataHora } from "@/app/corretor/(painel)/_componentes/CartaoLead";
import { identificadorClique, rotuloOrigem } from "@/lib/marketing/apresentacao";
import type { TouchpointMarketing } from "@/lib/crm/dadosLead";

export function OrigemJornada({ touchpoints }: { touchpoints: TouchpointMarketing[] }) {
  const primeiro = touchpoints[0] ?? null;

  return (
    <section className="rounded-2xl border border-linha bg-elevado p-4 sm:p-5" aria-labelledby="origem-titulo">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-acento-lavado text-acento-suave">
          <Megaphone className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="origem-titulo" className="text-fluid-base font-medium text-titulo">Origem e jornada</h2>
          <p className="text-fluid-xs mt-1 text-tenue">A origem original não muda quando o lead troca de corretor.</p>
        </div>
      </div>

      {!primeiro ? (
        <div className="mt-4 rounded-xl border border-dashed border-linha px-4 py-4">
          <p className="text-fluid-sm text-corpo">Origem não identificada</p>
          <p className="text-fluid-xs mt-1 text-tenue">Lead anterior à fundação de atribuição ou sem parâmetros conhecidos.</p>
        </div>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-vidro px-4 py-3">
              <dt className="text-fluid-xs text-tenue">Primeira origem</dt>
              <dd className="text-fluid-sm mt-1 break-words font-medium text-titulo">
                {rotuloOrigem(primeiro.origem, primeiro.atribuicao)}
              </dd>
            </div>
            <div className="rounded-xl bg-vidro px-4 py-3">
              <dt className="text-fluid-xs text-tenue">Campanha</dt>
              <dd className="text-fluid-sm mt-1 break-words font-medium text-titulo">
                {primeiro.atribuicao.utm_campaign || "Não informada"}
              </dd>
            </div>
          </dl>

          <ol className="mt-4 space-y-3" aria-label="Touchpoints conhecidos do lead">
            {touchpoints.map((item, indice) => {
              const clique = identificadorClique(item.atribuicao);
              return (
                <li key={item.id} className="relative flex gap-3">
                  <div className="flex w-8 shrink-0 flex-col items-center">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-acento-linha bg-acento-lavado text-acento-suave">
                      <Route className="h-4 w-4" aria-hidden="true" />
                    </span>
                    {indice < touchpoints.length - 1 && <span className="mt-1 min-h-5 w-px flex-1 bg-linha" aria-hidden="true" />}
                  </div>
                  <div className="min-w-0 pb-2">
                    <p className="text-fluid-sm break-words font-medium text-titulo">
                      {rotuloOrigem(item.origem, item.atribuicao)}
                    </p>
                    <p className="text-fluid-xs mt-0.5 text-tenue">{dataHora.format(new Date(item.ocorridoEm))}</p>
                    {(item.atribuicao.utm_content || item.atribuicao.utm_term || clique) && (
                      <p className="text-fluid-xs mt-1 break-all text-apoio">
                        {[item.atribuicao.utm_content, item.atribuicao.utm_term, clique].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
