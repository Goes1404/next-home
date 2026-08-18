"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { registrarEnvio } from "@/app/corretor/actions";
import { preencherTemplate } from "@/lib/mensagem";
import { linkWhatsappPara } from "@/lib/site";
import { normalizarWhatsapp } from "@/lib/whatsapp";
import type { Lead, TemplateMensagem } from "@/lib/types";

function espera(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/** Espera aleatória de 5 a 15s entre cada aba aberta. */
function proximaEspera(): number {
  return 5000 + Math.random() * 10000;
}

export function EnviarEmMassa({
  leadsSelecionados,
  templates,
  nomeCorretor,
  whatsappCorretor,
  onFechar,
}: {
  leadsSelecionados: Lead[];
  templates: TemplateMensagem[];
  nomeCorretor: string;
  whatsappCorretor: string;
  onFechar: () => void;
}) {
  const [templateId, setTemplateId] = useState(
    templates.find((t) => t.padrao)?.id ?? templates[0]?.id ?? "",
  );
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [concluido, setConcluido] = useState(false);
  const canceladoRef = useRef(false);

  const templateEscolhido = templates.find((t) => t.id === templateId) ?? null;

  const comTelefoneValido = useMemo(
    () => leadsSelecionados.filter((lead) => lead.telefone && normalizarWhatsapp(lead.telefone)),
    [leadsSelecionados],
  );

  const previa = useMemo(() => {
    if (!templateEscolhido || leadsSelecionados.length === 0) return "";
    return preencherTemplate(templateEscolhido.conteudo, {
      nomeLead: leadsSelecionados[0].nome,
      nomeCorretor,
      telefoneCorretor: whatsappCorretor,
    });
  }, [templateEscolhido, leadsSelecionados, nomeCorretor, whatsappCorretor]);

  async function disparar() {
    if (!templateEscolhido) return;
    setEnviando(true);
    canceladoRef.current = false;

    for (const lead of comTelefoneValido) {
      if (canceladoRef.current) break;

      const numero = normalizarWhatsapp(lead.telefone!);
      if (!numero) continue;

      const mensagem = preencherTemplate(templateEscolhido.conteudo, {
        nomeLead: lead.nome,
        nomeCorretor,
        telefoneCorretor: whatsappCorretor,
      });

      window.open(linkWhatsappPara(numero, mensagem), "_blank");
      await registrarEnvio(lead.id, mensagem);
      setProgresso((atual) => atual + 1);

      if (lead !== comTelefoneValido[comTelefoneValido.length - 1]) {
        await espera(proximaEspera());
      }
    }

    setEnviando(false);
    setConcluido(true);
  }

  function fechar() {
    canceladoRef.current = true;
    onFechar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/70 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-t-2xl border border-white/10 bg-ink-900 p-6 sm:rounded-2xl">
        <h2 className="font-display text-lg text-mist-50">
          Enviar mensagem para {leadsSelecionados.length} contato{leadsSelecionados.length === 1 ? "" : "s"}
        </h2>

        {comTelefoneValido.length < leadsSelecionados.length && (
          <p className="text-fluid-xs mt-2 text-sand-300">
            {leadsSelecionados.length - comTelefoneValido.length} sem telefone válido — serão pulados.
          </p>
        )}

        {templates.length === 0 ? (
          <p className="text-fluid-sm mt-4 text-mist-300">
            Você ainda não tem template.{" "}
            <Link href="/corretor/templates" className="text-brand-200 underline-offset-4 hover:underline">
              Criar um agora
            </Link>
            .
          </p>
        ) : (
          <>
            <label className="text-fluid-xs mt-4 block text-mist-400" htmlFor="template-massa">
              Template
            </label>
            <select
              id="template-massa"
              value={templateId}
              disabled={enviando}
              onChange={(e) => setTemplateId(e.target.value)}
              className="text-fluid-sm mt-1 w-full rounded-lg border border-white/15 bg-ink-950 px-3 py-2 text-mist-100"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.titulo}
                </option>
              ))}
            </select>

            {previa && (
              <p className="text-fluid-sm mt-3 rounded-xl border border-white/5 bg-ink-950/50 px-4 py-3 whitespace-pre-line text-mist-200">
                {previa}
              </p>
            )}

            {!enviando && !concluido && (
              <p className="text-fluid-xs mt-3 text-mist-500">
                Seu navegador pode pedir permissão pra abrir múltiplas janelas — permita para o envio
                continuar.
              </p>
            )}

            {(enviando || concluido) && (
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-ink-950">
                  <div
                    className="h-full bg-brand-500 transition-all"
                    style={{ width: `${(progresso / comTelefoneValido.length) * 100}%` }}
                  />
                </div>
                <p className="text-fluid-xs mt-2 text-mist-400">
                  {concluido
                    ? `Enviado para ${progresso} de ${comTelefoneValido.length}.`
                    : `${progresso} de ${comTelefoneValido.length}...`}
                </p>
              </div>
            )}

            <div className="mt-5 flex gap-2">
              {!enviando && !concluido && (
                <button
                  type="button"
                  disabled={!templateEscolhido || comTelefoneValido.length === 0}
                  onClick={disparar}
                  className="text-fluid-sm rounded-lg bg-brand-500 px-4 py-2 font-medium text-white disabled:opacity-50"
                >
                  Confirmar disparo
                </button>
              )}
              <button
                type="button"
                onClick={fechar}
                className="text-fluid-sm rounded-lg border border-white/15 px-4 py-2 text-mist-300"
              >
                {concluido ? "Fechar" : "Cancelar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
