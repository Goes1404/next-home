"use client";

import { useRef, useState, useTransition } from "react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { TETO_DA_LOGO_BYTES } from "@/lib/marcaDoCrm/logo";

type Resultado = { ok: true; url: string | null } | { ok: false; erro: string };

/**
 * Enviar, trocar ou tirar a logo do grupo no CRM (0208). Serve à plataforma
 * (`/plataforma/grupos/[id]`) e ao gestor (Administração → Marca): quem
 * monta a tela passa as duas ações já presas ao grupo certo.
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
  const [logo, setLogo] = useState<string | null>(logoAtual);
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const [pendente, iniciar] = useTransition();
  const campo = useRef<HTMLInputElement>(null);

  const rodar = (acao: () => Promise<Resultado>, sucesso: string) =>
    iniciar(async () => {
      setAviso(null);
      try {
        const r = await acao();
        if (r.ok) {
          setLogo(r.url);
          setAviso({ texto: sucesso, erro: false });
          if (campo.current) campo.current.value = "";
        } else {
          setAviso({ texto: r.erro, erro: true });
        }
      } catch (e) {
        setAviso({
          texto: ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Não foi possível falar com o servidor. Tente de novo.",
          erro: true,
        });
      }
    });

  const aoEnviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const arquivo = campo.current?.files?.[0];
    if (!arquivo) {
      setAviso({ texto: "Escolha o arquivo da logo.", erro: true });
      return;
    }
    if (arquivo.size > TETO_DA_LOGO_BYTES) {
      setAviso({ texto: "A logo passa de 1 MB. Reduza a imagem e tente de novo.", erro: true });
      return;
    }
    const dados = new FormData();
    dados.set("logo", arquivo);
    rodar(() => enviar(dados), "Logo salva.");
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={aoEnviar}>
      <div className="flex items-center gap-4">
        <div className="border-linha bg-campo grid h-16 w-40 shrink-0 place-items-center overflow-hidden rounded-xl border p-2">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo do grupo (URL pública do Storage)
            <img src={logo} alt={`Logo de ${nomeDaCasa}`} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-fluid-xs text-tenue px-1 text-center">Sem logo: o nome escrito</span>
          )}
        </div>
        <p className="text-fluid-xs text-apoio">
          PNG, JPEG ou WebP, até 1 MB, de preferência com fundo transparente. Aparece no cabeçalho e no menu do CRM.
        </p>
      </div>
      <input
        ref={campo}
        type="file"
        name="logo"
        accept="image/png,image/jpeg,image/webp"
        className="text-fluid-sm text-corpo"
        aria-label="Arquivo da logo"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pendente}
          className="bg-acento text-sobre-cor text-fluid-sm min-h-11 cursor-pointer rounded-xl px-4 font-medium disabled:opacity-60"
        >
          {pendente ? "Salvando…" : logo ? "Trocar a logo" : "Enviar a logo"}
        </button>
        {logo && (
          <button
            type="button"
            disabled={pendente}
            onClick={() => rodar(remover, "Logo removida: o CRM volta a mostrar o nome escrito.")}
            className="border-linha-forte text-corpo text-fluid-sm min-h-11 cursor-pointer rounded-xl border px-4 disabled:opacity-60"
          >
            Tirar a logo
          </button>
        )}
      </div>
      {aviso && (
        <p role="status" className={`text-fluid-sm ${aviso.erro ? "text-erro" : "text-ok"}`}>
          {aviso.texto}
        </p>
      )}
    </form>
  );
}
