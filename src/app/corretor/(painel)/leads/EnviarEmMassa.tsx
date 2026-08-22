"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { registrarEnvio } from "@/app/corretor/actions";
import { preencherTemplate } from "@/lib/mensagem";
import { linkWhatsappApp } from "@/lib/site";
import { normalizarWhatsapp } from "@/lib/whatsapp";
import type { Lead, TemplateMensagem } from "@/lib/types";
import { CheckCircle2, Send, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  dispararParaLeadsSelecionados,
  previewDisparo,
  type RecorteDisparo,
} from "./acoes";

/**
 * Disparo em massa para os leads selecionados.
 *
 * O caminho principal é AUTOMÁTICO: o servidor enfileira e envia pelo
 * número conectado do corretor, com o espaçamento anti-ban e a cota de
 * aquecimento — nenhuma aba abre, nada precisa ser tocado. A versão
 * anterior abria uma aba de `wa.me` por lead e o corretor apertava
 * "enviar" em cada uma; a tela intermediária do WhatsApp era o gargalo.
 *
 * O modo manual sobrou só como queda para quando não há número pareado, e
 * mesmo assim usando o link que abre a conversa DIRETO no app.
 */

function espera(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/** Espera aleatória de 5 a 15s entre cada conversa aberta (modo manual). */
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
  const [recorte, setRecorte] = useState<RecorteDisparo | null>(null);
  const [resultado, setResultado] = useState<RecorteDisparo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modoManual, setModoManual] = useState(false);
  const [enviandoManual, setEnviandoManual] = useState(false);
  const [progressoManual, setProgressoManual] = useState(0);
  const [pendente, iniciar] = useTransition();
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

  // O recorte da cota antes de confirmar: o modal não pode prometer 19
  // envios hoje quando o número novo só permite 15.
  useEffect(() => {
    let vivo = true;
    previewDisparo(leadsSelecionados.map((l) => l.id)).then((r) => {
      if (!vivo) return;
      if ("erro" in r) setErro(r.erro);
      else setRecorte(r);
    });
    return () => {
      vivo = false;
    };
  }, [leadsSelecionados]);

  function confirmarAutomatico() {
    if (!templateEscolhido) return;
    setErro(null);
    iniciar(async () => {
      const res = await dispararParaLeadsSelecionados({
        leadIds: leadsSelecionados.map((l) => l.id),
        templateId,
      });

      if ("erro" in res) {
        setErro(res.erro);
        if (res.podeManual) setModoManual(true);
        return;
      }
      setResultado(res.recorte);
    });
  }

  /** Queda: abre a conversa direto no app, uma a uma. O envio é manual. */
  async function dispararManual() {
    if (!templateEscolhido) return;
    setEnviandoManual(true);
    canceladoRef.current = false;
    const ehCelular = /Android|iPhone|iPad/i.test(navigator.userAgent);

    for (const lead of comTelefoneValido) {
      if (canceladoRef.current) break;

      const numero = normalizarWhatsapp(lead.telefone!);
      if (!numero) continue;

      const mensagem = preencherTemplate(templateEscolhido.conteudo, {
        nomeLead: lead.nome,
        nomeCorretor,
        telefoneCorretor: whatsappCorretor,
      });

      window.open(linkWhatsappApp(numero, mensagem, ehCelular), "_blank");
      await registrarEnvio(lead.id, mensagem);
      setProgressoManual((atual) => atual + 1);

      if (lead !== comTelefoneValido[comTelefoneValido.length - 1]) {
        await espera(proximaEspera());
      }
    }

    setEnviandoManual(false);
  }

  function fechar() {
    canceladoRef.current = true;
    onFechar();
  }

  const semNumero = recorte?.numeroConectado === null;

  return (
    <div className="fixed inset-0 z-70 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="border-linha bg-superficie pb-safe max-h-[88svh] w-full max-w-lg overflow-y-auto rounded-t-2xl border p-6 sm:rounded-2xl sm:pb-6">
        {/* ----------------------------- RECIBO ----------------------------- */}
        {resultado ? (
          <>
            <h2 className="font-display flex items-center gap-2 text-lg text-titulo">
              <CheckCircle2 className="h-5 w-5 text-ok" /> Disparo criado
            </h2>
            <p className="text-fluid-sm mt-3 text-corpo">
              As mensagens saem sozinhas do seu WhatsApp
              {resultado.numeroConectado ? ` (${resultado.numeroConectado})` : ""}, uma a cada ~1
              minuto. Você não precisa fazer mais nada.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-ok-linha bg-ok-lavado p-3">
                <p className="text-fluid-xs text-apoio">Saem hoje</p>
                <p className="text-fluid-lg font-bold text-ok">{resultado.hoje}</p>
              </div>
              <div className="rounded-xl border border-linha bg-elevado p-3">
                <p className="text-fluid-xs text-apoio">Na fila para os próximos dias</p>
                <p className="text-fluid-lg font-bold text-titulo">{resultado.depois}</p>
              </div>
            </div>

            <p className="text-fluid-xs mt-3 text-tenue">
              Quem responder é atendido na hora pela sua IA — ela qualifica, monta o dossiê e te
              avisa quando o lead esquentar.
            </p>

            <div className="mt-5 flex flex-wrap gap-2 pb-2">
              <Link
                href="/corretor/campanhas"
                className="text-fluid-sm bg-acento flex min-h-11 items-center rounded-lg px-4 font-medium text-white"
              >
                Acompanhar envios
              </Link>
              <button
                type="button"
                onClick={fechar}
                className="text-fluid-sm border-linha-forte text-corpo flex min-h-11 items-center rounded-lg border px-4"
              >
                Fechar
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="font-display text-lg text-titulo">
              Enviar mensagem para {leadsSelecionados.length} contato
              {leadsSelecionados.length === 1 ? "" : "s"}
            </h2>

            {recorte && recorte.semTelefone > 0 && (
              <p className="text-fluid-xs mt-2 text-etapa-areia">
                {recorte.semTelefone} sem telefone válido — serão pulados.
              </p>
            )}

            {templates.length === 0 ? (
              <p className="text-fluid-sm mt-4 text-corpo">
                Você ainda não tem template.{" "}
                <Link
                  href="/corretor/templates"
                  className="text-acento-suave underline-offset-4 hover:underline"
                >
                  Criar um agora
                </Link>
                .
              </p>
            ) : (
              <>
                <label className="text-fluid-xs mt-4 block text-apoio" htmlFor="template-massa">
                  Template
                </label>
                <select
                  id="template-massa"
                  value={templateId}
                  disabled={pendente || enviandoManual}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="text-fluid-sm mt-1 w-full rounded-lg border border-linha-forte bg-campo px-3 py-2 text-titulo"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.titulo}
                    </option>
                  ))}
                </select>

                {previa && (
                  <p className="text-fluid-sm mt-3 rounded-xl border border-linha bg-elevado px-4 py-3 whitespace-pre-line text-corpo">
                    {previa}
                  </p>
                )}

                {/* -------------------- MODO AUTOMÁTICO -------------------- */}
                {!modoManual && recorte && !semNumero && (
                  <div className="mt-4 rounded-xl border border-acento-linha bg-acento-lavado p-4">
                    <p className="text-fluid-sm flex items-center gap-2 font-semibold text-titulo">
                      <ShieldCheck className="h-4 w-4 text-acento-suave" /> Envio automático
                    </p>
                    <p className="text-fluid-xs mt-1.5 text-corpo">
                      <strong className="text-titulo">{recorte.hoje}</strong> saem hoje
                      {recorte.depois > 0 && (
                        <>
                          {" "}
                          e <strong className="text-titulo">{recorte.depois}</strong> nos próximos
                          dias
                        </>
                      )}
                      , direto do seu WhatsApp, com intervalo humanizado entre cada uma.
                    </p>
                    {recorte.depois > 0 && (
                      <p className="text-fluid-xs mt-1.5 text-apoio">
                        Seu número tem {recorte.diasDeNumero} dia
                        {recorte.diasDeNumero === 1 ? "" : "s"} de uso: o limite diário protege
                        contra bloqueio e sobe sozinho conforme ele amadurece. A fila continua
                        andando sem você fazer nada.
                      </p>
                    )}
                  </div>
                )}

                {/* ---------------------- MODO MANUAL ---------------------- */}
                {(modoManual || semNumero) && (
                  <div className="mt-4 rounded-xl border border-alerta-linha bg-alerta-lavado p-4">
                    <p className="text-fluid-sm flex items-center gap-2 font-semibold text-titulo">
                      <TriangleAlert className="h-4 w-4 text-alerta" /> Envio manual
                    </p>
                    <p className="text-fluid-xs mt-1.5 text-corpo">
                      Seu número não está pareado, então abrimos a conversa direto no app, uma a
                      uma — o WhatsApp exige que você aperte enviar em cada mensagem.
                    </p>
                    <Link
                      href="/corretor/whatsapp"
                      className="text-fluid-xs mt-2 inline-block font-medium text-acento-suave underline-offset-4 hover:underline"
                    >
                      Conectar meu número e deixar tudo automático →
                    </Link>
                  </div>
                )}

                {erro && !modoManual && (
                  <p className="text-fluid-xs mt-3 rounded-lg border border-perigo-linha bg-perigo-lavado px-3 py-2 text-perigo">
                    {erro}
                  </p>
                )}

                {enviandoManual && (
                  <div className="mt-4">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-campo">
                      <div
                        className="h-full bg-acento transition-all"
                        style={{ width: `${(progressoManual / comTelefoneValido.length) * 100}%` }}
                      />
                    </div>
                    <p className="text-fluid-xs mt-2 text-apoio">
                      {progressoManual} de {comTelefoneValido.length} abertos...
                    </p>
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-2 pb-2">
                  {!enviandoManual && (
                    <button
                      type="button"
                      disabled={!templateEscolhido || pendente || comTelefoneValido.length === 0}
                      onClick={modoManual || semNumero ? dispararManual : confirmarAutomatico}
                      className="text-fluid-sm bg-acento flex min-h-11 items-center gap-2 rounded-lg px-4 font-medium text-white disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" />
                      {pendente
                        ? "Criando disparo..."
                        : modoManual || semNumero
                          ? "Abrir conversas"
                          : "Confirmar disparo"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={fechar}
                    className="text-fluid-sm border-linha-forte text-corpo flex min-h-11 items-center rounded-lg border px-4"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
