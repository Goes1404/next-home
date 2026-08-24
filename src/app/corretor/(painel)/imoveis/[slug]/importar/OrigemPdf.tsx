"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TETO_PDF_BYTES } from "@/lib/imoveis/pdfImagens";
import { analisarPdf, gravarEscolhasDoPdf, type AnaliseDoPdf } from "./acoes";
import { GradeCuradoria, type EscolhaCuradoria, type ItemDaGrade } from "./GradeCuradoria";

/**
 * Aba da apresentação em PDF.
 *
 * O arquivo vai do navegador DIRETO para o Storage e só o caminho é mandado
 * para o servidor: Server Action tem teto de corpo (12 MB neste projeto) e
 * deck de construtora passa disso. Assim o PDF não cruza a função, e o teto
 * não precisa ser afrouxado para todas as outras actions do sistema.
 */
export function OrigemPdf({ empreendimentoId, slug }: { empreendimentoId: string; slug: string }) {
  const [analise, setAnalise] = useState<AnaliseDoPdf | null>(null);
  const [caminhoStaging, setCaminhoStaging] = useState<string | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, EscolhaCuradoria>>({});
  const [etapa, setEtapa] = useState<"parado" | "enviando" | "lendo" | "gravando">("parado");
  const [resumo, setResumo] = useState<string | null>(null);

  const aoEscolherArquivo = async (arquivo: File) => {
    setResumo(null);
    setAnalise(null);

    if (arquivo.size > TETO_PDF_BYTES) {
      const mb = (arquivo.size / 1024 / 1024).toFixed(0);
      setAnalise({
        ok: false,
        erro: `Este PDF tem ${mb} MB e o limite é 25 MB. Mande a apresentação, não o catálogo inteiro da construtora.`,
      });
      return;
    }

    setEtapa("enviando");

    // Nome aleatório, não sequencial: o bucket é público, e um caminho
    // adivinhável deixaria a apresentação exposta enquanto ela existe.
    const caminho = `${empreendimentoId}/_importacao/${crypto.randomUUID()}.pdf`;
    const supabase = createClient();
    const { error } = await supabase.storage
      .from("empreendimentos")
      .upload(caminho, arquivo, { contentType: "application/pdf", upsert: true });

    if (error) {
      console.error("Erro ao enviar o PDF para o Storage:", error);
      setEtapa("parado");
      setAnalise({ ok: false, erro: "Não consegui enviar o arquivo. Confira a conexão e tente de novo." });
      return;
    }

    setCaminhoStaging(caminho);
    setEtapa("lendo");

    const resultado = await analisarPdf(caminho);
    setAnalise(resultado);
    setEtapa("parado");

    if (resultado.ok) {
      setEscolhas(
        Object.fromEntries(
          resultado.itens.map((item) => [
            String(item.indice),
            {
              chave: String(item.indice),
              // Página inteira entra DESMARCADA: quase sempre tem logo e
              // texto por cima, e marcá-la por padrão faria o corretor
              // desmarcar uma por uma.
              incluir: !item.parecePaginaInteira,
              tipo: item.parecePlanta ? ("planta" as const) : ("foto" as const),
              capa: false,
            },
          ]),
        ),
      );
    }
  };

  const gravar = async () => {
    if (analise?.ok !== true || !caminhoStaging) return;

    const escolhidas = Object.values(escolhas).filter((e) => e.incluir);
    if (escolhidas.length === 0) {
      setResumo("Marque pelo menos uma imagem.");
      return;
    }

    setEtapa("gravando");
    const resultado = await gravarEscolhasDoPdf({
      empreendimentoId,
      slug,
      caminhoStaging,
      escolhas: escolhidas.map((e) => ({ indice: Number(e.chave), tipo: e.tipo, capa: e.capa })),
    });
    setEtapa("parado");

    if (!resultado.ok) {
      setResumo(resultado.erro ?? "Não consegui gravar agora.");
      return;
    }

    setResumo(
      [
        `${resultado.gravadas} ${resultado.gravadas === 1 ? "imagem adicionada" : "imagens adicionadas"} ao imóvel.`,
        resultado.duplicadas > 0
          ? `${resultado.duplicadas} ${resultado.duplicadas === 1 ? "já estava" : "já estavam"} na galeria.`
          : "",
        ...resultado.falhas,
      ]
        .filter(Boolean)
        .join(" "),
    );

    // O PDF de passagem foi apagado ao gravar: outra importação começa
    // escolhendo o arquivo de novo.
    setAnalise(null);
    setCaminhoStaging(null);
    setEscolhas({});
  };

  const itens: ItemDaGrade[] =
    analise?.ok === true
      ? analise.itens.map((item) => ({
          chave: String(item.indice),
          preview: item.preview,
          legenda: `${item.largura} × ${item.altura}`,
          aviso: item.parecePaginaInteira ? "Parece a página inteira da apresentação" : undefined,
        }))
      : [];

  const ocupado = etapa !== "parado";

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-dashed border-linha-forte bg-elevado p-6 text-center space-y-3">
        <p className="text-fluid-xs text-apoio max-w-sm mx-auto">
          Mande a apresentação que a construtora enviou. Eu tiro as fotos e as plantas de dentro dela, e você escolhe o
          que entra no imóvel.
        </p>

        <input
          type="file"
          accept="application/pdf"
          id="input-pdf-apresentacao"
          className="hidden"
          disabled={ocupado}
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = "";
            if (arquivo) void aoEscolherArquivo(arquivo);
          }}
        />

        <label
          htmlFor="input-pdf-apresentacao"
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-acento px-5 py-2.5 text-fluid-xs font-bold text-white shadow-md shadow-acento/20 transition-all active:scale-95 cursor-pointer"
        >
          {etapa === "enviando" ? "Enviando o arquivo…" : etapa === "lendo" ? "Abrindo a apresentação…" : "Escolher PDF"}
        </label>
      </div>

      {analise?.ok === false ? (
        <p role="alert" className="text-fluid-xs text-corpo">
          {analise.erro}
        </p>
      ) : null}

      {analise?.ok === true && analise.avisos.length > 0 ? (
        <ul className="text-fluid-xs text-apoio space-y-1">
          {analise.avisos.map((aviso) => (
            <li key={aviso}>{aviso}</li>
          ))}
        </ul>
      ) : null}

      {analise?.ok === true ? (
        <>
          <GradeCuradoria itens={itens} escolhas={escolhas} aoMudar={setEscolhas} />

          <button
            type="button"
            onClick={() => void gravar()}
            disabled={ocupado}
            className="w-full min-h-[48px] rounded-xl bg-acento px-5 text-fluid-xs font-bold text-white shadow-md shadow-acento/20 transition-all active:scale-95 disabled:opacity-60"
          >
            {etapa === "gravando" ? "Adicionando ao imóvel…" : "Adicionar ao imóvel"}
          </button>
        </>
      ) : null}

      {resumo ? (
        <p role="status" className="text-fluid-xs text-corpo">
          {resumo}
        </p>
      ) : null}
    </div>
  );
}
