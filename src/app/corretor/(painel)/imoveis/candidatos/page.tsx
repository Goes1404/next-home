import Link from "next/link";
import { getCandidatosDoCatalogo } from "@/lib/imoveis/candidatosDoCatalogo";
import { FilaCandidatos } from "./FilaCandidatos";

export const metadata = {
  title: "Fila de cadastro | Painel do Corretor",
  description: "Lançamentos de Barueri levantados no mercado, esperando decisão de cadastro.",
};

export const dynamic = "force-dynamic";

/**
 * A rota fica DENTRO de `/corretor/imoveis`, e isso não é organização de
 * pastas: o menu casa por prefixo, então "Imóveis" continua aceso aqui sem
 * um oitavo destino. A régua de destinos do painel é a que a reforma de
 * bolso deixou — o que é parente vira sub-rota, não item de menu.
 */
export default async function CandidatosPage() {
  const candidatos = await getCandidatosDoCatalogo();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href="/corretor/imoveis"
          className="text-fluid-xs text-apoio hover:text-titulo inline-flex min-h-9 items-center transition-colors"
        >
          ← Imóveis
        </Link>
        <h1 className="text-fluid-xl text-titulo font-bold">Fila de cadastro</h1>
        <p className="text-fluid-xs text-apoio max-w-2xl text-pretty">
          Levantamento de 01/09/2026: os lançamentos e obras de Barueri que aparecem no mercado.
          Aqui só existe nome, bairro, tipologia e o link da fonte — nada disto aparece na vitrine
          nem no atendimento da assistente enquanto não virar cadastro de verdade.
        </p>
      </div>

      <FilaCandidatos candidatos={candidatos} />
    </div>
  );
}
