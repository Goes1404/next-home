"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, FileText, Paperclip, RotateCcw, X } from "lucide-react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { dataHora } from "@/app/corretor/(painel)/_componentes/CartaoLead";
import {
  avisoDePaginaVelha,
  ehActionDeOutroBuild,
} from "@/lib/erros/actionDeOutroBuild";
import { moverEtapa } from "@/app/corretor/actions";
import {
  MIMES_ACEITOS,
  PERFIL_DE_DOCUMENTO_LABEL,
  PERFIS_DE_DOCUMENTO,
  type PerfilDeDocumento,
} from "@/lib/crm/linksDoCliente";
import {
  FASE_DOCUMENTO_LABEL,
  MOTIVOS_DE_RECUSA,
  TETO_ITEM,
  TETO_MOTIVO,
  mensagemDeRecusa,
  type FaseDocumento,
  type SituacaoDoItem,
  type SituacaoDocumento,
} from "@/lib/crm/documentacao";
import {
  adicionarItem,
  anexarDocumento,
  arquivosParaZip,
  comecarLista,
  conferirDocumento,
  linkDosDocumentos,
  reabrirDocumento,
  recusarDocumento,
  removerItem,
} from "./documentacaoAcoes";

export type ArquivoNaTela = {
  id: string;
  situacao: SituacaoDocumento;
  motivoRecusa: string | null;
  criadoEm: string;
  nomeArquivo: string | null;
  alerta: string | null;
  origem: "link" | "corretor" | "whatsapp";
  url: string | null;
};

export type FaseNaTela = {
  fase: FaseDocumento;
  gravada: boolean;
  perfil: string | null;
  itens: {
    item: string;
    situacao: SituacaoDoItem;
    motivo: string | null;
    arquivos: ArquivoNaTela[];
  }[];
  avulsos: ArquivoNaTela[];
  conferidos: number;
  aConferir: number;
  pendentes: number;
  urlDoLink: string | null;
};

const CHIP: Record<SituacaoDoItem, { texto: string; classe: string }> = {
  falta: { texto: "Falta", classe: "border border-linha-forte text-apoio" },
  recebido: { texto: "Para conferir", classe: "bg-alerta-lavado text-alerta" },
  conferido: { texto: "Conferido", classe: "bg-ok-lavado text-ok" },
  recusado: { texto: "Recusado", classe: "bg-perigo-lavado text-perigo" },
};

const ORIGEM: Record<ArquivoNaTela["origem"], string> = {
  link: "pelo link",
  corretor: "anexado por você",
  whatsapp: "do WhatsApp",
};

/**
 * A seção "Documentação" da ficha (0179). Duas listas (financiamento e
 * contrato), cada item com a situação dele; o corretor confere, recusa com
 * motivo, anexa, põe e tira itens, manda o link ao cliente e baixa o .zip.
 *
 * Recusar não manda nada sozinho: abre o WhatsApp do corretor com a mensagem
 * pronta. Quem fala com o cliente é ele (a regra da IA que só responde vale
 * para o painel também).
 */
export function DocumentacaoClient({
  leadId,
  primeiroNome,
  telefone,
  podeEditar,
  migrado,
  fases,
  sugerirEtapa,
}: {
  leadId: string;
  primeiroNome: string | null;
  telefone: string | null;
  podeEditar: boolean;
  migrado: boolean;
  fases: FaseNaTela[];
  sugerirEtapa: boolean;
}) {
  const [faseAtiva, setFaseAtiva] = useState<FaseDocumento>("financiamento");
  const [perfil, setPerfil] = useState<PerfilDeDocumento>("clt");
  const [novoItem, setNovoItem] = useState("");
  const [recusando, setRecusando] = useState<{
    id: string;
    item: string;
    motivo: string;
  } | null>(null);
  const [recado, setRecado] = useState<{ texto: string; titulo: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const [baixando, setBaixando] = useState(false);
  const { avisar, falhar } = useAvisos();
  const router = useRouter();
  const anexoAlvo = useRef<string | null>(null);
  const seletorDeArquivo = useRef<HTMLInputElement>(null);

  const f = fases.find((x) => x.fase === faseAtiva)!;
  const digitos = telefone?.replace(/\D/g, "") ?? "";
  const editavel = podeEditar && migrado;

  function rodar(fn: () => Promise<{ ok?: true; erro?: string }>, sucesso?: string) {
    iniciar(async () => {
      try {
        const r = await fn();
        if (r.erro) return falhar(r.erro);
        if (sucesso) avisar(sucesso);
        router.refresh();
      } catch (err) {
        falhar(
          ehActionDeOutroBuild(err)
            ? avisoDePaginaVelha()
            : "Sem conexão. Tente de novo.",
        );
      }
    });
  }

  function escolherArquivo(item: string) {
    anexoAlvo.current = item;
    seletorDeArquivo.current?.click();
  }

  function anexar(arquivo: File | undefined) {
    const item = anexoAlvo.current;
    if (seletorDeArquivo.current) seletorDeArquivo.current.value = "";
    if (!arquivo || !item) return;
    const dados = new FormData();
    dados.set("leadId", leadId);
    dados.set("fase", faseAtiva);
    dados.set("item", item);
    dados.set("arquivo", arquivo);
    rodar(() => anexarDocumento(dados), `"${item}" anexado e conferido.`);
  }

  function confirmarRecusa() {
    if (!recusando) return;
    const { id, item, motivo } = recusando;
    iniciar(async () => {
      try {
        const r = await recusarDocumento(id, motivo);
        if (r.erro) return falhar(r.erro);
        setRecusando(null);
        setRecado({
          titulo: `Avise o cliente sobre "${item}"`,
          texto: mensagemDeRecusa({ primeiroNome, item, motivo, url: f.urlDoLink }),
        });
        router.refresh();
      } catch (err) {
        falhar(
          ehActionDeOutroBuild(err)
            ? avisoDePaginaVelha()
            : "Sem conexão. Tente de novo.",
        );
      }
    });
  }

  function pedirPorLink() {
    iniciar(async () => {
      try {
        const r = await linkDosDocumentos(leadId, faseAtiva, perfil);
        if ("erro" in r) return falhar(r.erro);
        setRecado({
          titulo: "Link para o cliente mandar os documentos",
          texto: r.mensagem,
        });
        router.refresh();
      } catch (err) {
        falhar(
          ehActionDeOutroBuild(err)
            ? avisoDePaginaVelha()
            : "Sem conexão. Tente de novo.",
        );
      }
    });
  }

  /**
   * O .zip é montado no NAVEGADOR: a resposta de uma função da Vercel tem
   * teto de 4,5 MB, e uma pasta de financiamento passa disso fácil. O
   * servidor só assina os links (10 min); os bytes vêm direto do Storage.
   */
  async function baixarZip() {
    setBaixando(true);
    try {
      const r = await arquivosParaZip(leadId, faseAtiva);
      if ("erro" in r) return falhar(r.erro);
      const { montarZipSemCompressao } = await import("@/lib/crm/zipNoNavegador");
      const arquivos = await Promise.all(
        r.arquivos.map(async (a) => {
          const resposta = await fetch(a.url);
          if (!resposta.ok) throw new Error(`download ${resposta.status}`);
          return {
            nome: a.nome,
            conteudo: new Uint8Array(await resposta.arrayBuffer()),
          };
        }),
      );
      const zip = montarZipSemCompressao(arquivos);
      const url = URL.createObjectURL(
        new Blob([zip as BlobPart], { type: "application/zip" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nomeDoZip;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      avisar(
        `${arquivos.length} ${arquivos.length === 1 ? "arquivo" : "arquivos"} no .zip.`,
      );
    } catch (err) {
      falhar(
        ehActionDeOutroBuild(err)
          ? avisoDePaginaVelha()
          : "Não consegui baixar os arquivos. Tente de novo.",
      );
    } finally {
      setBaixando(false);
    }
  }

  async function copiarRecado() {
    if (!recado) return;
    try {
      await navigator.clipboard.writeText(recado.texto);
      avisar("Mensagem copiada.");
    } catch {
      falhar("Não consegui copiar — selecione o texto e copie à mão.");
    }
  }

  const totalDeItens = f.itens.length;

  return (
    <section className="cartao space-y-3 p-4" aria-labelledby="titulo-documentacao">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-documentacao" className="text-fluid-sm text-titulo font-medium">
          Documentação
        </h2>
        <div
          role="tablist"
          aria-label="Fase da documentação"
          className="flex flex-wrap gap-1"
        >
          {fases.map((x) => (
            <button
              key={x.fase}
              type="button"
              role="tab"
              aria-selected={x.fase === faseAtiva}
              onClick={() => {
                setFaseAtiva(x.fase);
                setRecusando(null);
              }}
              className={`text-fluid-xs min-h-11 rounded-full px-3 font-semibold ${
                x.fase === faseAtiva
                  ? "bg-acento text-sobre-cor"
                  : "text-corpo botao-secundario"
              }`}
            >
              {FASE_DOCUMENTO_LABEL[x.fase]}
              {x.aConferir > 0 && (
                <span className="ml-1.5 font-normal opacity-90">
                  · {x.aConferir} a conferir
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {!migrado && (
        <p className="bg-alerta-lavado text-fluid-xs text-alerta rounded-xl p-3">
          A conferência de documentos ainda não está ativa no banco (migration 0179). Os
          arquivos recebidos aparecem abaixo, mas conferir, recusar e editar a lista
          ficam disponíveis depois dela.
        </p>
      )}

      {sugerirEtapa && faseAtiva === "financiamento" && (
        <div className="border-ok-linha bg-ok-lavado flex flex-wrap items-center gap-2 rounded-xl border p-3">
          <p className="text-fluid-xs text-corpo min-w-0 flex-1 break-words">
            Todos os documentos do financiamento estão conferidos. Mover o lead para
            Documentação?
          </p>
          <button
            type="button"
            disabled={ocupado}
            onClick={() =>
              rodar(async () => {
                const r = await moverEtapa(leadId, "documentacao");
                return r?.erro ? { erro: r.erro } : { ok: true };
              }, "Lead movido para Documentação.")
            }
            className="bg-acento hover:bg-acento-hover text-fluid-xs text-sobre-cor min-h-11 rounded-xl px-4 font-bold disabled:opacity-60"
          >
            Mover
          </button>
        </div>
      )}

      {totalDeItens > 0 && (
        <p className="text-fluid-xs text-apoio">
          {f.conferidos} de {totalDeItens} conferidos
          {f.aConferir > 0 && ` · ${f.aConferir} para conferir`}
          {f.pendentes > 0 && ` · ${f.pendentes} com o cliente`}
        </p>
      )}

      {totalDeItens === 0 && (
        <div className="border-linha space-y-2 rounded-xl border p-3">
          <p className="text-fluid-xs text-apoio">
            {faseAtiva === "financiamento"
              ? "Nenhum documento pedido ainda. A lista começa pelo perfil de renda e você ajusta depois."
              : "A lista do contrato começa com o que as construtoras costumam pedir; ajuste para a deste imóvel."}
          </p>
          {editavel && (
            <div className="flex flex-wrap items-center gap-2">
              {faseAtiva === "financiamento" && (
                <select
                  aria-label="Perfil de renda do cliente"
                  value={perfil}
                  onChange={(e) => setPerfil(e.target.value as PerfilDeDocumento)}
                  className="select-seta text-fluid-xs border-linha-forte bg-campo text-titulo min-h-11 rounded-xl border px-3"
                >
                  {PERFIS_DE_DOCUMENTO.map((p) => (
                    <option key={p} value={p}>
                      {PERFIL_DE_DOCUMENTO_LABEL[p]}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                disabled={ocupado}
                onClick={() => rodar(() => comecarLista(leadId, faseAtiva, perfil))}
                className="bg-acento hover:bg-acento-hover text-fluid-xs text-sobre-cor min-h-11 rounded-xl px-4 font-bold disabled:opacity-60"
              >
                Montar a lista
              </button>
            </div>
          )}
        </div>
      )}

      {totalDeItens > 0 && (
        <ul className="divide-linha divide-y">
          {f.itens.map((i) => (
            <li key={i.item} className="space-y-2 py-2.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-fluid-xs text-titulo font-semibold break-words">
                    {i.item}
                  </p>
                  {i.motivo && (
                    <p className="text-fluid-xs text-perigo break-words">
                      Recusado: {i.motivo}
                    </p>
                  )}
                </div>
                <span
                  className={`text-fluid-xs shrink-0 rounded-full px-2.5 py-1 font-semibold ${CHIP[i.situacao].classe}`}
                >
                  {CHIP[i.situacao].texto}
                </span>
              </div>

              {i.arquivos.length > 0 && (
                <ul className="space-y-1.5">
                  {i.arquivos.map((a) => (
                    <LinhaDoArquivo
                      key={a.id}
                      arquivo={a}
                      editavel={editavel}
                      ocupado={ocupado}
                      aoConferir={() =>
                        rodar(() => conferirDocumento(a.id), "Conferido.")
                      }
                      aoRecusar={() =>
                        setRecusando({ id: a.id, item: i.item, motivo: "" })
                      }
                      aoReabrir={() => rodar(() => reabrirDocumento(a.id))}
                    />
                  ))}
                </ul>
              )}

              {recusando && i.arquivos.some((a) => a.id === recusando.id) && (
                <fieldset className="border-perigo-linha space-y-2 rounded-xl border p-3">
                  <legend className="text-fluid-xs text-corpo px-1 font-semibold">
                    Por que recusar?
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {MOTIVOS_DE_RECUSA.map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={recusando.motivo === m}
                        onClick={() => setRecusando({ ...recusando, motivo: m })}
                        className={`text-fluid-xs min-h-11 rounded-full px-3 ${
                          recusando.motivo === m
                            ? "bg-perigo text-sobre-cor font-semibold"
                            : "text-corpo botao-secundario"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <input
                    value={recusando.motivo}
                    maxLength={TETO_MOTIVO}
                    onChange={(e) =>
                      setRecusando({ ...recusando, motivo: e.target.value })
                    }
                    placeholder="Ou escreva o motivo"
                    aria-label="Motivo da recusa"
                    className="text-fluid-sm border-linha-forte bg-campo text-titulo min-h-11 w-full rounded-xl border px-3"
                  />
                  <p className="text-fluid-xs text-tenue">
                    O cliente lê o motivo na página do link.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={ocupado || !recusando.motivo.trim()}
                      onClick={confirmarRecusa}
                      className="bg-perigo text-fluid-xs text-sobre-cor min-h-11 rounded-xl px-4 font-bold disabled:opacity-60"
                    >
                      Recusar
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecusando(null)}
                      className="text-fluid-xs text-apoio botao-secundario min-h-11 px-3"
                    >
                      Cancelar
                    </button>
                  </div>
                </fieldset>
              )}

              {editavel && (
                <div className="flex flex-wrap gap-2">
                  {i.situacao !== "conferido" && (
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => escolherArquivo(i.item)}
                      className="text-fluid-xs text-corpo botao-secundario inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 disabled:opacity-60"
                    >
                      <Paperclip className="h-3.5 w-3.5" aria-hidden /> Anexar
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => rodar(() => removerItem(leadId, faseAtiva, i.item))}
                    aria-label={`Tirar "${i.item}" da lista`}
                    className="text-fluid-xs text-apoio botao-secundario inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 disabled:opacity-60"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden /> Tirar da lista
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editavel && totalDeItens > 0 && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const texto = novoItem;
            rodar(async () => {
              const r = await adicionarItem(leadId, faseAtiva, texto);
              if (!r.erro) setNovoItem("");
              return r;
            });
          }}
        >
          <input
            value={novoItem}
            maxLength={TETO_ITEM}
            onChange={(e) => setNovoItem(e.target.value)}
            placeholder="Outro documento"
            aria-label="Nome do documento para pedir"
            className="text-fluid-sm border-linha-forte bg-campo text-titulo min-h-11 min-w-0 flex-1 rounded-xl border px-3"
          />
          <button
            type="submit"
            disabled={ocupado || !novoItem.trim()}
            className="text-fluid-xs text-corpo botao-secundario min-h-11 rounded-xl px-4 font-semibold disabled:opacity-60"
          >
            Pedir também
          </button>
        </form>
      )}

      {f.avulsos.length > 0 && (
        <div className="border-linha space-y-1.5 border-t pt-3">
          <p className="text-fluid-xs text-corpo font-semibold">Fora da lista</p>
          <ul className="space-y-1.5">
            {f.avulsos.map((a) => (
              <LinhaDoArquivo
                key={a.id}
                arquivo={a}
                editavel={editavel}
                ocupado={ocupado}
                aoConferir={() => rodar(() => conferirDocumento(a.id), "Conferido.")}
                aoReabrir={() => rodar(() => reabrirDocumento(a.id))}
              />
            ))}
          </ul>
        </div>
      )}

      <div className="border-linha flex flex-wrap gap-2 border-t pt-3">
        {editavel && (totalDeItens > 0 || faseAtiva === "financiamento") && (
          <button
            type="button"
            disabled={ocupado}
            onClick={pedirPorLink}
            className="bg-acento hover:bg-acento-hover text-fluid-xs text-sobre-cor min-h-11 rounded-xl px-4 font-bold disabled:opacity-60"
          >
            {f.urlDoLink ? "Mandar o link de novo" : "Pedir por link"}
          </button>
        )}
        {f.conferidos > 0 && (
          <button
            type="button"
            disabled={baixando}
            onClick={baixarZip}
            className="text-fluid-xs text-corpo botao-secundario inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 font-semibold disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            {baixando ? "Preparando…" : "Baixar conferidos (.zip)"}
          </button>
        )}
      </div>

      {recado && (
        <div className="border-acento-linha bg-acento-lavado space-y-2 rounded-xl border p-3">
          <p className="text-fluid-xs text-corpo font-semibold">{recado.titulo}</p>
          <p className="text-fluid-xs text-corpo break-words">{recado.texto}</p>
          <div className="flex flex-wrap gap-2">
            {digitos && (
              <a
                href={`https://wa.me/${digitos}?text=${encodeURIComponent(recado.texto)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-fluid-xs inline-flex min-h-11 items-center rounded-xl bg-[#25D366] px-4 font-bold text-white"
              >
                Enviar no WhatsApp
              </a>
            )}
            <button
              type="button"
              onClick={copiarRecado}
              className="text-fluid-xs text-corpo botao-secundario min-h-11 rounded-xl px-4 font-semibold"
            >
              Copiar
            </button>
            <button
              type="button"
              onClick={() => setRecado(null)}
              className="text-fluid-xs text-apoio botao-secundario min-h-11 px-3"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      <input
        ref={seletorDeArquivo}
        type="file"
        accept={MIMES_ACEITOS.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => anexar(e.target.files?.[0])}
      />
    </section>
  );
}

function LinhaDoArquivo({
  arquivo: a,
  editavel,
  ocupado,
  aoConferir,
  aoRecusar,
  aoReabrir,
}: {
  arquivo: ArquivoNaTela;
  editavel: boolean;
  ocupado: boolean;
  aoConferir: () => void;
  /** Sem ele, o arquivo não oferece recusa (os avulsos: o item saiu da lista). */
  aoRecusar?: () => void;
  aoReabrir: () => void;
}) {
  return (
    <li className="bg-vidro space-y-1 rounded-lg px-2 py-1.5">
      {/* As ações descem para a linha de baixo: lado a lado com o nome, no
          celular, espremiam o nome do arquivo a uma letra por linha. */}
      <div className="flex items-start gap-2">
        <FileText className="text-apoio mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span className="text-fluid-xs text-corpo min-w-0 flex-1 break-words">
          {a.url ? (
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="link-acao -my-3 inline-block max-w-full py-3 font-semibold [overflow-wrap:anywhere]"
            >
              {a.nomeArquivo ?? "arquivo"}
            </a>
          ) : (
            <span className="font-semibold">{a.nomeArquivo ?? "arquivo"}</span>
          )}{" "}
          <span className="text-tenue">
            · {ORIGEM[a.origem]} · {dataHora.format(new Date(a.criadoEm))}
            {a.situacao === "recusado" && " · recusado"}
            {a.situacao === "conferido" && " · conferido"}
          </span>
          {a.alerta && <span className="text-alerta block">⚠ {a.alerta}</span>}
        </span>
      </div>
      {editavel && a.situacao === "recebido" && (
        <span className="flex flex-wrap gap-1.5 pl-6">
          <button
            type="button"
            disabled={ocupado}
            onClick={aoConferir}
            className="text-fluid-xs text-ok botao-secundario inline-flex min-h-11 items-center gap-1 rounded-xl px-3 font-semibold disabled:opacity-60"
          >
            <Check className="h-3.5 w-3.5" aria-hidden /> Conferir
          </button>
          {aoRecusar && (
            <button
              type="button"
              disabled={ocupado}
              onClick={aoRecusar}
              className="text-fluid-xs text-perigo botao-secundario inline-flex min-h-11 items-center gap-1 rounded-xl px-3 font-semibold disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" aria-hidden /> Recusar
            </button>
          )}
        </span>
      )}
      {editavel && a.situacao !== "recebido" && (
        <div className="pl-6">
          <button
            type="button"
            disabled={ocupado}
            onClick={aoReabrir}
            className="text-fluid-xs text-apoio botao-secundario inline-flex min-h-11 items-center gap-1 rounded-xl px-3 disabled:opacity-60"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Desfazer
          </button>
        </div>
      )}
    </li>
  );
}
