"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TETO_PDF_BYTES, TETO_PDF_MB } from "@/lib/imoveis/limitesPdf";
import type { RascunhoCadastro as Rascunho } from "@/lib/imoveis/rascunhoDePdf";
import {
  analisarPdf,
  aplicarRascunhoNoCadastro,
  descartarPdfDeImportacao,
  gerarTipologiaDaPlanta,
  gravarEscolhasDoPdf,
  sugerirCadastroDoPdf,
  type AnaliseDoPdf,
} from "./acoes";
import { GradeCuradoria, type EscolhaCuradoria, type ItemDaGrade } from "./GradeCuradoria";
import { RascunhoCadastro } from "./RascunhoCadastro";
import { ResultadoDaImportacao, tituloDoResultado, type ResultadoImportacao } from "./ResultadoDaImportacao";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";

/**
 * Quantas imagens por chamada. A action baixa e relê o PDF a cada chamada,
 * então uma por vez custaria uma leitura por imagem; tudo de uma vez não
 * deixaria tirar nada da fila depois do clique. Quatro é o meio: tirar vale
 * para tudo que ainda não saiu, e o PDF é relido poucas vezes.
 */
const LOTE_PDF = 4;

/**
 * Aba da apresentação em PDF.
 *
 * O arquivo vai do navegador DIRETO para o Storage e só o caminho é mandado
 * para o servidor: Server Action tem teto de corpo (12 MB neste projeto) e
 * deck de construtora passa disso. Assim o PDF não cruza a função, e o teto
 * não precisa ser afrouxado para todas as outras actions do sistema.
 */
export function OrigemPdf({
  empreendimentoId,
  slug,
  cadastroAtual,
}: {
  empreendimentoId: string;
  slug: string;
  cadastroAtual: Record<string, unknown>;
}) {
  const [analise, setAnalise] = useState<AnaliseDoPdf | null>(null);
  const [caminhoStaging, setCaminhoStaging] = useState<string | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, EscolhaCuradoria>>({});
  const [etapa, setEtapa] = useState<"parado" | "enviando" | "lendo" | "gravando" | "lendoPlantas">("parado");
  const [resumo, setResumo] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [avisoRascunho, setAvisoRascunho] = useState<string | null>(null);
  const [rascunhoSalvo, setRascunhoSalvo] = useState<string | null>(null);
  const [tipologias, setTipologias] = useState<string | null>(null);
  const [resultadoFinal, setResultadoFinal] = useState<ResultadoImportacao | null>(null);
  const { avisar } = useAvisos();
  const [estados, setEstados] = useState<Record<string, NonNullable<ItemDaGrade["estado"]>>>({});

  // O envio confere a lista a cada lote, por ref: estado de React dentro do
  // laço é o do render em que ele começou.
  const escolhasAgora = useRef(escolhas);
  const parar = useRef(false);
  useEffect(() => {
    escolhasAgora.current = escolhas;
  }, [escolhas]);

  const aoEscolherArquivo = async (arquivo: File) => {
    setResumo(null);
    setAnalise(null);
    setRascunho(null);
    setAvisoRascunho(null);
    setRascunhoSalvo(null);
    setResultadoFinal(null);
    setEstados({});
    setTipologias(null);

    if (arquivo.size > TETO_PDF_BYTES) {
      const mb = (arquivo.size / 1024 / 1024).toFixed(0);
      setAnalise({
        ok: false,
        erro: `Este PDF tem ${mb} MB e o limite do Storage é ${TETO_PDF_MB} MB — o arquivo nem chega a sair daqui. Mande a apresentação em vez do catálogo inteiro, ou exporte o book em resolução de tela.`,
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
              // Letreiro e logo entram DESMARCADOS; página inteira, NÃO.
              // Medido em dois books reais: as plantas são justamente
              // imagens do tamanho da página, então desmarcá-las por padrão
              // faria o corretor remarcar uma por uma — o contrário de
              // ajudar. Já toda imagem em escala de cinza era letreiro ou
              // recorte, nunca foto.
              incluir: !item.pareceGrafismo,
              tipo: item.parecePlanta ? ("planta" as const) : ("foto" as const),
              capa: false,
            },
          ]),
        ),
      );

      // Lido DEPOIS das imagens e sem travar a tela: a IA é o elo que pode
      // demorar ou estar fora do ar, e a curadoria das fotos não depende dela.
      void sugerirCadastroDoPdf(caminho).then((sugestao) => {
        if (sugestao.ok) setRascunho(sugestao.rascunho);
        else setAvisoRascunho(sugestao.aviso);
      });
    }
  };

  const salvarRascunho = async (aceitos: Partial<Rascunho>) => {
    const resultado = await aplicarRascunhoNoCadastro({ empreendimentoId, slug, aceitos });
    setRascunhoSalvo(
      resultado.ok
        ? `${Object.keys(aceitos).length} ${Object.keys(aceitos).length === 1 ? "campo salvo" : "campos salvos"} no cadastro.`
        : (resultado.erro ?? "Não consegui salvar agora."),
    );
    if (resultado.ok) {
      setRascunho(null);
      avisar("Dados do imóvel salvos no cadastro.");
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
    setTipologias(null);
    setResumo(null);
    parar.current = false;
    setEstados(Object.fromEntries(escolhidas.map((e) => [e.chave, "fila" as const])));
    const marcar = (chaves: string[], estado: NonNullable<ItemDaGrade["estado"]> | null) =>
      setEstados((atual) => {
        const proximo = { ...atual };
        for (const chave of chaves) {
          if (estado) proximo[chave] = estado;
          else delete proximo[chave];
        }
        return proximo;
      });

    const resultado = { gravadas: 0, duplicadas: 0, falhas: [] as string[], plantas: [] as { indice: number; url: string }[] };
    let tiradas = 0;
    let erroGeral: string | null = null;
    let perdidas = 0;
    const fila = escolhidas.map((e) => e.chave);

    while (fila.length > 0 && !erroGeral) {
      // Tipo, capa e o próprio "incluir" valem como estão AGORA na tela.
      const pedido = fila.splice(0, LOTE_PDF);
      const lote = pedido
        .map((chave) => escolhasAgora.current[chave])
        .filter((e): e is EscolhaCuradoria => Boolean(e?.incluir) && !parar.current);
      const fora = pedido.filter((chave) => !lote.some((e) => e.chave === chave));
      tiradas += fora.length;
      marcar(fora, null);
      if (lote.length === 0) continue;

      marcar(
        lote.map((e) => e.chave),
        "enviando",
      );
      let parcial;
      try {
        parcial = await gravarEscolhasDoPdf({
          empreendimentoId,
          slug,
          caminhoStaging,
          escolhas: lote.map((e) => ({ indice: Number(e.chave), tipo: e.tipo, capa: e.capa })),
        });
      } catch {
        parcial = null;
      }
      if (!parcial || !parcial.ok) {
        erroGeral = parcial?.erro ?? "A conexão caiu no meio do envio.";
        perdidas = lote.length + fila.filter((chave) => escolhasAgora.current[chave]?.incluir).length;
        marcar(
          lote.map((e) => e.chave),
          "falhou",
        );
        break;
      }
      resultado.gravadas += parcial.gravadas;
      resultado.duplicadas += parcial.duplicadas;
      resultado.falhas.push(...parcial.falhas);
      resultado.plantas.push(...parcial.plantas);
      for (const item of parcial.porItem) {
        const chave = String(item.indice);
        marcar([chave], item.desfecho === "falhou" ? "falhou" : "entrou");
        // O que entrou sai da lista: enviar de novo não o repete.
        if (item.desfecho !== "falhou")
          setEscolhas((atual) => (atual[chave] ? { ...atual, [chave]: { ...atual[chave], incluir: false, capa: false } } : atual));
      }
    }

    const final: ResultadoImportacao = {
      entraram: resultado.gravadas,
      // O que um erro geral deixou sem enviar também ficou de fora.
      falharam: resultado.falhas.length + perdidas,
      linhas: [
        resultado.gravadas > 0
          ? `${resultado.gravadas} ${resultado.gravadas === 1 ? "imagem adicionada" : "imagens adicionadas"}.`
          : "",
        resultado.duplicadas > 0
          ? `${resultado.duplicadas} ${resultado.duplicadas === 1 ? "já estava" : "já estavam"} na galeria.`
          : "",
        tiradas > 0 ? `${tiradas} ${tiradas === 1 ? "tirada" : "tiradas"} da lista antes de enviar.` : "",
        parar.current ? "Envio parado." : "",
        erroGeral ?? "",
        ...resultado.falhas,
      ].filter(Boolean),
    };
    setResultadoFinal(final);
    avisar(tituloDoResultado(final), final.entraram === 0 && final.falharam > 0 ? "erro" : "ok");

    // Cada planta vira a tipologia que ela representa — é dela que o bot
    // tira dormitórios, suítes e metragem para responder ao cliente. Uma
    // por vez: cada leitura é uma ida ao modelo com a imagem junto.
    if (resultado.plantas.length > 0) {
      setEtapa("lendoPlantas");
      const nomes: string[] = [];
      const problemas: string[] = [];

      for (const [i, planta] of resultado.plantas.entries()) {
        setTipologias(`Lendo planta ${i + 1} de ${resultado.plantas.length}…`);
        const lida = await gerarTipologiaDaPlanta({
          empreendimentoId,
          slug,
          caminhoStaging,
          indice: planta.indice,
          plantaUrl: planta.url,
        });
        if (lida.ok) nomes.push(lida.nome);
        else problemas.push(`Planta ${planta.indice + 1}: ${lida.erro}.`);
      }

      setTipologias(
        [
          nomes.length > 0
            ? `${nomes.length} ${nomes.length === 1 ? "planta virou tipologia" : "plantas viraram tipologias"}: ${nomes.join(", ")}.`
            : "Nenhuma planta virou tipologia.",
          ...problemas,
        ].join(" "),
      );
    }

    // Com erro no meio, o PDF e a grade ficam: o que entrou já saiu da lista,
    // e tentar de novo manda só o resto.
    if (erroGeral) {
      setEtapa("parado");
      return;
    }

    // Só agora a apresentação pode ir embora: era dela que saía o texto com
    // o nome e a metragem de cada planta.
    await descartarPdfDeImportacao(caminhoStaging);

    setEtapa("parado");
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
          aviso: item.pareceGrafismo
            ? "Parece letreiro ou logo, não foto"
            : item.parecePaginaInteira
              ? "Parece a página inteira da apresentação"
              : undefined,
          estado: estados[String(item.indice)],
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
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-acento px-5 py-2.5 text-fluid-xs font-bold text-sobre-cor shadow-md shadow-acento/20 transition-all active:scale-95 cursor-pointer"
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
            className="w-full min-h-[48px] rounded-xl bg-acento px-5 text-fluid-xs font-bold text-sobre-cor shadow-md shadow-acento/20 transition-all active:scale-95 disabled:opacity-60"
          >
            {etapa === "gravando"
              ? "Adicionando ao imóvel…"
              : etapa === "lendoPlantas"
                ? "Lendo as plantas…"
                : "Adicionar ao imóvel"}
          </button>
          {etapa === "gravando" ? (
            <>
              <p className="text-fluid-xs text-apoio">
                Ainda dá para tirar da fila: toque em “Tirar da fila” na imagem que ainda não foi enviada.
              </p>
              <button
                type="button"
                onClick={() => {
                  parar.current = true;
                }}
                className="w-full min-h-[44px] rounded-xl border border-linha-forte px-5 text-fluid-xs font-bold text-corpo"
              >
                Parar o envio
              </button>
            </>
          ) : null}
        </>
      ) : null}

      {resumo ? (
        <p role="status" className="text-fluid-xs text-corpo">
          {resumo}
        </p>
      ) : null}

      {resultadoFinal ? <ResultadoDaImportacao resultado={resultadoFinal} slug={slug} /> : null}

      {tipologias ? (
        <p role="status" className="text-fluid-xs text-corpo">
          {tipologias}
        </p>
      ) : null}

      {rascunho ? (
        <RascunhoCadastro rascunho={rascunho} atual={cadastroAtual} aoAplicar={salvarRascunho} />
      ) : null}

      {avisoRascunho ? <p className="text-fluid-xs text-apoio">{avisoRascunho}</p> : null}
      {rascunhoSalvo ? (
        <p role="status" className="text-fluid-xs text-corpo">
          {rascunhoSalvo}
        </p>
      ) : null}
    </div>
  );
}
