"use client";

import { useRef, useState, useTransition } from "react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { TETO_DA_CAPA_BYTES } from "@/lib/sites/siteEditavel";

type Resultado = { ok: true; url: string | null } | { ok: false; erro: string };

/** A foto de capa do topo da home (0209): JPG, PNG ou WebP até 5 MB. */
export function FormularioDeCapa({
  capaAtual,
  enviar,
  remover,
}: {
  capaAtual: string | null;
  enviar: (dados: FormData) => Promise<Resultado>;
  remover: () => Promise<Resultado>;
}) {
  const [capa, setCapa] = useState<string | null>(capaAtual);
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const [pendente, iniciar] = useTransition();
  const campo = useRef<HTMLInputElement>(null);

  const rodar = (acao: () => Promise<Resultado>, sucesso: string) =>
    iniciar(async () => {
      setAviso(null);
      try {
        const r = await acao();
        if (r.ok) {
          setCapa(r.url);
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
      setAviso({ texto: "Escolha a foto de capa.", erro: true });
      return;
    }
    if (arquivo.size > TETO_DA_CAPA_BYTES) {
      setAviso({ texto: "A foto de capa passa de 5 MB. Reduza a imagem e tente de novo.", erro: true });
      return;
    }
    const dados = new FormData();
    dados.set("capa", arquivo);
    rodar(() => enviar(dados), "Capa salva.");
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={aoEnviar}>
      <div className="border-linha bg-campo grid aspect-[16/6] w-full max-w-md place-items-center overflow-hidden rounded-xl border">
        {capa ? (
          // eslint-disable-next-line @next/next/no-img-element -- capa do grupo (URL pública do Storage)
          <img src={capa} alt="Foto de capa do site" className="h-full w-full object-cover" />
        ) : (
          <span className="text-fluid-xs text-tenue px-3 text-center">Sem capa: o topo da home usa o fundo padrão</span>
        )}
      </div>
      <p className="text-fluid-xs text-apoio">JPG, PNG ou WebP, até 5 MB. Uma foto larga, na horizontal, funciona melhor.</p>
      <input
        ref={campo}
        type="file"
        name="capa"
        accept="image/png,image/jpeg,image/webp"
        className="text-fluid-sm text-corpo"
        aria-label="Arquivo da foto de capa"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pendente}
          className="bg-acento text-sobre-cor text-fluid-sm min-h-11 cursor-pointer rounded-xl px-4 font-medium disabled:opacity-60"
        >
          {pendente ? "Salvando…" : capa ? "Trocar a capa" : "Enviar a capa"}
        </button>
        {capa && (
          <button
            type="button"
            disabled={pendente}
            onClick={() => rodar(remover, "Capa removida.")}
            className="border-linha-forte text-corpo text-fluid-sm min-h-11 cursor-pointer rounded-xl border px-4 disabled:opacity-60"
          >
            Tirar a capa
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
