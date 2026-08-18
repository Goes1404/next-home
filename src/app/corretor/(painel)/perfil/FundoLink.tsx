"use client";

import { useState } from "react";
import { enviarMidiaCorretor } from "@/app/corretor/actions";
import type { FundoTipo } from "@/lib/types";
import { SeletorArquivo } from "./SeletorArquivo";

const BOTAO_BASE = "text-fluid-sm rounded-full px-4 py-2 font-medium transition-colors";
const BOTAO_ATIVO = "bg-brand-500 text-white";
const BOTAO_INATIVO = "border border-white/15 text-mist-300 hover:border-white/30";

export function FundoLink({ fundoTipo }: { fundoTipo: FundoTipo }) {
  const [tipo, setTipo] = useState<FundoTipo>(fundoTipo);

  return (
    <div>
      <p className="font-display text-mist-50">Fundo do seu link</p>
      <p className="text-fluid-sm mt-1 mb-4 text-mist-400">
        O que aparece atrás do site pra quem entra pelo seu link pessoal.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTipo("video")}
          className={`${BOTAO_BASE} ${tipo === "video" ? BOTAO_ATIVO : BOTAO_INATIVO}`}
        >
          Vídeo
        </button>
        <button
          type="button"
          onClick={() => setTipo("foto")}
          className={`${BOTAO_BASE} ${tipo === "foto" ? BOTAO_ATIVO : BOTAO_INATIVO}`}
        >
          Foto
        </button>
      </div>

      <div className="mt-4">
        {tipo === "video" ? (
          <SeletorArquivo
            action={enviarMidiaCorretor.bind(null, "fundo_video")}
            accept="video/mp4"
            rotulo="Trocar vídeo"
            dica="Vídeo até 20MB (MP4)."
          />
        ) : (
          <SeletorArquivo
            action={enviarMidiaCorretor.bind(null, "fundo_foto")}
            accept="image/jpeg,image/png,image/webp"
            rotulo="Trocar foto de fundo"
            dica="Imagem até 5MB (JPG, PNG ou WebP)."
          />
        )}
      </div>
    </div>
  );
}
