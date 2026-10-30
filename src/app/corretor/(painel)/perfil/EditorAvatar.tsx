"use client";

import Image from "next/image";
import { enviarMidiaCorretor } from "@/app/corretor/actions";
import { iniciais } from "@/lib/format";
import { SeletorArquivo } from "./SeletorArquivo";
import { REDUCAO_DA_LOGO } from "@/lib/imagem/reduzir";

export function EditorAvatar({ nome, fotoUrl }: { nome: string; fotoUrl: string | null }) {
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        {fotoUrl ? (
          <Image
            src={fotoUrl}
            alt=""
            width={72}
            height={72}
            className="ring-acento-linha h-18 w-18 rounded-full object-cover ring-2"
          />
        ) : (
          <span
            aria-hidden
            className="font-display ring-acento-linha flex h-18 w-18 items-center justify-center rounded-full bg-gradient-to-tr from-brand-600 via-brand-500 to-azure-500 text-xl font-bold text-white ring-2"
          >
            {iniciais(nome)}
          </span>
        )}
        <span
          title="Conta Ativa"
          className="ring-superficie absolute right-0 bottom-0 h-4.5 w-4.5 rounded-full bg-[#25D366] ring-2"
        />
      </div>

      <SeletorArquivo
        action={enviarMidiaCorretor.bind(null, "avatar")}
        accept="image/jpeg,image/png,image/webp"
        rotulo="Trocar foto"
        dica="JPG, PNG ou WebP. Fotos grandes são reduzidas sozinhas."
        reducao={REDUCAO_DA_LOGO}
      />
    </div>
  );
}
