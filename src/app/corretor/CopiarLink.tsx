"use client";

import { useState } from "react";

export function CopiarLink({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    await navigator.clipboard.writeText(link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
      <input
        readOnly
        value={link}
        onFocus={(ev) => ev.currentTarget.select()}
        className="w-full rounded-xl border border-white/15 bg-ink-950/60 px-4 py-3 text-mist-50 outline-none"
      />
      <button
        type="button"
        onClick={copiar}
        className="shrink-0 rounded-xl bg-brand-500 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-400"
      >
        {copiado ? "Copiado!" : "Copiar"}
      </button>
    </div>
  );
}
