"use client";

import { useState } from "react";
import Image from "next/image";
import type { Tipologia } from "@/lib/types";
import { Ruler, ImagePlus, Trash2 } from "lucide-react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { uploadFotoOuPlanta } from "../actions";

interface Props {
  empreendimentoId: string;
  slug: string;
  tipologias: Tipologia[];
  onAdicionar: () => void;
  onRemover: (index: number) => void;
  /*
   * O valor é o do PRÓPRIO campo, não `any`: com `K extends keyof
   * Tipologia`, passar um texto onde a tipologia espera número passa a ser
   * erro de compilação em vez de defeito em produção.
   */
  onChange: <K extends keyof Tipologia>(index: number, campo: K, valor: Tipologia[K]) => void;
}

/**
 * Editor das plantas do empreendimento.
 *
 * O vocabulário da tela é PLANTA — "tipologia" é palavra de quem construiu o
 * banco, e o corretor chama de planta o que ele manda para o cliente. Os
 * identificadores de código seguem `Tipologia` porque é o nome da tabela;
 * trocar os dois de uma vez seria migration, não texto de tela.
 *
 * A imagem da planta entra por UPLOAD, não só por URL colada. Era esse o
 * buraco: o campo pedia um endereço `https://…`, e quem tem o arquivo no
 * celular não tem endereço nenhum para colar — o que fazia a planta
 * simplesmente não ser cadastrada. Ela sobe por `uploadFotoOuPlanta` com
 * `tipo: "planta"`, então entra em `midias` pelo MESMO caminho das outras
 * (medida real, blur, dedup por hash) e passa a ser anexo que a assistente
 * pode mandar — o guardrail só libera o que está no catálogo.
 */
export function EditorTipologias({
  empreendimentoId,
  slug,
  tipologias,
  onAdicionar,
  onRemover,
  onChange,
}: Props) {
  const [enviando, setEnviando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const enviarImagem = async (index: number, arquivo: File) => {
    setErro(null);
    setEnviando(index);

    const formData = new FormData();
    formData.append("arquivo", arquivo);
    formData.append("tipo", "planta");
    formData.append("alt", `Planta ${tipologias[index]?.nome?.trim() || `opção ${index + 1}`}`);

    try {
      const res = await uploadFotoOuPlanta(empreendimentoId, slug, formData);
      if (res.ok && res.midia) {
        onChange(index, "plantaUrl", res.midia.url);
      } else {
        setErro(res.erro ?? "Não consegui enviar a imagem. Tente de novo.");
      }
    } catch (e) {
      // Rede caída e aba aberta antes do último deploy REJEITAM a promessa,
      // e sem este ramo a tela destravaria calada — parecendo que deu certo.
      setErro(ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.");
    } finally {
      setEnviando(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-5 sm:p-6 rounded-3xl border border-linha bg-superficie backdrop-blur space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-linha pb-4">
          <div className="min-w-0">
            <h3 className="text-fluid-base font-bold text-titulo">
              <Ruler className="inline-block w-5 h-5 align-text-bottom mr-1" /> Plantas &amp; Metragens Disponíveis
            </h3>
            <p className="text-fluid-xs text-apoio mt-0.5">
              Cadastre as plantas do empreendimento (ex: 82m², 115m², 140m²). É daqui que a assistente tira
              dormitórios e metragem para responder ao cliente.
            </p>
          </div>

          <button
            type="button"
            onClick={onAdicionar}
            className="min-h-[48px] px-5 py-2 rounded-xl bg-acento hover:bg-acento-hover text-sobre-cor text-fluid-xs font-bold transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 shrink-0"
          >
            <span>+ Adicionar Nova Planta</span>
          </button>
        </div>

        {erro ? (
          <p role="alert" className="text-fluid-xs text-perigo">
            {erro}
          </p>
        ) : null}

        {tipologias.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-linha-forte bg-elevado space-y-2">
            <span className="text-3xl block">
              <Ruler className="inline-block w-5 h-5 align-text-bottom mr-1" />
            </span>
            <p className="text-fluid-xs text-apoio">
              Nenhuma planta cadastrada. Toque no botão acima para adicionar a primeira opção de metragem.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {tipologias.map((tip, index) => (
              <div
                key={tip.id || index}
                className="p-4 sm:p-5 rounded-2xl border border-linha bg-fundo/80 space-y-4 relative"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-fluid-xs font-bold text-acento-suave">
                    Planta {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemover(index)}
                    className="shrink-0 text-perigo hover:text-perigo text-fluid-xs font-semibold px-2.5 py-1 rounded-lg bg-perigo-lavado hover:opacity-85 cursor-pointer"
                  >
                    Excluir
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-apoio uppercase">Nome / Metragem</label>
                    <input
                      type="text"
                      value={tip.nome}
                      onChange={(e) => onChange(index, "nome", e.target.value)}
                      placeholder="Ex: 140m² — 3 Suítes"
                      className="min-h-[44px] w-full rounded-xl border border-linha-forte bg-superficie px-3 text-fluid-xs text-titulo focus:border-acento focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-apoio uppercase">Dormitórios / Suítes</label>
                    <input
                      type="number"
                      value={tip.suites}
                      onChange={(e) => onChange(index, "suites", Number(e.target.value))}
                      placeholder="3"
                      className="min-h-[44px] w-full rounded-xl border border-linha-forte bg-superficie px-3 text-fluid-xs text-titulo focus:border-acento focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-apoio uppercase">Vagas de Garagem</label>
                    <input
                      type="number"
                      value={tip.vagas}
                      onChange={(e) => onChange(index, "vagas", Number(e.target.value))}
                      placeholder="2"
                      className="min-h-[44px] w-full rounded-xl border border-linha-forte bg-superficie px-3 text-fluid-xs text-titulo focus:border-acento focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-apoio uppercase">Preço Desta Planta (R$)</label>
                    <input
                      type="number"
                      value={tip.preco ?? ""}
                      onChange={(e) => onChange(index, "preco", e.target.value ? Number(e.target.value) : null)}
                      placeholder="1850000"
                      className="min-h-[44px] w-full rounded-xl border border-linha-forte bg-superficie px-3 text-fluid-xs text-titulo focus:border-acento focus:outline-none font-mono"
                    />
                  </div>

                  <div className="sm:col-span-4 space-y-2">
                    <label className="text-[11px] font-bold text-apoio uppercase">Imagem Desta Planta</label>

                    {tip.plantaUrl ? (
                      <div className="flex items-center gap-3">
                        <span className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-linha bg-elevado">
                          <Image
                            src={tip.plantaUrl}
                            alt={`Planta ${tip.nome || index + 1}`}
                            fill
                            sizes="80px"
                            className="object-contain"
                            unoptimized
                          />
                        </span>
                        <div className="flex min-w-0 flex-wrap gap-2">
                          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-linha-forte bg-superficie px-3 text-fluid-xs font-semibold text-corpo">
                            <ImagePlus className="h-4 w-4" />
                            <span>{enviando === index ? "Enviando…" : "Trocar imagem"}</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={enviando !== null}
                              onChange={(e) => {
                                const arquivo = e.target.files?.[0];
                                e.target.value = "";
                                if (arquivo) void enviarImagem(index, arquivo);
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => onChange(index, "plantaUrl", null)}
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-perigo-lavado px-3 text-fluid-xs font-semibold text-perigo"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span>Tirar daqui</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-linha-forte bg-elevado px-3 py-2 text-fluid-xs font-semibold text-corpo">
                        <ImagePlus className="h-4 w-4" />
                        <span>{enviando === index ? "Enviando…" : "Enviar imagem da planta"}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={enviando !== null}
                          onChange={(e) => {
                            const arquivo = e.target.files?.[0];
                            e.target.value = "";
                            if (arquivo) void enviarImagem(index, arquivo);
                          }}
                        />
                      </label>
                    )}

                    <input
                      type="text"
                      value={tip.plantaUrl ?? ""}
                      onChange={(e) => onChange(index, "plantaUrl", e.target.value || null)}
                      placeholder="ou cole um link https://…"
                      className="min-h-[44px] w-full rounded-xl border border-linha-forte bg-superficie px-3 text-fluid-xs text-titulo focus:border-acento focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
