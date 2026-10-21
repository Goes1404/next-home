"use client";

import { useEffect, useRef, useState } from "react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { prepararImagemParaEnvio, type OpcoesDeReducao } from "@/lib/imagem/reduzir";

type Resultado = { ok: true; url: string | null } | { ok: false; erro: string };

/**
 * Enviar, trocar ou tirar uma imagem (logo e capa) sem segundo clique: o
 * botão grande abre o seletor e, ao escolher (ou ao soltar a imagem na
 * prévia), ela é reduzida no navegador e enviada na hora, com a prévia
 * aparecendo de imediato. Quem monta passa as ações já presas ao grupo certo.
 */
export function EnviarImagem({
  imagemAtual,
  nomeDoCampo,
  reducao,
  alt,
  vazio,
  ajuda,
  classeDaPrevia,
  classeDaImagem,
  rotulos,
  enviar,
  remover,
}: {
  imagemAtual: string | null;
  /** O nome do campo no FormData que a Server Action lê (`logo`, `capa`). */
  nomeDoCampo: string;
  reducao: OpcoesDeReducao;
  alt: string;
  /** O que a prévia diz enquanto não há imagem. */
  vazio: string;
  ajuda: string;
  classeDaPrevia: string;
  classeDaImagem: string;
  rotulos: { escolher: string; trocar: string; tirar: string; enviada: string; removida: string };
  enviar: (dados: FormData) => Promise<Resultado>;
  remover: () => Promise<Resultado>;
}) {
  const [imagem, setImagem] = useState<string | null>(imagemAtual);
  const [local, setLocal] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"enviando" | "removendo" | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const urlLocal = useRef<string | null>(null);

  const soltarLocal = () => {
    if (urlLocal.current) URL.revokeObjectURL(urlLocal.current);
    urlLocal.current = null;
    setLocal(null);
  };
  useEffect(
    () => () => {
      if (urlLocal.current) URL.revokeObjectURL(urlLocal.current);
    },
    [],
  );

  const textoDoErro = (e: unknown) =>
    ehActionDeOutroBuild(e)
      ? avisoDePaginaVelha()
      : "Não foi possível falar com o servidor. Confira a conexão e tente de novo.";

  async function aoEscolher(arquivo: File | undefined) {
    if (campo.current) campo.current.value = "";
    if (!arquivo || ocupado) return;
    setAviso(null);
    setOcupado("enviando");
    // A prévia aparece já, antes de a imagem subir.
    soltarLocal();
    urlLocal.current = URL.createObjectURL(arquivo);
    setLocal(urlLocal.current);
    try {
      const pronto = await prepararImagemParaEnvio(arquivo, reducao);
      if (!pronto.ok) {
        setAviso({ texto: pronto.erro, erro: true });
        soltarLocal();
        return;
      }
      const dados = new FormData();
      dados.set(nomeDoCampo, pronto.arquivo);
      const r = await enviar(dados);
      if (r.ok) {
        setImagem(r.url);
        setAviso({ texto: rotulos.enviada, erro: false });
      } else {
        setAviso({ texto: r.erro, erro: true });
      }
      soltarLocal();
    } catch (e) {
      setAviso({ texto: textoDoErro(e), erro: true });
      soltarLocal();
    } finally {
      setOcupado(null);
    }
  }

  async function aoTirar() {
    setAviso(null);
    setOcupado("removendo");
    try {
      const r = await remover();
      if (r.ok) {
        setImagem(r.url);
        setAviso({ texto: rotulos.removida, erro: false });
      } else {
        setAviso({ texto: r.erro, erro: true });
      }
    } catch (e) {
      setAviso({ texto: textoDoErro(e), erro: true });
    } finally {
      setOcupado(null);
    }
  }

  const mostrada = local ?? imagem;

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!ocupado) setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          void aoEscolher(e.dataTransfer.files?.[0]);
        }}
        className={`${classeDaPrevia} relative ${arrastando ? "border-acento border-dashed" : ""}`}
      >
        {mostrada ? (
          // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) ou URL pública do Storage
          <img src={mostrada} alt={alt} className={classeDaImagem} />
        ) : (
          <span className="text-fluid-xs text-tenue px-3 text-center">{vazio}</span>
        )}
        {ocupado === "enviando" && (
          <span
            role="status"
            className="bg-fundo/70 text-fluid-sm text-titulo absolute inset-0 grid place-items-center font-medium"
          >
            Enviando…
          </span>
        )}
      </div>
      <p className="text-fluid-xs text-apoio">{ajuda} Também dá para arrastar a imagem para cima da prévia.</p>
      <input
        ref={campo}
        type="file"
        name={nomeDoCampo}
        accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
        className="hidden"
        aria-label={rotulos.escolher}
        onChange={(e) => void aoEscolher(e.target.files?.[0])}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={ocupado !== null}
          onClick={() => campo.current?.click()}
          className="bg-acento text-sobre-cor text-fluid-sm min-h-12 cursor-pointer rounded-xl px-5 font-bold disabled:opacity-60"
        >
          {ocupado === "enviando" ? "Enviando…" : imagem ? rotulos.trocar : rotulos.escolher}
        </button>
        {imagem && (
          <button
            type="button"
            disabled={ocupado !== null}
            onClick={() => void aoTirar()}
            className="border-linha-forte text-corpo text-fluid-sm min-h-12 cursor-pointer rounded-xl border px-4 disabled:opacity-60"
          >
            {ocupado === "removendo" ? "Tirando…" : rotulos.tirar}
          </button>
        )}
      </div>
      {aviso && (
        <p role={aviso.erro ? "alert" : "status"} className={`text-fluid-sm ${aviso.erro ? "text-erro" : "text-ok"}`}>
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
