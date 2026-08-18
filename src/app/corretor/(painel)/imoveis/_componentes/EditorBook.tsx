"use client";

import { useState, useRef } from "react";
import { uploadBookDigital, removerBookDigital, salvarLinkBookDigital } from "../actions";

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
  const [mensagem, setMensagem] = useState<string | null>(null);
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
        setMensagem("✓ Book Digital enviado e publicado com sucesso!");
        setTimeout(() => setMensagem(null), 4000);
      } else {
        setMensagem(`❌ ${res.erro || "Falha ao enviar PDF."}`);
      }
    } catch (err: any) {
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
        setMensagem("✓ Link do Book atualizado com sucesso!");
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
        setMensagem("✓ Book Digital removido do catálogo.");
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
          className={`p-4 rounded-2xl border text-fluid-xs font-bold animate-in fade-in ${
            mensagem.startsWith("✓")
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-red-500/10 border-red-500/30 text-red-300"
          }`}
        >
          {mensagem}
        </div>
      )}

      {/* Card Principal */}
      <div className="p-5 sm:p-6 rounded-3xl border border-white/10 bg-ink-900/60 backdrop-blur space-y-6">
        <div>
          <span className="text-[11px] uppercase font-bold tracking-wider text-brand-300">
            Material de Apresentação
          </span>
          <h3 className="text-fluid-base font-bold text-white mt-0.5">
            📑 Book Digital Completo (PDF)
          </h3>
          <p className="text-fluid-xs text-mist-400 mt-1">
            Faça upload do Book oficial ou e-book em PDF. Ele ficará disponível para download dos clientes na vitrine pública e será enviado automaticamente pelo assistente de WhatsApp.
          </p>
        </div>

        {/* Título do Book */}
        <div className="space-y-1.5">
          <label className="text-fluid-xs font-bold text-mist-300 uppercase tracking-wider block">
            Título / Nome do Material
          </label>
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex: Book Oficial de Lançamento — Next Home"
            className="min-h-[48px] w-full rounded-xl border border-white/15 bg-ink-950 px-4 text-fluid-sm text-white focus:border-brand-400 focus:outline-none"
          />
        </div>

        {/* Estado Atual do Book */}
        {bookUrl ? (
          <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl">📑</span>
                <div>
                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 mb-1">
                    ✓ Book Ativo na Vitrine
                  </span>
                  <h4 className="text-fluid-sm font-bold text-white">{titulo}</h4>
                  <p className="text-[11px] text-mist-400 truncate max-w-md">{bookUrl}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={bookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-fluid-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Abrir / Baixar PDF</span>
                  <span>↗</span>
                </a>

                <button
                  type="button"
                  onClick={handleRemoverBook}
                  disabled={enviando}
                  className="px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500 text-red-300 hover:text-white text-fluid-xs font-bold transition-colors border border-red-500/20 cursor-pointer"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Upload do PDF via Mobile / Desktop */
          <div className="p-8 text-center rounded-3xl border border-dashed border-white/20 bg-ink-950/70 space-y-4">
            <span className="text-4xl block">📁</span>
            <div>
              <h4 className="text-fluid-base font-bold text-white">
                Selecione o arquivo PDF do Book
              </h4>
              <p className="text-fluid-xs text-mist-400 mt-1">
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
                className="w-full sm:w-auto min-h-[48px] px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-fluid-xs font-bold transition-all shadow-md shadow-brand-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                {enviando ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
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
                className="text-fluid-xs text-mist-400 hover:text-white underline-offset-4 hover:underline py-2"
              >
                {modoManual ? "Ocultar link manual" : "Ou colar link direto (Drive/Dropbox)"}
              </button>
            </div>
          </div>
        )}

        {/* Inserção de Link Externo Alternativo */}
        {modoManual && (
          <div className="p-4 rounded-2xl border border-white/10 bg-ink-950 space-y-3 animate-in fade-in">
            <label className="text-[11px] font-bold text-mist-300 uppercase block">
              Link Externo do PDF (Google Drive, Cloudinary, AWS S3, etc.)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={linkManual}
                onChange={(e) => setLinkManual(e.target.value)}
                placeholder="https://meudrive.com/book-alphaville.pdf"
                className="min-h-[44px] flex-1 rounded-xl border border-white/15 bg-ink-900 px-3 text-fluid-xs text-white focus:border-brand-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSalvarLinkManual}
                disabled={enviando}
                className="min-h-[44px] px-4 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-fluid-xs font-bold cursor-pointer"
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
