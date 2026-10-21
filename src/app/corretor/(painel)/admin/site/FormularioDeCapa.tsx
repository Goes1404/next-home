"use client";

import { EnviarImagem } from "@/components/grupos/EnviarImagem";
import { REDUCAO_DA_CAPA } from "@/lib/imagem/reduzir";

type Resultado = { ok: true; url: string | null } | { ok: false; erro: string };

/**
 * A foto de capa do topo da home (0209): JPG, PNG ou WebP. Escolher já envia;
 * foto grande é reduzida no navegador antes (lado maior 2400 px, até 4 MB).
 */
export function FormularioDeCapa({
  capaAtual,
  enviar,
  remover,
}: {
  capaAtual: string | null;
  enviar: (dados: FormData) => Promise<Resultado>;
  remover: () => Promise<Resultado>;
}) {
  return (
    <EnviarImagem
      imagemAtual={capaAtual}
      nomeDoCampo="capa"
      reducao={REDUCAO_DA_CAPA}
      alt="Foto de capa do site"
      vazio="Sem capa: o topo da home usa o fundo padrão"
      ajuda="JPG, PNG ou WebP. Uma foto larga, na horizontal, funciona melhor; foto grande do celular é reduzida sozinha."
      classeDaPrevia="border-linha bg-campo grid aspect-[16/6] w-full max-w-md place-items-center overflow-hidden rounded-xl border"
      classeDaImagem="h-full w-full object-cover"
      rotulos={{
        escolher: "Escolher a foto de capa",
        trocar: "Trocar a capa",
        tirar: "Tirar a capa",
        enviada: "Capa salva.",
        removida: "Capa removida.",
      }}
      enviar={enviar}
      remover={remover}
    />
  );
}
