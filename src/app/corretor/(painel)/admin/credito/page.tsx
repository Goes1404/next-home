import type { Metadata } from "next";
import { AbasAdmin } from "@/app/corretor/(painel)/_componentes/AbasAdmin";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { getParametrosCredito } from "@/lib/credito/parametros";
import { diasDesdeConferencia } from "@/lib/credito/idade";
import { FormularioCredito } from "./FormularioCredito";

export const metadata: Metadata = { title: "Parâmetros de crédito" };
export const dynamic = "force-dynamic";

/**
 * Os números de crédito que o consultor cita.
 *
 * A guarda está em CADA `page.tsx` do segmento, não só no layout: layouts não
 * re-executam ao navegar entre rotas irmãs.
 */
export default async function CreditoPage() {
  await exigirGestorNaPagina();
  const parametros = await getParametrosCredito();

  return (
    <div className="space-y-6">
      <CabecalhoDeTela
        secao="Administração"
        titulo="Parâmetros de crédito"
        descricao="Os números que o consultor pode citar. O que não está aqui, ele não inventa."
      />

      <AbasAdmin ativa="/corretor/admin/credito" />

      <FormularioCredito
        inicial={parametros}
        diasDesde={diasDesdeConferencia(parametros.conferidoEm)}
      />
    </div>
  );
}
