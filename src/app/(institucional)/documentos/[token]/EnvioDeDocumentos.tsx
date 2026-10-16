"use client";

import { useState } from "react";
import { MIMES_ACEITOS, problemaDoArquivo } from "@/lib/crm/linksDoCliente";
import { situacaoParaCliente, type SituacaoDoItem } from "@/lib/crm/documentacao";
import { enviarDocumento } from "./acoes";

type Item = { item: string; situacao: SituacaoDoItem; motivo: string | null };
type Estado = { enviando?: boolean; situacao: SituacaoDoItem; motivo: string | null; erro?: string };

const COR: Record<SituacaoDoItem, string> = {
  falta: "text-apoio",
  recebido: "text-alerta",
  conferido: "text-ok",
  recusado: "text-perigo",
};

/**
 * Um botão por documento, com a situação de cada um (0179): falta, enviado,
 * conferido pelo corretor, ou recusado com o motivo — o cliente que mandou a
 * foto torta lê "falta o verso" e manda de novo, sem precisar perguntar.
 *
 * O arquivo é conferido NO APARELHO antes de subir (tamanho e formato) —
 * recusar depois de 10 MB enviados pelo 4G é o jeito mais caro de dizer
 * "não". Item conferido não oferece envio: está resolvido.
 */
export function EnvioDeDocumentos({ token, itens }: { token: string; itens: Item[] }) {
  const [estado, setEstado] = useState<Record<string, Estado>>(() =>
    Object.fromEntries(itens.map((i) => [i.item, { situacao: i.situacao, motivo: i.motivo }])),
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
        [item]: erro
          ? { ...s[item], enviando: false, erro }
          : { enviando: false, situacao: "recebido", motivo: null },
      }));
    }
  }

  const resolvidos = itens.filter((i) => {
    const s = estado[i.item]?.situacao;
    return s === "recebido" || s === "conferido";
  }).length;

  return (
    <div className="space-y-4">
      <p className="text-fluid-sm text-apoio" aria-live="polite">
        {resolvidos} de {itens.length} enviados
      </p>
      <ul className="space-y-3">
        {itens.map(({ item }, indice) => {
          const e = estado[item] ?? { situacao: "falta", motivo: null };
          const id = `doc-${indice}`;
          const jaFoi = e.situacao === "recebido" || e.situacao === "conferido";
          return (
            <li key={item} className="rounded-2xl border border-linha bg-superficie p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-fluid-base font-semibold text-titulo break-words">
                    {jaFoi ? "✓ " : ""}
                    {item}
                  </p>
                  <p className={`text-fluid-xs font-semibold ${COR[e.situacao]}`}>{situacaoParaCliente(e.situacao)}</p>
                </div>
                {e.situacao !== "conferido" && (
                  <>
                    <label
                      htmlFor={id}
                      className={`min-h-11 inline-flex cursor-pointer items-center rounded-full px-4 text-fluid-sm font-semibold ${
                        jaFoi ? "border border-linha-forte text-corpo" : "bg-acento text-sobre-cor"
                      } ${e.enviando ? "opacity-60" : ""}`}
                    >
                      {e.enviando
                        ? "Enviando…"
                        : e.situacao === "recusado"
                          ? "Enviar de novo"
                          : jaFoi
                            ? "Enviar outro"
                            : "Enviar"}
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
                  </>
                )}
              </div>
              {e.situacao === "recusado" && e.motivo && (
                <p className="rounded-xl bg-perigo-lavado p-2 text-fluid-sm text-perigo break-words">
                  O corretor precisa de outro arquivo: {e.motivo}
                </p>
              )}
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
