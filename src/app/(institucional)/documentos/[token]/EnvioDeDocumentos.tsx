"use client";

import { useState } from "react";
import { MIMES_ACEITOS, problemaDoArquivo } from "@/lib/crm/linksDoCliente";
import { enviarDocumento } from "./acoes";

type Estado = { enviando?: boolean; enviados: number; erro?: string };

/**
 * Um botão por documento. O arquivo é conferido NO APARELHO antes de subir
 * (tamanho e formato) — recusar depois de 10 MB enviados pelo 4G é o jeito
 * mais caro de dizer "não".
 */
export function EnvioDeDocumentos({
  token,
  itens,
  jaEnviados,
}: {
  token: string;
  itens: string[];
  jaEnviados: Record<string, number>;
}) {
  const [estado, setEstado] = useState<Record<string, Estado>>(() =>
    Object.fromEntries(itens.map((i) => [i, { enviados: jaEnviados[i] ?? 0 }])),
  );

  async function enviar(item: string, arquivos: FileList | null) {
    if (!arquivos || arquivos.length === 0) return;
    for (const arquivo of Array.from(arquivos)) {
      const problema = problemaDoArquivo(arquivo);
      if (problema) {
        setEstado((s) => ({ ...s, [item]: { ...s[item], erro: problema } }));
        continue;
      }
      setEstado((s) => ({ ...s, [item]: { ...s[item], enviando: true, erro: undefined } }));
      const dados = new FormData();
      dados.set("token", token);
      dados.set("item", item);
      dados.set("arquivo", arquivo);
      let erro: string | undefined;
      try {
        const r = await enviarDocumento(dados);
        erro = r.erro;
      } catch {
        erro = "Sem conexão. Tente de novo.";
      }
      setEstado((s) => ({
        ...s,
        [item]: {
          enviando: false,
          enviados: (s[item]?.enviados ?? 0) + (erro ? 0 : 1),
          erro,
        },
      }));
    }
  }

  const completos = itens.filter((i) => (estado[i]?.enviados ?? 0) > 0).length;

  return (
    <div className="space-y-4">
      <p className="text-fluid-sm text-apoio" aria-live="polite">
        {completos} de {itens.length} enviados
      </p>
      <ul className="space-y-3">
        {itens.map((item) => {
          const e = estado[item] ?? { enviados: 0 };
          const id = `doc-${itens.indexOf(item)}`;
          return (
            <li key={item} className="rounded-2xl border border-linha bg-superficie p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-fluid-base font-semibold text-titulo break-words min-w-0">
                  {e.enviados > 0 ? "✓ " : ""}
                  {item}
                </p>
                <label
                  htmlFor={id}
                  className={`min-h-11 inline-flex cursor-pointer items-center rounded-full px-4 text-fluid-sm font-semibold ${
                    e.enviados > 0
                      ? "border border-linha-forte text-corpo"
                      : "bg-acento text-sobre-cor"
                  } ${e.enviando ? "opacity-60" : ""}`}
                >
                  {e.enviando ? "Enviando…" : e.enviados > 0 ? "Enviar outro" : "Enviar"}
                </label>
                <input
                  id={id}
                  type="file"
                  multiple
                  accept={MIMES_ACEITOS.join(",")}
                  disabled={e.enviando}
                  className="sr-only"
                  onChange={(ev) => {
                    void enviar(item, ev.target.files);
                    ev.target.value = "";
                  }}
                />
              </div>
              {e.enviados > 1 && <p className="text-fluid-xs text-apoio">{e.enviados} arquivos enviados</p>}
              {e.erro && (
                <p role="alert" className="text-fluid-sm text-perigo">
                  {e.erro}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
