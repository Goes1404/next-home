import type { SituacaoDaCota } from "@/lib/planos/cotaDaIa";

/**
 * As respostas da IA de um grupo no mês, contra o teto (fase 2B). Só número:
 * a plataforma nunca vê conversa (§4, §11).
 *
 * Classes por extenso: montada em tempo de execução, a classe não existiria.
 */
const SELO: Record<SituacaoDaCota["nivel"], { rotulo: string; classe: string; barra: string } | null> = {
  sem_teto: null,
  livre: null,
  aviso: { rotulo: "Perto do limite", classe: "bg-alerta-lavado text-alerta border-alerta-linha", barra: "bg-alerta" },
  esgotada: { rotulo: "Acabou", classe: "bg-perigo-lavado text-perigo border-perigo-linha", barra: "bg-perigo" },
};

const NUMERO = new Intl.NumberFormat("pt-BR");

export function UsoDaIa({ uso, ajustado }: { uso: SituacaoDaCota; ajustado: boolean }) {
  const selo = SELO[uso.nivel];
  const largura = uso.percentual === null ? 0 : Math.min(100, uso.percentual);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-apoio text-fluid-xs">Respostas da IA neste mês</p>
        {selo && <span className={`text-fluid-xs rounded-full border px-2.5 py-1 ${selo.classe}`}>{selo.rotulo}</span>}
      </div>
      <p className="text-titulo text-fluid-sm">
        {uso.teto === null
          ? `${NUMERO.format(uso.respostas)} · sem limite`
          : `${NUMERO.format(uso.respostas)} de ${NUMERO.format(uso.teto)} (${uso.percentual}%)`}
        {ajustado && <span className="text-apoio"> · limite ajustado</span>}
      </p>
      {uso.teto !== null && (
        <div
          className="bg-vidro h-2 overflow-hidden rounded-full"
          role="meter"
          aria-label="Respostas da IA usadas neste mês"
          aria-valuemin={0}
          aria-valuemax={uso.teto}
          aria-valuenow={Math.min(uso.respostas, uso.teto)}
        >
          <div className={`h-full rounded-full ${selo?.barra ?? "bg-acento"}`} style={{ width: `${largura}%` }} />
        </div>
      )}
    </div>
  );
}
