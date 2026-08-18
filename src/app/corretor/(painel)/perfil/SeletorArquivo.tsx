"use client";

import { useActionState, useRef } from "react";
import type { EstadoForm } from "@/app/corretor/actions";

export function SeletorArquivo({
  action,
  accept,
  rotulo,
  dica,
}: {
  action: (estado: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  accept: string;
  rotulo: string;
  dica: string;
}) {
  const [estado, dispatch, pendente] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={dispatch}>
      <label className="text-fluid-sm inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-mist-200 transition-colors hover:border-brand-300">
        {pendente ? "Enviando…" : rotulo}
        <input
          type="file"
          name="arquivo"
          accept={accept}
          disabled={pendente}
          className="hidden"
          onChange={() => formRef.current?.requestSubmit()}
        />
      </label>
      <p className="text-fluid-xs mt-1 text-mist-500">{dica}</p>
      {estado?.erro && <p className="text-fluid-xs mt-1 text-red-300">{estado.erro}</p>}
      {estado?.ok && <p className="text-fluid-xs mt-1 text-brand-200">{estado.ok}</p>}
    </form>
  );
}
