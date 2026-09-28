/**
 * Anel de porcentagem (28/09/2026): uma taxa só contra 100%, onde o número
 * no meio é o dado e o arco é o reforço. Usado no placar para "visitas que
 * viraram venda". Sem taxa (ninguém visitou), o anel fica vazio e o meio diz
 * "—", em vez de desenhar um zero que parece desempenho ruim.
 *
 * `pathLength=100` deixa o traço em porcentagem direta, sem conta de
 * circunferência.
 */
export function Anel({ valor, tamanho = 44, rotulo }: { valor: number | null; tamanho?: number; rotulo: string }) {
  const r = 15.5;
  return (
    <svg
      viewBox="0 0 36 36"
      width={tamanho}
      height={tamanho}
      role="img"
      aria-label={valor === null ? `${rotulo}: sem dado` : `${rotulo}: ${valor}%`}
      className="shrink-0"
    >
      <title>{valor === null ? `${rotulo}: sem dado` : `${rotulo}: ${valor}%`}</title>
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" className="stroke-vidro-forte" />
      {valor !== null && valor > 0 && (
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${Math.min(100, valor)} 100`}
          transform="rotate(-90 18 18)"
          className="stroke-acento"
        />
      )}
      <text
        x="18"
        y="18"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-titulo"
        style={{ fontSize: valor !== null && valor >= 100 ? 8 : 9, fontWeight: 700 }}
      >
        {valor === null ? "—" : `${valor}%`}
      </text>
    </svg>
  );
}
