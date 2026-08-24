import { BARRA_ETAPA } from "./etapas";
import { cn } from "@/lib/utils";
import { ETAPAS_DO_CAMINHO, ETAPA_LABEL, type EtapaFunil } from "@/lib/types";

/**
 * Onde este lead está no caminho, em cinco marcas.
 *
 * O corretor via a etapa como uma palavra numa etiqueta — "Visita" — e a
 * palavra não diz o que já passou nem o que falta. Cinco marcas dizem: as
 * cumpridas ficam pintadas, a atual pulsa, as que faltam ficam apagadas.
 *
 * Lead perdido não tem posição no caminho (saiu dele), então a barra vira
 * uma faixa cinza única em vez de mentir uma posição.
 */
export function PassosDoFunil({
  etapa,
  comRotulo = false,
  className,
}: {
  etapa: EtapaFunil;
  /** Mostra o nome da etapa atual embaixo — cabe na ficha, não no cartão. */
  comRotulo?: boolean;
  className?: string;
}) {
  const indiceAtual = (ETAPAS_DO_CAMINHO as readonly EtapaFunil[]).indexOf(etapa);
  const perdido = etapa === "perdido";

  return (
    <div className={className}>
      <div
        className="flex items-center gap-1"
        role="img"
        aria-label={
          perdido
            ? "Lead perdido"
            : `Etapa ${indiceAtual + 1} de ${ETAPAS_DO_CAMINHO.length}: ${ETAPA_LABEL[etapa]}`
        }
      >
        {perdido ? (
          <span className="bg-tenue/35 h-1.5 flex-1 rounded-full" />
        ) : (
          ETAPAS_DO_CAMINHO.map((passo, i) => (
            <span
              key={passo}
              aria-hidden
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i < indiceAtual && BARRA_ETAPA[passo],
                i < indiceAtual && "opacity-45",
                i === indiceAtual && BARRA_ETAPA[passo],
                i > indiceAtual && "bg-linha",
              )}
            />
          ))
        )}
      </div>

      {comRotulo && (
        <p className="text-fluid-xs text-apoio mt-1.5">
          {perdido ? (
            "Fora do funil"
          ) : (
            <>
              <span className="text-titulo font-medium">{ETAPA_LABEL[etapa]}</span>
              <span className="text-tenue tabular-nums">
                {" "}
                · passo {indiceAtual + 1} de {ETAPAS_DO_CAMINHO.length}
              </span>
            </>
          )}
        </p>
      )}
    </div>
  );
}
