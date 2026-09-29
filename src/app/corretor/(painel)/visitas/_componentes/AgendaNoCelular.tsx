"use client";

import { useState, useTransition } from "react";
import { CalendarPlus } from "lucide-react";
import { gerarLinkDaAgenda } from "../acoes";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";

/**
 * As visitas no calendário do celular (26/09/2026). O corretor vive no
 * WhatsApp, não no painel: com o feed assinado, a visita que a assistente
 * marcou aparece no Google Agenda ou no iPhone, com aviso uma hora antes.
 */
export function AgendaNoCelular({ link: inicial }: { link: string | null }) {
  const [link, setLink] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pendente, iniciar] = useTransition();

  const gerar = () =>
    iniciar(async () => {
      setErro(null);
      try {
        const r = await gerarLinkDaAgenda();
        if (r.erro) setErro(r.erro);
        else if (r.link) setLink(r.link);
      } catch (e) {
        setErro(ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Sem conexão agora. Tente de novo.");
      }
    });

  const webcal = link?.replace(/^https?:/, "webcal:");
  const google = link ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal!)}` : null;

  return (
    <section className="cartao space-y-3 p-4">
      <h2 className="text-fluid-sm flex items-center gap-2 font-medium text-titulo">
        <CalendarPlus className="h-4 w-4 text-acento" aria-hidden /> Visitas no calendário do celular
      </h2>
      {!link ? (
        <>
          <p className="text-fluid-xs text-apoio">
            Assine uma vez e toda visita marcada — inclusive pela assistente — aparece no seu Google Agenda ou no
            calendário do iPhone, com aviso uma hora antes.
          </p>
          <button
            type="button"
            onClick={gerar}
            disabled={pendente}
            className="min-h-11 rounded-full bg-acento px-5 text-sm font-semibold text-sobre-cor disabled:opacity-60"
          >
            {pendente ? "Gerando…" : "Gerar meu link"}
          </button>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <a href={webcal} className="inline-flex min-h-11 items-center rounded-full bg-acento px-5 text-sm font-semibold text-sobre-cor">
              Assinar no iPhone
            </a>
            <a
              href={google!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-full border border-linha-forte px-5 text-sm font-semibold text-titulo"
            >
              Assinar no Google Agenda
            </a>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2000);
                } catch {
                  setErro("Não consegui copiar. Segure o dedo no link abaixo para copiar.");
                }
              }}
              className="inline-flex min-h-11 items-center rounded-full border border-linha-forte px-5 text-sm text-titulo"
            >
              {copiado ? "Copiado!" : "Copiar link"}
            </button>
          </div>
          <p className="text-fluid-xs break-all text-tenue">{link}</p>
          <p className="text-fluid-xs text-apoio">
            O link mostra nome e telefone dos seus clientes: não compartilhe. Se ele vazar,{" "}
            <button type="button" onClick={gerar} disabled={pendente} className="min-h-11 font-semibold text-acento underline underline-offset-2">
              troque o link
            </button>{" "}
            e assine de novo — o antigo para de funcionar na hora. O Google Agenda atualiza a cada algumas horas.
          </p>
        </>
      )}
      {erro && (
        <p role="alert" className="text-fluid-xs text-perigo">
          {erro}
        </p>
      )}
    </section>
  );
}
