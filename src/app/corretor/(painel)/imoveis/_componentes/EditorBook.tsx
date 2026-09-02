"use client";

import { useState, useRef } from "react";
import { uploadBookDigital, removerBookDigital, salvarLinkBookDigital } from "../actions";
import { FileText, Folder, Check } from 'lucide-react';

interface Props {
  empreendimentoId: string;
  slug: string;
  bookUrlInicial?: string | null;
  bookTituloInicial?: string | null;
}

export function EditorBook({
  empreendimentoId,
  slug,
  bookUrlInicial,
  bookTituloInicial,
}: Props) {
  const [bookUrl, setBookUrl] = useState<string | null>(bookUrlInicial || null);
  const [titulo, setTitulo] = useState(bookTituloInicial || "Book Oficial do Empreendimento");
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState<React.ReactNode | null>(null);
  const [linkManual, setLinkManual] = useState(bookUrlInicial || "");
  const [modoManual, setModoManual] = useState(false);
  const inputPdfRef = useRef<HTMLInputElement>(null);

  const handleUploadPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      setMensagem("❌ Selecione apenas arquivos em formato PDF.");
      return;
    }

    setEnviando(true);
    setMensagem(null);

    try {
      const formData = new FormData();
      formData.append("arquivo", file);
      formData.append("titulo", titulo);

      const res = await uploadBookDigital(empreendimentoId, slug, formData);
      if (res.ok && res.url) {
        setBookUrl(res.url);
        setLinkManual(res.url);
        setMensagem(<><Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> Book Digital enviado e publicado com sucesso!</>);
        setTimeout(() => setMensagem(null), 4000);
      } else {
        setMensagem(`❌ ${res.erro || "Falha ao enviar PDF."}`);
      }
    } catch (err) {
      console.error(err);
      setMensagem("❌ Erro de conexão ao enviar arquivo.");
    } finally {
      setEnviando(false);
      if (inputPdfRef.current) inputPdfRef.current.value = "";
    }
  };

  const handleSalvarLinkManual = async () => {
    setEnviando(true);
    try {
      const res = await salvarLinkBookDigital(empreendimentoId, slug, linkManual, titulo);
      if (res.ok) {
        setBookUrl(linkManual || null);
        setMensagem(<><Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> URL do Book Digital salva com sucesso!</>);
        setTimeout(() => setMensagem(null), 4000);
      }
    } finally {
      setEnviando(false);
    }
  };

  const handleRemoverBook = async () => {
    if (!confirm("Deseja realmente remover o Book Digital deste imóvel?")) return;

    setEnviando(true);
    try {
      const res = await removerBookDigital(empreendimentoId, slug, bookUrl);
      if (res.ok) {
        setBookUrl(null);
        setLinkManual("");
        setMensagem(<><Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> Book removido do catálogo!</>);
        setTimeout(() => setMensagem(null), 4000);
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-6">
      {mensagem && (
        <div
          className={`p-4 rounded-2xl border text-fluid-xs font-bold ${
            typeof mensagem === "string" && mensagem.startsWith("❌")
              ? "bg-perigo-lavado border-perigo-linha text-perigo"
              : "bg-ok-lavado border-ok-linha text-ok"
          }`}
        >
          {mensagem}
        </div>
      )}

      {/* Card Principal */}
      <div className="p-5 sm:p-6 rounded-3xl border border-linha bg-superficie backdrop-blur space-y-6">
        <div>
          <span className="text-[11px] uppercase font-bold tracking-wider text-acento-suave">
            Material de Apresentação
          </span>
          <h3 className="text-fluid-base font-bold text-titulo mt-0.5">
             <FileText className="inline-block w-5 h-5 align-text-bottom mr-1" />  Book Digital Completo (PDF)
          </h3>
          <p className="text-fluid-xs text-apoio mt-1">
            Faça upload do Book oficial ou e-book em PDF. Ele ficará disponível para download dos clientes na vitrine pública e será enviado automaticamente pelo assistente de WhatsApp.
          </p>
        </div>

        {/* Título do Book */}
        <div className="space-y-1.5">
          <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
            Título / Nome do Material
          </label>
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex: Book Oficial de Lançamento — Next Home"
            className="min-h-[48px] w-full rounded-xl border border-linha-forte bg-campo px-4 text-fluid-sm text-titulo focus:border-acento focus:outline-none"
          />
        </div>

        {/* Estado Atual do Book */}
        {bookUrl ? (
          <div className="p-5 rounded-2xl border border-ok-linha bg-ok-lavado space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl"> <FileText className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span>
                <div>
                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-ok-lavado text-ok border border-ok-linha mb-1">
                     <Check className="inline-block w-5 h-5 align-text-bottom mr-1" />  Book Ativo na Vitrine
                  </span>
                  <h4 className="text-fluid-sm font-bold text-titulo">{titulo}</h4>
                  <p className="text-[11px] text-apoio truncate max-w-md">{bookUrl}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={bookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-ok text-white hover:opacity-90 text-fluid-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Abrir / Baixar PDF</span>
                  <span>↗</span>
                </a>

                <button
                  type="button"
                  onClick={handleRemoverBook}
                  disabled={enviando}
                  className="px-3 py-2 rounded-xl bg-perigo-lavado hover:bg-perigo text-perigo hover:text-white text-fluid-xs font-bold transition-colors border border-perigo-linha cursor-pointer"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Upload do PDF via Mobile / Desktop */
          <div className="p-8 text-center rounded-3xl border border-dashed border-linha-forte bg-fundo/70 space-y-4">
            <span className="text-4xl block"> <Folder className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span>
            <div>
              <h4 className="text-fluid-base font-bold text-titulo">
                Selecione o arquivo PDF do Book
              </h4>
              <p className="text-fluid-xs text-apoio mt-1">
                Tamanho máximo recomendado: 35MB
              </p>
            </div>

            <input
              ref={inputPdfRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleUploadPdf}
              className="hidden"
              id="input-pdf-book"
            />

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <label
                htmlFor="input-pdf-book"
                className="w-full sm:w-auto min-h-[48px] px-6 py-2.5 rounded-xl bg-acento hover:bg-acento-hover text-sobre-cor text-fluid-xs font-bold transition-all shadow-md shadow-acento/20 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                {enviando ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-linha-forte border-t-white animate-spin" />
                    <span>Enviando Book (PDF)...</span>
                  </>
                ) : (
                  <>
                    <span>📤 Escolher Arquivo PDF</span>
                  </>
                )}
              </label>

              <button
                type="button"
                onClick={() => setModoManual(!modoManual)}
                className="text-fluid-xs text-apoio hover:text-titulo underline-offset-4 hover:underline py-2"
              >
                {modoManual ? "Ocultar link manual" : "Ou colar link direto (Drive/Dropbox)"}
              </button>
            </div>
          </div>
        )}

        {/* Inserção de Link Externo Alternativo */}
        {modoManual && (
          <div className="p-4 rounded-2xl border border-linha bg-campo space-y-3">
            <label className="text-[11px] font-bold text-corpo uppercase block">
              Link Externo do PDF (Google Drive, Cloudinary, AWS S3, etc.)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={linkManual}
                onChange={(e) => setLinkManual(e.target.value)}
                placeholder="https://meudrive.com/book-alphaville.pdf"
                className="min-h-[44px] flex-1 rounded-xl border border-linha-forte bg-superficie px-3 text-fluid-xs text-titulo focus:border-acento focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSalvarLinkManual}
                disabled={enviando}
                className="min-h-[44px] px-4 rounded-xl bg-acento hover:bg-acento-hover text-sobre-cor text-fluid-xs font-bold cursor-pointer"
              >
                Salvar Link
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
