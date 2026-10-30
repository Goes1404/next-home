"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { conectarCentral, type ResultadoDaConexao } from "../centralAcoes";

/**
 * Gerar o código (ou o QR) para conectar o chip do número central. No
 * celular do chip: WhatsApp → Aparelhos conectados → Conectar aparelho →
 * Conectar com número de telefone, e digitar o código.
 */
export function ConectarCentral({ conectado }: { conectado: boolean }) {
  const router = useRouter();
  const [resultado, setResultado] = useState<ResultadoDaConexao | null>(null);
  const [pendente, iniciar] = useTransition();
  const pedir = (modo: "codigo" | "qr") =>
    iniciar(async () => {
      try {
        setResultado(await conectarCentral(modo));
      } catch {
        setResultado({ ok: false, erro: "Sem conexão. Tente de novo." });
      }
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pendente}
          onClick={() => pedir("codigo")}
          className="min-h-11 rounded-xl bg-acento px-5 text-fluid-sm font-semibold text-sobre-cor disabled:opacity-60"
        >
          {pendente ? "Gerando…" : conectado ? "Reconectar com código" : "Gerar código de conexão"}
        </button>
        <button type="button" disabled={pendente} onClick={() => pedir("qr")} className="botao-solido min-h-11 px-4 text-fluid-sm font-semibold text-acento disabled:opacity-60">
          Mostrar QR Code
        </button>
        <button type="button" onClick={() => router.refresh()} className="botao-solido min-h-11 px-4 text-fluid-sm font-semibold text-acento">
          Atualizar estado
        </button>
      </div>

      {resultado && !resultado.ok && (
        <p role="alert" className="text-fluid-sm text-perigo">
          {resultado.erro}
        </p>
      )}
      {resultado?.ok && resultado.jaConectado && <p className="text-fluid-sm text-ok">O número já está conectado.</p>}
      {resultado?.ok && resultado.codigo && (
        <div className="rounded-xl bg-vidro p-4">
          <p className="text-fluid-xs text-apoio">Código de conexão</p>
          <p className="font-mono text-fluid-2xl font-bold tracking-[0.2em] text-titulo">{resultado.codigo}</p>
          <p className="mt-2 text-fluid-sm text-corpo text-pretty">
            No celular do chip: WhatsApp → Aparelhos conectados → Conectar aparelho → Conectar com número de telefone, e
            digite o código. Depois toque em &quot;Atualizar estado&quot;.
          </p>
        </div>
      )}
      {resultado?.ok && !resultado.codigo && resultado.qrcode && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={resultado.qrcode.startsWith("data:") ? resultado.qrcode : `data:image/png;base64,${resultado.qrcode}`} alt="QR Code para conectar o número central" className="h-64 w-64 rounded-xl bg-white p-2" />
      )}
    </div>
  );
}
