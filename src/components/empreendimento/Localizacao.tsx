import { Reveal } from "@/components/motion/Reveal";
import type { Empreendimento } from "@/lib/types";

/**
 * Bloco de localização textual. Sem mapa incorporado por ora — plotar um
 * pino errado é pior do que não mostrar mapa nenhum, e ainda não temos
 * lat/lng validados nem chave de API para geocodificação (Fase 2/3).
 */
export function Localizacao({ empreendimento: e }: { empreendimento: Empreendimento }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:py-24">
      <Reveal>
        <h2 className="text-fluid-2xl text-mist-50">Localização</h2>
        <div className="mt-6 rounded-2xl border border-white/10 bg-ink-900 px-6 py-6">
          <p className="text-fluid-lg text-mist-50">{e.endereco}</p>
          <p className="text-fluid-sm mt-1 text-mist-400">
            {e.bairro} · {e.cidade}
          </p>
        </div>
      </Reveal>
    </section>
  );
}
