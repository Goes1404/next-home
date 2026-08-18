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
      <label className="text-fluid-sm inline-flex cursor-pointer items-center gap-2 rounded-full border border-linha-forte px-4 py-2 text-corpo transition-colors hover:border-acento-linha">
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
      <p className="text-fluid-xs mt-1 text-tenue">{dica}</p>
      {estado?.erro && <p className="text-fluid-xs mt-1 text-perigo">{estado.erro}</p>}
      {estado?.ok && <p className="text-fluid-xs mt-1 text-acento-suave">{estado.ok}</p>}
    </form>
  );
}
