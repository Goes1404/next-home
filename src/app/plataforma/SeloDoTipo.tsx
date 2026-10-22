import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { ROTULO_DO_TIPO, type TipoDeGrupo } from "@/lib/plataforma/rotulosDoGrupo";

/**
 * O selo do tipo da conta: ícone, cor E texto (a cor sozinha não distingue
 * para quem não a enxerga). O texto fica no tom do título (contraste garantido
 * nos dois temas); a cor vai na borda, no fundo e no ícone.
 */
const ESTILO: Record<TipoDeGrupo, { classe: string; icone: string }> = {
  imobiliaria: { classe: "bg-realce-lavado border-realce-linha", icone: "text-realce" },
  independente: { classe: "bg-acento-lavado border-acento-linha", icone: "text-acento" },
};

function Icone({ tipo, classe }: { tipo: TipoDeGrupo; classe: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`size-4 shrink-0 ${classe}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {tipo === "imobiliaria" ? (
        <>
          <path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" />
          <path d="M14 10h5a1 1 0 0 1 1 1v10" />
          <path d="M3 21h18M8 8h2M8 12h2M8 16h2" />
        </>
      ) : (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </>
      )}
    </svg>
  );
}

/** `grupoId` é opcional: com ele, a Next Home ganha o selo extra "Casa". */
export function SeloDoTipo({ tipo, grupoId }: { tipo: TipoDeGrupo; grupoId?: string }) {
  const estilo = ESTILO[tipo];
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={`text-fluid-xs text-titulo inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${estilo.classe}`}
      >
        <Icone tipo={tipo} classe={estilo.icone} />
        {ROTULO_DO_TIPO[tipo]}
      </span>
      {grupoId === GRUPO_NEXT_HOME_ID && (
        <span className="text-fluid-xs text-titulo border-linha-forte rounded-full border px-2.5 py-1 font-medium">
          Casa
        </span>
      )}
    </span>
  );
}
