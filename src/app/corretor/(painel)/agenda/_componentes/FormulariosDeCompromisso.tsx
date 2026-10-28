"use client";

import { useActionState, useState } from "react";
import { bloquearHorario, cancelarDoFormulario, marcarReuniao } from "../acoesCompromissos";

const CAMPO = "min-h-11 w-full rounded-xl border border-linha bg-campo px-3 text-sm text-corpo";

function Retorno({ estado }: { estado: { erro?: string; ok?: string } | null }) {
  if (estado?.erro)
    return (
      <p role="alert" className="text-fluid-xs mt-2 text-alerta">
        {estado.erro}
      </p>
    );
  if (estado?.ok) return <p className="text-fluid-xs mt-2 text-ok">{estado.ok}</p>;
  return null;
}

/**
 * Dentro da gaveta "Novo" da Agenda (visual de 28/10/2026) o formulário vem
 * aberto, com um título; solto na página, segue recolhido num <details>.
 */
function Moldura({ titulo, aberto, children }: { titulo: string; aberto: boolean; children: React.ReactNode }) {
  if (aberto) {
    return (
      <section className="rounded-2xl bg-elevado/50 p-4">
        <h3 className="font-medium text-titulo">{titulo}</h3>
        {children}
      </section>
    );
  }
  return (
    <details className="cartao p-5">
      <summary className="min-h-11 cursor-pointer font-medium text-titulo">{titulo}</summary>
      {children}
    </details>
  );
}

function CamposDoHorario({ dia }: { dia: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <label className="text-fluid-xs col-span-3 text-apoio sm:col-span-1">
        Dia
        <input type="date" name="dia" defaultValue={dia} required className={CAMPO} />
      </label>
      <label className="text-fluid-xs text-apoio">
        Das
        <input type="time" name="das" defaultValue="09:00" step={900} required className={CAMPO} />
      </label>
      <label className="text-fluid-xs text-apoio">
        Até
        <input type="time" name="ate" defaultValue="10:00" step={900} required className={CAMPO} />
      </label>
    </div>
  );
}

/** "Bloquear horário": médico, folga. A assistente deixa de oferecer o horário. */
export function BloquearHorario({ dia, aberto = false }: { dia: string; aberto?: boolean }) {
  const [estado, enviar, enviando] = useActionState(bloquearHorario, null);
  return (
    <Moldura titulo="Bloquear horário" aberto={aberto}>
      <form action={enviar} className="mt-3 space-y-3">
        <CamposDoHorario dia={dia} />
        <label className="text-fluid-xs block text-apoio">
          Motivo (só você vê)
          <input name="motivo" maxLength={120} placeholder="Médico, folga…" className={CAMPO} />
        </label>
        <button type="submit" disabled={enviando} className="botao-solido min-h-11 px-4 text-sm">
          {enviando ? "Bloqueando…" : "Bloquear"}
        </button>
      </form>
      <Retorno estado={estado} />
    </Moldura>
  );
}

/** "Marcar reunião", só para o gestor: a equipe toda ou algumas pessoas. */
export function MarcarReuniao({
  dia,
  equipe,
  aberto = false,
}: {
  dia: string;
  equipe: { id: string; nome: string }[];
  aberto?: boolean;
}) {
  const [estado, enviar, enviando] = useActionState(marcarReuniao, null);
  const [quem, setQuem] = useState<"equipe" | "alguns">("equipe");
  return (
    <Moldura titulo="Marcar reunião" aberto={aberto}>
      <form action={enviar} className="mt-3 space-y-3">
        <label className="text-fluid-xs block text-apoio">
          Assunto
          <input name="titulo" maxLength={120} placeholder="Reunião de metas" className={CAMPO} />
        </label>
        <CamposDoHorario dia={dia} />
        <fieldset className="space-y-2">
          <legend className="text-fluid-xs text-apoio">Quem participa</legend>
          <label className="text-fluid-sm flex min-h-11 items-center gap-2 text-corpo">
            <input type="radio" name="quem" value="equipe" checked={quem === "equipe"} onChange={() => setQuem("equipe")} />
            Equipe toda
          </label>
          <label className="text-fluid-sm flex min-h-11 items-center gap-2 text-corpo">
            <input type="radio" name="quem" value="alguns" checked={quem === "alguns"} onChange={() => setQuem("alguns")} />
            Algumas pessoas
          </label>
          {quem === "alguns" && (
            <div className="grid grid-cols-1 gap-1 pl-6 sm:grid-cols-2">
              {equipe.map((c) => (
                <label key={c.id} className="text-fluid-sm flex min-h-11 items-center gap-2 text-corpo">
                  <input type="checkbox" name="participantes" value={c.id} />
                  {c.nome}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <button type="submit" disabled={enviando} className="botao-solido min-h-11 px-4 text-sm">
          {enviando ? "Marcando…" : "Marcar e avisar"}
        </button>
      </form>
      <Retorno estado={estado} />
    </Moldura>
  );
}

export function CancelarCompromisso({ id, rotulo = "Cancelar" }: { id: string; rotulo?: string }) {
  const [estado, enviar, enviando] = useActionState(cancelarDoFormulario, null);
  return (
    <form action={enviar}>
      <input type="hidden" name="compromisso" value={id} />
      <button type="submit" disabled={enviando} className="botao-secundario min-h-11 px-3 text-sm">
        {enviando ? "Cancelando…" : rotulo}
      </button>
      <Retorno estado={estado} />
    </form>
  );
}
