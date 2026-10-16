"use client";

import { useState } from "react";
import { MIMES_ACEITOS, problemaDoArquivo } from "@/lib/crm/linksDoCliente";
import { situacaoParaCliente, type SituacaoDoItem } from "@/lib/crm/documentacao";
import { dicaDoDocumento, formatoDoArquivo, motivoDaFalhaDeEnvio } from "@/lib/crm/envioDeDocumento";
import { prepararFoto, subirComAutorizacao } from "@/lib/crm/fotoParaEnvio";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { confirmarEnvio, prepararEnvio } from "./acoes";

type Item = { item: string; situacao: SituacaoDoItem; motivo: string | null };
type Estado = { enviando?: string; situacao: SituacaoDoItem; motivo: string | null; erro?: string };

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
 * A foto é reduzida NO APARELHO (`fotoParaEnvio.ts`) e o arquivo é
 * conferido antes de subir (tamanho e formato) — recusar depois de 10 MB
 * enviados pelo 4G é o jeito mais caro de dizer "não". Depois ele sobe
 * direto ao armazenamento, sem passar pela Vercel, que recusa acima de
 * 4,5 MB. Item conferido não oferece envio: está resolvido.
 *
 * Cada falha diz a causa (`motivoDaFalhaDeEnvio`): "sem conexão" para
 * arquivo grande demais mandava o cliente tentar de novo algo que nunca ia
 * passar.
 */
export function EnvioDeDocumentos({ token, itens }: { token: string; itens: Item[] }) {
  const [estado, setEstado] = useState<Record<string, Estado>>(() =>
    Object.fromEntries(itens.map((i) => [i.item, { situacao: i.situacao, motivo: i.motivo }])),
  );

  function marcar(item: string, mudanca: Partial<Estado>) {
    setEstado((s) => ({ ...s, [item]: { ...s[item], ...mudanca } }));
  }

  /** Um arquivo, do aparelho até a lista. Devolve a frase de erro, ou nada. */
  async function enviarUm(item: string, original: File, rotulo: string): Promise<string | undefined> {
    marcar(item, { enviando: `Preparando${rotulo}…`, erro: undefined });
    const arquivo = await prepararFoto(original);
    const problema = problemaDoArquivo(arquivo);
    if (problema) return problema;

    marcar(item, { enviando: `Enviando${rotulo}…` });
    try {
      const autorizado = await prepararEnvio({
        token,
        item,
        nome: arquivo.name,
        tamanho: arquivo.size,
        tipo: formatoDoArquivo(arquivo),
      });
      if ("erro" in autorizado) return autorizado.erro;
      const subiu = await subirComAutorizacao({
        bucket: "documentos-clientes",
        caminho: autorizado.caminho,
        autorizacao: autorizado.autorizacao,
        arquivo,
      });
      if ("erro" in subiu) return subiu.erro;
      const r = await confirmarEnvio({ token, item, caminho: autorizado.caminho, nome: original.name });
      return r.erro;
    } catch (erro) {
      return ehActionDeOutroBuild(erro) ? avisoDePaginaVelha() : motivoDaFalhaDeEnvio(erro);
    }
  }

  async function enviar(item: string, arquivos: FileList | null) {
    if (!arquivos || arquivos.length === 0) return;
    const lista = Array.from(arquivos);
    let enviados = 0;
    let ultimoErro: string | undefined;
    for (const [i, arquivo] of lista.entries()) {
      const rotulo = lista.length > 1 ? ` ${i + 1} de ${lista.length}` : "";
      const erro = await enviarUm(item, arquivo, rotulo);
      if (erro) ultimoErro = lista.length > 1 ? `${arquivo.name}: ${erro}` : erro;
      else enviados++;
    }
    setEstado((s) => ({
      ...s,
      [item]:
        enviados > 0
          ? { enviando: undefined, situacao: "recebido", motivo: null, erro: ultimoErro }
          : { ...s[item], enviando: undefined, erro: ultimoErro },
    }));
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
          const dica = dicaDoDocumento(item);
          return (
            <li key={item} className="rounded-2xl border border-linha bg-superficie p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-fluid-base font-semibold text-titulo break-words">
                    {jaFoi ? "✓ " : ""}
                    {item}
                  </p>
                  <p className={`text-fluid-xs font-semibold ${COR[e.situacao]}`}>{situacaoParaCliente(e.situacao)}</p>
                  {dica && e.situacao !== "conferido" && (
                    <p className="mt-1 text-fluid-xs text-apoio break-words">{dica}</p>
                  )}
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
                        ? e.enviando
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
                      accept={[...MIMES_ACEITOS, ".heic", ".heif"].join(",")}
                      disabled={Boolean(e.enviando)}
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
