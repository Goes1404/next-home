"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import type { Midia } from "@/lib/types";
import {
  uploadFotoOuPlanta,
  removerMidiaImovel,
  definirFotoComoCapa,
  definirTipoDaMidia,
} from "../actions";
import { Check } from 'lucide-react';

interface Props {
  empreendimentoId: string;
  slug: string;
  midiasIniciais: Midia[];
}

export function EditorFotos({ empreendimentoId, slug, midiasIniciais }: Props) {
  const [midias, setMidias] = useState<Midia[]>(midiasIniciais);
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState<React.ReactNode | null>(null);
  // Qual cartão está esperando o servidor — trava os botões dele e só dele.
  const [ocupado, setOcupado] = useState<string | null>(null);
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
            // Sem o id, a foto recém-enviada não podia ser removida nem
            // marcada como planta até alguém recarregar a página.
            id: res.midia.id ?? undefined,
            tipo: res.midia.tipo,
            url: res.midia.url,
            alt: res.midia.alt,
            // null = o sharp não conseguiu medir (o pior caso documentado é
            // foto sem medida); 0 mantém o contrato de Midia sem inventar.
            largura: res.midia.largura ?? 0,
            altura: res.midia.altura ?? 0,
            blurDataUrl: res.midia.blur_data_url,
          };
          setMidias((prev) => [...prev, nova]);
        }
      }
      setMensagem(<><Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> Foto(s) adicionada(s) com sucesso!</>);
      setTimeout(() => setMensagem(null), 4000);
    } catch (err) {
      console.error(err);
      setMensagem(<>❌ Erro ao enviar foto. Tente novamente.</>);
    } finally {
      setEnviando(false);
      if (inputUploadRef.current) inputUploadRef.current.value = "";
    }
  };

  const avisar = (texto: React.ReactNode, ms = 3000) => {
    setMensagem(texto);
    setTimeout(() => setMensagem(null), ms);
  };

  const handleDefinirCapa = async (midia: Midia) => {
    // A versão anterior só reordenava a TELA e anunciava "Capa atualizada" —
    // a action existia, era importada, e ninguém a chamava. No reload a capa
    // antiga voltava. Primeiro o servidor confirma, depois a tela obedece.
    if (!midia.id) {
      avisar(<>Recarregue a página antes de trocar a capa desta foto.</>, 4000);
      return;
    }
    setOcupado(midia.url);
    const res = await definirFotoComoCapa(empreendimentoId, midia.id, slug).catch(() => ({
      ok: false as const,
      erro: "Sem resposta do servidor. Tente de novo.",
    }));
    setOcupado(null);
    if (!res.ok) {
      avisar(<>{res.erro ?? "Não foi possível definir a capa agora."}</>, 4000);
      return;
    }
    setMidias((prev) => [midia, ...prev.filter((m) => m.url !== midia.url)]);
    avisar(<><Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> Capa principal atualizada!</>);
  };

  const handleTrocarTipo = async (midia: Midia) => {
    const novoTipo = midia.tipo === "planta" ? "foto" : "planta";
    if (!midia.id) {
      avisar(<>Recarregue a página antes de mudar esta imagem.</>, 4000);
      return;
    }
    setOcupado(midia.url);
    const res = await definirTipoDaMidia(midia.id, novoTipo, slug).catch(() => ({
      ok: false as const,
      erro: "Sem resposta do servidor. Tente de novo.",
    }));
    setOcupado(null);
    if (!res.ok) {
      avisar(<>{res.erro ?? "Não foi possível mudar o tipo da imagem agora."}</>, 4000);
      return;
    }
    setMidias((prev) => prev.map((m) => (m.url === midia.url ? { ...m, tipo: novoTipo } : m)));
    avisar(
      novoTipo === "planta" ? (
        <><Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> Marcada como planta — a assistente já pode mandá-la.</>
      ) : (
        <><Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> Voltou a ser foto da galeria.</>
      ),
      4000,
    );
  };

  const handleRemover = async (midia: Midia) => {
    if (!confirm("Tem certeza que deseja remover esta foto?")) return;

    // A versão anterior só removia do ESTADO e anunciava "Foto removida!" —
    // a foto continuava no banco e ressuscitava no reload. Primeiro o
    // servidor confirma, depois a tela obedece.
    const res = await removerMidiaImovel(midia.id ?? "", midia.url, slug);
    if (!res.ok) {
      setMensagem(<>Não foi possível remover agora. Tente novamente.</>);
      setTimeout(() => setMensagem(null), 4000);
      return;
    }

    setMidias((prev) => prev.filter((m) => m.url !== midia.url));
    setMensagem(<><Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> Foto removida!</>);
    setTimeout(() => setMensagem(null), 3000);
  };

  // Vídeo e tour 360° são link de terceiro e têm aba própria; aqui só entra
  // o que é imagem. A capa é a primeira FOTO — planta nunca é capa, é o que
  // o mapper faz na vitrine (`capa: fotos[0]`), e a tela tem de dizer o mesmo.
  const imagens = midias.filter((m) => m.tipo === "foto" || m.tipo === "planta");
  const urlDaCapa = imagens.find((m) => m.tipo === "foto")?.url ?? null;
  const totalPlantas = imagens.filter((m) => m.tipo === "planta").length;

  return (
    <div className="space-y-6">
      {mensagem && (
        <div className="p-3.5 rounded-2xl bg-ok-lavado border border-ok-linha text-ok text-fluid-xs font-bold">
          {mensagem}
        </div>
      )}

      {/* Botões de Ação para Celular */}
      <div className="cartao flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5">
        <div>
          <h3 className="text-fluid-base font-bold text-titulo">Galeria de Fotos do Imóvel</h3>
          <p className="text-fluid-xs text-apoio mt-0.5">
            A 1ª foto é a <strong>Capa Principal</strong> na vitrine e nos cards do WhatsApp.
          </p>
          <p className="text-fluid-xs text-apoio mt-1 break-words">
            Veio uma planta no meio das fotos? Toque em <strong>É planta</strong> — é assim que a
            assistente consegue mandá-la quando o cliente pedir.
            {totalPlantas > 0 && (
              <> Hoje: {totalPlantas} {totalPlantas === 1 ? "planta" : "plantas"}.</>
            )}
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
            className="w-full sm:w-auto min-h-[48px] px-5 py-2.5 rounded-xl bg-acento hover:bg-acento-hover text-sobre-cor text-fluid-xs font-bold transition-all shadow-md shadow-acento/20 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            {enviando ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-linha-forte border-t-white animate-spin" />
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
      {imagens.length === 0 ? (
        <div className="p-12 text-center rounded-3xl border border-dashed border-linha-forte bg-elevado space-y-3">
          <span className="text-4xl block">🖼️</span>
          <h4 className="text-fluid-base font-bold text-corpo">Nenhuma foto cadastrada</h4>
          <p className="text-fluid-xs text-tenue max-w-sm mx-auto">
            Toque no botão acima para tirar fotos do imóvel no stand ou selecionar fotos da sua galeria.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {imagens.map((midia) => {
            const ehCapa = midia.url === urlDaCapa;
            const ehPlanta = midia.tipo === "planta";
            const travado = ocupado === midia.url;
            return (
              <div
                key={midia.url}
                className={`group relative rounded-2xl overflow-hidden border transition-all ${
                  ehCapa
                    ? "border-acento ring-acento ring-2"
                    : "border-linha hover:border-linha-forte"
                }`}
              >
                {/* Imagem */}
                <div className="aspect-[4/3] relative bg-campo">
                  <Image
                    src={midia.url}
                    alt={midia.alt || (ehPlanta ? "Planta do imóvel" : "Foto do imóvel")}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-cover"
                  />

                  {ehPlanta && (
                    <span className="absolute top-2 left-2 px-2.5 py-1 rounded-lg bg-realce text-sobre-cor text-[11px] font-bold shadow-md">
                      Planta
                    </span>
                  )}

                  {/* Badge de Capa */}
                  {ehCapa && (
                    <span className="absolute top-2 left-2 px-2.5 py-1 rounded-lg bg-acento text-sobre-cor text-[10px] font-bold shadow-md flex items-center gap-1">
                      ⭐ Capa Principal
                    </span>
                  )}
                </div>

                {/* Ações Rápidas de 1 Toque — quebram linha no cartão estreito do celular */}
                <div className="p-2 bg-superficie flex flex-wrap items-center gap-1.5">
                  {ehCapa ? (
                    <span className="text-[11px] text-acento-suave font-bold px-2 py-1">
                      Foto Destaque
                    </span>
                  ) : !ehPlanta ? (
                    <button
                      type="button"
                      disabled={travado}
                      onClick={() => handleDefinirCapa(midia)}
                      className="min-h-11 px-2.5 rounded-lg bg-vidro hover:bg-acento hover:text-sobre-cor text-corpo text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Definir Capa
                    </button>
                  ) : null}

                  <button
                    type="button"
                    disabled={travado}
                    aria-pressed={ehPlanta}
                    onClick={() => handleTrocarTipo(midia)}
                    title={ehPlanta ? "Voltar a ser foto da galeria" : "Marcar esta imagem como planta"}
                    className={`min-h-11 px-2.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                      ehPlanta
                        ? "bg-realce text-sobre-cor hover:opacity-90"
                        : "bg-vidro hover:bg-vidro-forte text-corpo"
                    }`}
                  >
                    {travado ? "Salvando…" : ehPlanta ? "É foto" : "É planta"}
                  </button>

                  <button
                    type="button"
                    disabled={travado}
                    onClick={() => handleRemover(midia)}
                    title="Excluir Foto"
                    aria-label="Excluir imagem"
                    className="ml-auto min-h-11 min-w-11 flex items-center justify-center rounded-lg disabled:opacity-50 bg-perigo-lavado hover:bg-perigo text-perigo hover:text-titulo transition-colors cursor-pointer"
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
