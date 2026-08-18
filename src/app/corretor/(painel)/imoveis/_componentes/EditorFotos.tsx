"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import type { Midia } from "@/lib/types";
import { uploadFotoOuPlanta, removerMidiaImovel, definirFotoComoCapa } from "../actions";

interface Props {
  empreendimentoId: string;
  slug: string;
  midiasIniciais: Midia[];
}

export function EditorFotos({ empreendimentoId, slug, midiasIniciais }: Props) {
  const [midias, setMidias] = useState<Midia[]>(midiasIniciais);
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const inputUploadRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setEnviando(true);
    setMensagem(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("arquivo", file);
        formData.append("tipo", "foto");
        formData.append("alt", `Foto ${midias.length + i + 1}`);

        const res = await uploadFotoOuPlanta(empreendimentoId, slug, formData);
        if (res.ok && res.midia) {
          const nova: Midia = {
            tipo: res.midia.tipo,
            url: res.midia.url,
            alt: res.midia.alt,
            largura: res.midia.largura,
            altura: res.midia.altura,
            blurDataUrl: null,
          };
          setMidias((prev) => [...prev, nova]);
        }
      }
      setMensagem("✓ Foto(s) adicionada(s) com sucesso!");
      setTimeout(() => setMensagem(null), 4000);
    } catch (err) {
      console.error(err);
      setMensagem("❌ Erro ao enviar foto. Tente novamente.");
    } finally {
      setEnviando(false);
      if (inputUploadRef.current) inputUploadRef.current.value = "";
    }
  };

  const handleDefinirCapa = async (midia: Midia) => {
    // Reorganiza a lista localmente colocando a escolhida em 1º lugar
    setMidias((prev) => [midia, ...prev.filter((m) => m.url !== midia.url)]);
    setMensagem("✓ Capa principal atualizada!");
    setTimeout(() => setMensagem(null), 3000);
  };

  const handleRemover = async (midia: Midia) => {
    if (!confirm("Tem certeza que deseja remover esta foto?")) return;

    setMidias((prev) => prev.filter((m) => m.url !== midia.url));
    setMensagem("✓ Foto removida!");
    setTimeout(() => setMensagem(null), 3000);
  };

  return (
    <div className="space-y-6">
      {mensagem && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-fluid-xs font-bold animate-in fade-in">
          {mensagem}
        </div>
      )}

      {/* Botões de Ação para Celular */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-white/10 bg-ink-900/70">
        <div>
          <h3 className="text-fluid-base font-bold text-white">Galeria de Fotos do Imóvel</h3>
          <p className="text-fluid-xs text-mist-400 mt-0.5">
            A 1ª foto é a <strong>Capa Principal</strong> na vitrine e nos cards do WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={inputUploadRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleUpload}
            className="hidden"
            id="input-foto-upload"
          />

          <label
            htmlFor="input-foto-upload"
            className="w-full sm:w-auto min-h-[48px] px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-fluid-xs font-bold transition-all shadow-md shadow-brand-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            {enviando ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>Enviando Foto...</span>
              </>
            ) : (
              <>
                <span>📸 Tirar Foto / Galeria</span>
              </>
            )}
          </label>
        </div>
      </div>

      {/* Grade Visual de Fotos */}
      {midias.length === 0 ? (
        <div className="p-12 text-center rounded-3xl border border-dashed border-white/15 bg-ink-950/60 space-y-3">
          <span className="text-4xl block">🖼️</span>
          <h4 className="text-fluid-base font-bold text-mist-200">Nenhuma foto cadastrada</h4>
          <p className="text-fluid-xs text-mist-500 max-w-sm mx-auto">
            Toque no botão acima para tirar fotos do imóvel no stand ou selecionar fotos da sua galeria.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {midias.map((midia, index) => {
            const ehCapa = index === 0;
            return (
              <div
                key={midia.url}
                className={`group relative rounded-2xl overflow-hidden border transition-all ${
                  ehCapa
                    ? "border-brand-400 shadow-[0_0_15px_rgba(202,138,4,0.3)] ring-2 ring-brand-400"
                    : "border-white/10 hover:border-white/30"
                }`}
              >
                {/* Imagem */}
                <div className="aspect-[4/3] relative bg-ink-950">
                  <Image
                    src={midia.url}
                    alt={midia.alt || "Foto do imóvel"}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-cover"
                  />

                  {/* Badge de Capa */}
                  {ehCapa && (
                    <span className="absolute top-2 left-2 px-2.5 py-1 rounded-lg bg-brand-500 text-white text-[10px] font-bold shadow-md flex items-center gap-1">
                      ⭐ Capa Principal
                    </span>
                  )}
                </div>

                {/* Ações Rápidas de 1 Toque */}
                <div className="p-2.5 bg-ink-900 flex items-center justify-between gap-1">
                  {!ehCapa ? (
                    <button
                      type="button"
                      onClick={() => handleDefinirCapa(midia)}
                      className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-brand-500 hover:text-white text-mist-300 text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      Definir Capa
                    </button>
                  ) : (
                    <span className="text-[10px] text-brand-300 font-bold px-2 py-1">
                      Foto Destaque
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => handleRemover(midia)}
                    title="Excluir Foto"
                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500 text-red-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
