import { fraseDoQueResta, ROTULO_DO_RECURSO, RECURSOS, type Recurso, type SituacaoDoRecurso } from "@/lib/planos/limitesDoPlano";

/**
 * Os três usos do mês (artes, vídeos e mensagens de lista) com barra, para o
 * gestor e para a plataforma (limites do plano). Só número: a plataforma nunca vê
 * conteúdo (§4, §11). Sem estado nem servidor, então serve nos dois lados.
 *
 * Classes por extenso: montada em tempo de execução, a classe não existiria.
 */
const SELO: Record<SituacaoDoRecurso["nivel"], { rotulo: string; classe: string; barra: string } | null> = {
  sem_teto: null,
  livre: null,
  aviso: { rotulo: "Perto do limite", classe: "bg-alerta-lavado text-alerta border-alerta-linha", barra: "bg-alerta" },
  esgotada: { rotulo: "Acabou", classe: "bg-perigo-lavado text-perigo border-perigo-linha", barra: "bg-perigo" },
};

const NUMERO = new Intl.NumberFormat("pt-BR");

function Linha({ s, ajustado }: { s: SituacaoDoRecurso; ajustado: boolean }) {
  const selo = SELO[s.nivel];
  const largura = s.percentual === null ? 0 : Math.min(100, s.percentual);
  return (
    <li className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-apoio text-fluid-xs">{ROTULO_DO_RECURSO[s.recurso]} neste mês</p>
        {selo && <span className={`text-fluid-xs rounded-full border px-2.5 py-1 ${selo.classe}`}>{selo.rotulo}</span>}
      </div>
      <p className="text-titulo text-fluid-sm">
        {s.teto === null
          ? `${NUMERO.format(s.usados)} · sem limite`
          : `${NUMERO.format(s.usados)} de ${NUMERO.format(s.teto)} (${s.percentual}%)`}
        {ajustado && <span className="text-apoio"> · limite ajustado</span>}
      </p>
      {s.teto !== null && (
        <div
          className="bg-vidro h-2 overflow-hidden rounded-full"
          role="meter"
          aria-label={`${ROTULO_DO_RECURSO[s.recurso]} usados neste mês`}
          aria-valuemin={0}
          aria-valuemax={s.teto}
          aria-valuenow={Math.min(s.usados, s.teto)}
        >
          <div className={`h-full rounded-full ${selo?.barra ?? "bg-acento"}`} style={{ width: `${largura}%` }} />
        </div>
      )}
      {s.nivel === "esgotada" && <p className="text-fluid-xs text-corpo">{fraseDoQueResta(s)}</p>}
    </li>
  );
}

export function UsoDosLimites({
  limites,
  ajustados,
}: {
  limites: Record<Recurso, SituacaoDoRecurso>;
  /** Quais tetos a plataforma mexeu (para a plataforma dizer "limite ajustado"). */
  ajustados?: Partial<Record<Recurso, boolean>>;
}) {
  return (
    <ul className="flex flex-col gap-5">
      {RECURSOS.map((r) => (
        <Linha key={r} s={limites[r]} ajustado={ajustados?.[r] ?? false} />
      ))}
    </ul>
  );
}
