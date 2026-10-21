"use client";

import { EnviarImagem } from "@/components/grupos/EnviarImagem";
import { REDUCAO_DA_LOGO } from "@/lib/imagem/reduzir";

type Resultado = { ok: true; url: string | null } | { ok: false; erro: string };

/**
 * Enviar, trocar ou tirar a logo do grupo no CRM (0208). Serve à plataforma
 * (`/plataforma/grupos/[id]`) e ao gestor (Administração, Marca e Meu site):
 * quem monta a tela passa as duas ações já presas ao grupo certo. Escolher já
 * envia; logo grande é reduzida no navegador (PNG continua PNG).
 */
export function FormularioDeLogo({
  nomeDaCasa,
  logoAtual,
  enviar,
  remover,
}: {
  nomeDaCasa: string;
  logoAtual: string | null;
  enviar: (dados: FormData) => Promise<Resultado>;
  remover: () => Promise<Resultado>;
}) {
  return (
    <EnviarImagem
      imagemAtual={logoAtual}
      nomeDoCampo="logo"
      reducao={REDUCAO_DA_LOGO}
      alt={`Logo de ${nomeDaCasa}`}
      vazio="Sem logo: o nome escrito"
      ajuda="PNG, JPEG ou WebP, de preferência com fundo transparente. Aparece no cabeçalho e no menu do CRM e do site."
      classeDaPrevia="border-linha bg-campo grid h-24 w-full max-w-xs place-items-center overflow-hidden rounded-xl border p-3"
      classeDaImagem="max-h-full max-w-full object-contain"
      rotulos={{
        escolher: "Escolher a logo",
        trocar: "Trocar a logo",
        tirar: "Tirar a logo",
        enviada: "Logo salva.",
        removida: "Logo removida: o CRM volta a mostrar o nome escrito.",
      }}
      enviar={enviar}
      remover={remover}
    />
  );
}
