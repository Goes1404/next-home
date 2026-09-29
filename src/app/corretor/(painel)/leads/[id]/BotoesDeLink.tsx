"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { PERFIL_DE_DOCUMENTO_LABEL, PERFIS_DE_DOCUMENTO, IMOVEIS_NA_SELECAO, type PerfilDeDocumento } from "@/lib/crm/linksDoCliente";
import { VALIDADES_DA_PROPOSTA } from "@/lib/crm/proposta";
import {
  criarLinkDeDocumentos,
  criarPortal,
  criarProposta,
  criarSelecao,
  sugerirSelecao,
  type CandidatoDaSelecao,
  type LinkCriado,
} from "./linksAcoes";

/**
 * Os dois botões do cartão "Links para o cliente". Criado o link, a tela
 * oferece as duas saídas que o corretor usa: mandar pelo WhatsApp do
 * cliente com a mensagem pronta, ou copiar.
 *
 * A seleção passa por uma escolha antes do link: a sugestão chega marcada, e
 * o corretor troca o que quiser. Os documentos pedem o perfil (CLT,
 * autônomo, casal), porque a lista muda com ele.
 */
export function BotoesDeLink({
  leadId,
  telefone,
  imovelDoLead = null,
}: {
  leadId: string;
  telefone: string | null;
  /** O imóvel de interesse do lead, para a proposta nascer preenchida. */
  imovelDoLead?: { id: string; nome: string } | null;
}) {
  const [criado, setCriado] = useState<{ url: string; mensagem: string } | null>(null);
  const [escolha, setEscolha] = useState<{ candidatos: CandidatoDaSelecao[]; marcados: string[] } | null>(null);
  const [perfil, setPerfil] = useState<PerfilDeDocumento>("clt");
  const [proposta, setProposta] = useState<{
    imovel: string;
    unidade: string;
    valor: string;
    condicao: string;
    validadeDias: number;
  } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  function criar(fn: () => Promise<LinkCriado>) {
    iniciar(async () => {
      try {
        const r = await fn();
        if ("erro" in r) return falhar(r.erro);
        setCriado(r);
        setEscolha(null);
      } catch (err) {
        falhar(ehActionDeOutroBuild(err) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.");
      }
    });
  }

  function abrirEscolha() {
    setCriado(null);
    iniciar(async () => {
      try {
        const r = await sugerirSelecao(leadId);
        if ("erro" in r) return falhar(r.erro);
        setEscolha(r);
      } catch (err) {
        falhar(ehActionDeOutroBuild(err) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.");
      }
    });
  }

  function alternar(id: string) {
    setEscolha((e) => {
      if (!e) return e;
      if (e.marcados.includes(id)) return { ...e, marcados: e.marcados.filter((x) => x !== id) };
      if (e.marcados.length >= IMOVEIS_NA_SELECAO) return e;
      return { ...e, marcados: [...e.marcados, id] };
    });
  }

  async function copiar() {
    if (!criado) return;
    try {
      await navigator.clipboard.writeText(criado.mensagem);
      avisar("Mensagem com o link copiada.");
    } catch {
      falhar("Não consegui copiar — selecione o link e copie à mão.");
    }
  }

  const digitos = telefone?.replace(/\D/g, "") ?? "";
  const wa = criado && digitos ? `https://wa.me/${digitos}?text=${encodeURIComponent(criado.mensagem)}` : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={ocupado}
          onClick={abrirEscolha}
          className="min-h-11 rounded-xl bg-acento hover:bg-acento-hover px-4 text-fluid-xs font-bold text-sobre-cor disabled:opacity-60"
        >
          Montar seleção de imóveis
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Perfil de renda do cliente"
            value={perfil}
            onChange={(e) => setPerfil(e.target.value as PerfilDeDocumento)}
            className="select-seta text-fluid-xs border-linha-forte bg-campo text-titulo min-h-11 rounded-xl border px-3"
          >
            {PERFIS_DE_DOCUMENTO.map((p) => (
              <option key={p} value={p}>
                {PERFIL_DE_DOCUMENTO_LABEL[p]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => criar(() => criarLinkDeDocumentos(leadId, perfil))}
            className="min-h-11 rounded-xl border border-linha-forte px-4 text-fluid-xs font-semibold text-corpo hover:border-acento-linha disabled:opacity-60"
          >
            Pedir documentos
          </button>
        </div>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => {
            setCriado(null);
            setEscolha(null);
            setProposta({ imovel: imovelDoLead?.nome ?? "", unidade: "", valor: "", condicao: "", validadeDias: 7 });
          }}
          className="min-h-11 rounded-xl border border-linha-forte px-4 text-fluid-xs font-semibold text-corpo hover:border-acento-linha disabled:opacity-60"
        >
          Fazer proposta
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => criar(() => criarPortal(leadId))}
          className="min-h-11 rounded-xl border border-linha-forte px-4 text-fluid-xs font-semibold text-corpo hover:border-acento-linha disabled:opacity-60"
        >
          Portal do comprador
        </button>
      </div>

      {proposta && (
        <fieldset className="rounded-xl border border-linha p-3 space-y-2">
          <legend className="px-1 text-fluid-xs font-semibold text-corpo">Proposta para o cliente</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-fluid-xs text-apoio">
              Imóvel
              <input
                value={proposta.imovel}
                onChange={(e) => setProposta({ ...proposta, imovel: e.target.value })}
                className="mt-1 text-fluid-sm border-linha-forte bg-campo text-titulo min-h-11 w-full rounded-xl border px-3"
              />
            </label>
            <label className="text-fluid-xs text-apoio">
              Unidade
              <input
                value={proposta.unidade}
                onChange={(e) => setProposta({ ...proposta, unidade: e.target.value })}
                className="mt-1 text-fluid-sm border-linha-forte bg-campo text-titulo min-h-11 w-full rounded-xl border px-3"
              />
            </label>
            <label className="text-fluid-xs text-apoio">
              Valor total (R$)
              <input
                inputMode="numeric"
                value={proposta.valor.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                onChange={(e) => setProposta({ ...proposta, valor: e.target.value.replace(/\D/g, "") })}
                className="mt-1 text-fluid-sm border-linha-forte bg-campo text-titulo min-h-11 w-full rounded-xl border px-3"
              />
            </label>
            <label className="text-fluid-xs text-apoio">
              Válida por
              <select
                value={proposta.validadeDias}
                onChange={(e) => setProposta({ ...proposta, validadeDias: Number(e.target.value) })}
                className="mt-1 select-seta text-fluid-sm border-linha-forte bg-campo text-titulo min-h-11 w-full rounded-xl border px-3"
              >
                {VALIDADES_DA_PROPOSTA.map((d) => (
                  <option key={d} value={d}>
                    {d} dias
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-fluid-xs text-apoio">
            Condição
            <textarea
              rows={3}
              value={proposta.condicao}
              onChange={(e) => setProposta({ ...proposta, condicao: e.target.value })}
              className="mt-1 text-fluid-sm border-linha-forte bg-campo text-titulo w-full rounded-xl border p-3"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={ocupado}
              onClick={() =>
                criar(async () => {
                  const r = await criarProposta(leadId, {
                    ...proposta,
                    empreendimentoId: imovelDoLead && proposta.imovel === imovelDoLead.nome ? imovelDoLead.id : null,
                    valor: Number(proposta.valor),
                  });
                  if (!("erro" in r)) setProposta(null);
                  return r;
                })
              }
              className="min-h-11 rounded-xl bg-acento hover:bg-acento-hover px-4 text-fluid-xs font-bold text-sobre-cor disabled:opacity-60"
            >
              Gerar link da proposta
            </button>
            <button type="button" onClick={() => setProposta(null)} className="min-h-11 rounded-xl px-3 text-fluid-xs text-apoio">
              Cancelar
            </button>
          </div>
        </fieldset>
      )}

      {escolha && (
        <fieldset className="rounded-xl border border-linha p-3 space-y-2">
          <legend className="px-1 text-fluid-xs font-semibold text-corpo">
            Escolha até {IMOVEIS_NA_SELECAO} imóveis ({escolha.marcados.length} marcados)
          </legend>
          <ul className="space-y-1">
            {escolha.candidatos.map((c) => {
              const marcado = escolha.marcados.includes(c.id);
              const cheio = !marcado && escolha.marcados.length >= IMOVEIS_NA_SELECAO;
              return (
                <li key={c.id}>
                  <label
                    className={`flex min-h-11 items-start gap-3 rounded-lg px-2 py-2 ${cheio ? "opacity-50" : "cursor-pointer hover:bg-vidro-forte"}`}
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      disabled={cheio}
                      onChange={() => alternar(c.id)}
                      className="mt-1 h-4 w-4 accent-acento"
                    />
                    <span className="min-w-0 break-words">
                      <span className="block text-fluid-xs font-semibold text-titulo">{c.nome}</span>
                      <span className="block text-fluid-xs text-apoio">
                        {c.onde}
                        {c.motivos.length > 0 ? ` · ${c.motivos.join(" · ")}` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={ocupado || escolha.marcados.length === 0}
              onClick={() => criar(() => criarSelecao(leadId, escolha.marcados))}
              className="min-h-11 rounded-xl bg-acento hover:bg-acento-hover px-4 text-fluid-xs font-bold text-sobre-cor disabled:opacity-60"
            >
              Gerar link com {escolha.marcados.length} {escolha.marcados.length === 1 ? "imóvel" : "imóveis"}
            </button>
            <button
              type="button"
              onClick={() => setEscolha(null)}
              className="min-h-11 rounded-xl px-3 text-fluid-xs text-apoio"
            >
              Cancelar
            </button>
          </div>
        </fieldset>
      )}

      {criado && (
        <div className="rounded-xl border border-acento-linha bg-acento-lavado p-3 space-y-2">
          <p className="text-fluid-xs text-corpo break-words">{criado.mensagem}</p>
          <div className="flex flex-wrap gap-2">
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-11 inline-flex items-center rounded-xl bg-[#25D366] px-4 text-fluid-xs font-bold text-white"
              >
                Enviar no WhatsApp
              </a>
            )}
            <button
              type="button"
              onClick={copiar}
              className="min-h-11 rounded-xl border border-linha-forte px-4 text-fluid-xs font-semibold text-corpo"
            >
              Copiar
            </button>
            <a
              href={`${criado.url}?previa=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-11 inline-flex items-center rounded-xl px-3 text-fluid-xs text-apoio underline underline-offset-2"
            >
              Ver como o cliente vê
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
