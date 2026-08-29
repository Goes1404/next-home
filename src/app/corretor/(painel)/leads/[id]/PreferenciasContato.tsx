import { ShieldCheck } from "lucide-react";
import type { PreferenciaContato } from "@/lib/crm/dadosLead";

const CANAL: Record<string, string> = { email: "E-mail", whatsapp: "WhatsApp", telefone: "Ligação" };

export function PreferenciasContato({ preferencias }: { preferencias: PreferenciaContato[] }) {
  return (
    <section className="rounded-2xl border border-linha bg-elevado p-4 sm:p-5" aria-labelledby="preferencias-titulo">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-acento-lavado text-acento-suave">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="preferencias-titulo" className="text-fluid-base font-medium text-titulo">Contato autorizado</h2>
          <p className="text-fluid-xs mt-1 text-tenue">Finalidade: responder à solicitação deste lead.</p>
        </div>
      </div>
      {preferencias.length === 0 ? (
        <p className="text-fluid-sm mt-4 rounded-xl border border-dashed border-linha px-4 py-4 text-tenue">
          Sem registro detalhado — lead anterior à fundação de consentimentos.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {preferencias.map((item) => (
            <li key={item.canal} className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-vidro px-3 py-2">
              <span className="text-fluid-sm text-corpo">{CANAL[item.canal] ?? item.canal}</span>
              <span className={`text-xs font-medium ${item.permitido ? "text-emerald-300" : "text-red-300"}`}>
                {item.permitido ? "Permitido" : "Bloqueado"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
