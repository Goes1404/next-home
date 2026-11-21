"use client";

import { useEffect } from "react";
import { useTentarDeNovoAoVoltar } from "@/components/erro/tentarDeNovoAoVoltar";

/**
 * Erro acima de qualquer `error.tsx` (20/11/2026): no lugar da tela preta
 * padrão do Next ("This page couldn't load" com Reload/Back).
 *
 * Caso que motivou: voltar do WhatsApp para a aba Prospecção no celular. A
 * recarga da página cortada no meio quebrava a casca do painel (o layout),
 * que o `error.tsx` de `/plataforma` não cobre. Esta tela tenta de novo
 * sozinha quando a pessoa volta (ver `useTentarDeNovoAoVoltar`).
 *
 * Vale para todos os endereços (painel e sites das imobiliárias), então é
 * neutra, sem marca, e com estilo próprio: o `global-error` substitui o
 * layout raiz e não carrega o CSS do app.
 */
export default function ErroGeral({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Erro geral:", error);
  }, [error]);
  useTentarDeNovoAoVoltar(unstable_retry);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          background: "#f6f7f9",
          color: "#1b2433",
          padding: "24px",
        }}
      >
        <style>{`
          @media (prefers-color-scheme: dark) {
            body { background: #0d1420 !important; color: #e6ebf2 !important; }
            .erro-apoio { color: #9aa7b8 !important; }
            .erro-secundario { background: #1c2636 !important; color: #e6ebf2 !important; }
          }
        `}</style>
        <main style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 12px" }}>Não conseguimos carregar esta página</h1>
          <p className="erro-apoio" style={{ fontSize: 15, lineHeight: 1.5, color: "#5b6676", margin: 0 }}>
            Nada foi perdido. Normalmente é a internet que caiu no meio do caminho, por exemplo ao voltar de outro
            aplicativo. Estamos tentando de novo.
          </p>
          {error.digest && (
            <p className="erro-apoio" style={{ fontFamily: "monospace", fontSize: 11, color: "#8a94a3", marginTop: 16 }}>
              Código: {error.digest}
            </p>
          )}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 28, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{
                minHeight: 44,
                padding: "0 20px",
                borderRadius: 12,
                border: 0,
                background: "#2f5ea8",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Tentar de novo
            </button>
            <button
              type="button"
              className="erro-secundario"
              onClick={() => window.location.reload()}
              style={{
                minHeight: 44,
                padding: "0 20px",
                borderRadius: 12,
                border: 0,
                background: "#e6eaf0",
                color: "#1b2433",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Recarregar a página
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
