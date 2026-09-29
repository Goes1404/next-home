"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { publicarAtualizacaoDaObra } from "./obraAcoes";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";

const CAMPO = "w-full rounded-xl border border-linha-forte bg-campo px-3 py-2.5 text-fluid-sm text-titulo outline-none";

export function FormularioDaObra({
  empreendimentoId,
  fotos,
}: {
  empreendimentoId: string;
  fotos: { url: string; alt: string }[];
}) {
  const router = useRouter();
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [percentual, setPercentual] = useState("");
  const [foto, setFoto] = useState("");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          setMsg(null);
          try {
            const r = await publicarAtualizacaoDaObra({
              empreendimentoId,
              titulo,
              texto,
              percentual: percentual === "" ? null : Number(percentual),
              fotoUrl: foto || null,
            });
            if (r.erro) setMsg({ tipo: "erro", texto: r.erro });
            else {
              setMsg({ tipo: "ok", texto: r.ok ?? "Publicado." });
              setTitulo("");
              setTexto("");
              setFoto("");
              router.refresh();
            }
          } catch (err) {
            setMsg({ tipo: "erro", texto: ehActionDeOutroBuild(err) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo." });
          }
        });
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
        <input
          aria-label="Título da atualização"
          placeholder="Ex.: Estrutura concluída"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          maxLength={140}
          className={CAMPO}
        />
        <input
          aria-label="Percentual da obra"
          placeholder="% da obra"
          inputMode="numeric"
          value={percentual}
          onChange={(e) => setPercentual(e.target.value.replace(/\D/g, "").slice(0, 3))}
          className={CAMPO}
        />
      </div>
      <textarea
        aria-label="Detalhes (opcional)"
        placeholder="Detalhes (opcional)"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={2}
        maxLength={2000}
        className={CAMPO}
      />
      {fotos.length > 0 && (
        <select aria-label="Foto (opcional)" value={foto} onChange={(e) => setFoto(e.target.value)} className={`select-seta ${CAMPO}`}>
          <option value="">Sem foto</option>
          {fotos.map((f) => (
            <option key={f.url} value={f.url}>
              {f.alt || f.url.split("/").pop()}
            </option>
          ))}
        </select>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendente || titulo.trim().length < 2}
          className="min-h-11 rounded-xl bg-acento px-4 text-fluid-xs font-bold text-sobre-cor disabled:opacity-60"
        >
          {pendente ? "Publicando…" : "Publicar atualização"}
        </button>
        {msg && (
          <p role={msg.tipo === "erro" ? "alert" : "status"} className={`text-fluid-xs ${msg.tipo === "erro" ? "text-perigo" : "text-apoio"}`}>
            {msg.texto}
          </p>
        )}
      </div>
    </form>
  );
}
