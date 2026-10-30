import type { NivelDoRisco, RiscoDaConta } from "@/lib/plataforma/riscoDeCancelamento";

/** Classes por extenso: montada em tempo de execução, a classe não existiria. */
const SELO: Record<Exclude<NivelDoRisco, "baixo">, { rotulo: string; classe: string }> = {
  alto: { rotulo: "Risco alto", classe: "bg-perigo-lavado text-perigo border-perigo-linha" },
  medio: { rotulo: "Risco médio", classe: "bg-alerta-lavado text-alerta border-alerta-linha" },
};

/**
 * O selo "Risco" da conta (29/10/2026): só aparece com risco médio ou alto;
 * os pontos vão no `title` (o motivo está escrito ao lado, na tela).
 */
export function SeloDoRisco({ risco }: { risco: RiscoDaConta | null | undefined }) {
  if (!risco || risco.nivel === "baixo") return null;
  const selo = SELO[risco.nivel];
  return (
    <span title={`${risco.pontos} pontos de risco`} className={`text-fluid-xs shrink-0 rounded-full border px-2.5 py-1 ${selo.classe}`}>
      {selo.rotulo}
    </span>
  );
}
