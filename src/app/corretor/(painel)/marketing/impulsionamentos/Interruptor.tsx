"use client";

/**
 * Liga/desliga com cara de interruptor (26/10/2026, aba Roleta): trilho cheio
 * na cor do módulo quando ligado. A bolinha anda por `left`, sem
 * `transform` no botão (controle do painel não cria containing block).
 */
export function Interruptor({
  ligado,
  aoMudar,
  rotulo,
  desativado = false,
}: {
  ligado: boolean;
  aoMudar: (novo: boolean) => void;
  rotulo: string;
  desativado?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={desativado}
      onClick={() => aoMudar(!ligado)}
      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60 ${
        ligado ? "border-acento bg-acento" : "border-linha-forte bg-vidro-forte"
      }`}
    >
      <span
        aria-hidden
        className={`absolute top-[3px] size-6 rounded-full bg-white shadow transition-[left] duration-150 ${ligado ? "left-7" : "left-1"}`}
      />
    </button>
  );
}
