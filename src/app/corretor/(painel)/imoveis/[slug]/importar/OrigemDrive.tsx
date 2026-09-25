"use client";

import { useEffect, useRef, useState } from "react";
import type { ArquivoDrive } from "@/lib/imoveis/drive";
import { listarMaterialDoDrive, trazerArquivoDoDrive } from "./acoes";
import { GradeCuradoria, type EscolhaCuradoria, type ItemDaGrade } from "./GradeCuradoria";
import { ResultadoDaImportacao, tituloDoResultado, type ResultadoImportacao } from "./ResultadoDaImportacao";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";

/** Três de cada vez: rápido o bastante e sem abrir dezenas de conexões. */
const EM_PARALELO = 3;

/**
 * Aba da pasta do Drive.
 *
 * Nada é baixado para curar: a grade usa o thumbnail que o próprio Google
 * devolve na listagem, e a transferência só acontece para o que o corretor
 * escolheu. Pasta de 40 fotos em que ele quer 12 transfere 12.
 */
export function OrigemDrive({ empreendimentoId, slug }: { empreendimentoId: string; slug: string }) {
  const [link, setLink] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [arquivos, setArquivos] = useState<ArquivoDrive[] | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, EscolhaCuradoria>>({});
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const [falhas, setFalhas] = useState<string[]>([]);
  const [resumo, setResumo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const { avisar } = useAvisos();
  const [buscando, setBuscando] = useState(false);
  const [estados, setEstados] = useState<Record<string, NonNullable<ItemDaGrade["estado"]>>>({});

  // O envio lê a lista NA HORA em que cada foto sai, por ref: estado de React
  // dentro do laço é o do render em que ele começou.
  const escolhasAgora = useRef(escolhas);
  const parar = useRef(false);
  useEffect(() => {
    escolhasAgora.current = escolhas;
  }, [escolhas]);

  const buscar = async () => {
    setErro(null);
    setFalhas([]);
    setResumo(null);
    setResultado(null);
    setProgresso(null);
    setEstados({});
    setBuscando(true);

    const resultado = await listarMaterialDoDrive(link);
    setBuscando(false);

    if (!resultado.ok) {
      setErro(resultado.erro);
      setArquivos(null);
      return;
    }

    setArquivos(resultado.arquivos);
    setEscolhas(
      Object.fromEntries(
        resultado.arquivos
          .filter((a) => !a.ehVideo)
          .map((a) => [a.id, { chave: a.id, incluir: true, tipo: "foto" as const, capa: false }]),
      ),
    );
  };

  const trazer = async () => {
    if (!arquivos) return;

    const escolhidos = Object.values(escolhas).filter((e) => e.incluir);
    if (escolhidos.length === 0) {
      setResumo("Marque pelo menos uma foto.");
      return;
    }

    let totalAgora = escolhidos.length;
    setProgresso({ feitos: 0, total: totalAgora });
    setFalhas([]);
    setResumo(null);
    setResultado(null);
    parar.current = false;
    setEstados(Object.fromEntries(escolhidos.map((e) => [e.chave, "fila" as const])));
    const marcar = (chave: string, estado: NonNullable<ItemDaGrade["estado"]> | null) =>
      setEstados((atual) => {
        const proximo = { ...atual };
        if (estado) proximo[chave] = estado;
        else delete proximo[chave];
        return proximo;
      });

    const fila = escolhidos.map((e) => e.chave);
    const problemas: string[] = [];
    let feitos = 0;
    let entraram = 0;
    let duplicadas = 0;
    let tiradas = 0;

    const trabalhador = async () => {
      for (;;) {
        const chave = fila.shift();
        if (!chave) return;
        // Tipo, capa e o próprio "incluir" valem como estão AGORA na tela.
        const escolha = escolhasAgora.current[chave];
        if (parar.current || !escolha?.incluir) {
          marcar(chave, null);
          tiradas++;
          totalAgora--;
          setProgresso({ feitos, total: totalAgora });
          continue;
        }

        const arquivo = arquivos.find((a) => a.id === chave);
        if (!arquivo) continue;
        marcar(chave, "enviando");

        try {
          const resultado = await trazerArquivoDoDrive({
            empreendimentoId,
            slug,
            arquivoId: arquivo.id,
            nome: arquivo.nome,
            tipo: escolha.tipo,
            capa: escolha.capa,
          });
          marcar(chave, resultado.ok ? "entrou" : "falhou");
          if (!resultado.ok) problemas.push(`${arquivo.nome}: ${resultado.erro ?? "não veio"}`);
          else {
            if (resultado.duplicada) duplicadas++;
            else entraram++;
            // O que entrou sai da lista: "Trazer" de novo não o repete.
            setEscolhas((atual) => ({ ...atual, [chave]: { ...escolha, incluir: false, capa: false } }));
          }
        } catch {
          marcar(chave, "falhou");
          problemas.push(`${arquivo.nome}: a conexão caiu no meio`);
        }

        feitos++;
        setProgresso({ feitos, total: totalAgora });
      }
    };

    await Promise.all(Array.from({ length: Math.min(EM_PARALELO, escolhidos.length) }, trabalhador));

    setProgresso(null);
    setFalhas(problemas);
    const final: ResultadoImportacao = {
      entraram,
      falharam: problemas.length,
      linhas: [
        entraram > 0 ? `${entraram} ${entraram === 1 ? "foto adicionada" : "fotos adicionadas"}.` : "",
        duplicadas > 0 ? `${duplicadas} ${duplicadas === 1 ? "já estava" : "já estavam"} na galeria.` : "",
        tiradas > 0 ? `${tiradas} ${tiradas === 1 ? "tirada" : "tiradas"} da lista antes de enviar.` : "",
        parar.current ? "Envio parado." : "",
      ].filter(Boolean),
    };
    setResultado(final);
    avisar(tituloDoResultado(final), final.entraram === 0 && final.falharam > 0 ? "erro" : "ok");
  };

  const videos = arquivos?.filter((a) => a.ehVideo) ?? [];
  const itens: ItemDaGrade[] =
    arquivos
      ?.filter((a) => !a.ehVideo)
      .map((a) => ({
        chave: a.id,
        preview: a.thumbnail ?? "",
        legenda: a.nome,
        estado: estados[a.id],
      })) ?? [];

  const transferindo = progresso !== null;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="link-do-drive" className="block text-fluid-xs text-apoio">
          Cole o link da pasta que a construtora compartilhou. A pasta precisa estar aberta para quem tem o link.
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="link-do-drive"
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://drive.google.com/…"
            className="flex-1 min-h-[48px] rounded-xl border border-linha bg-campo px-4 text-fluid-xs text-corpo"
          />
          <button
            type="button"
            onClick={() => void buscar()}
            disabled={buscando || link.trim().length === 0}
            className="min-h-[48px] rounded-xl bg-acento px-5 text-fluid-xs font-bold text-sobre-cor shadow-md shadow-acento/20 transition-all active:scale-95 disabled:opacity-60"
          >
            {buscando ? "Abrindo a pasta…" : "Ver o que tem"}
          </button>
        </div>
      </div>

      {erro ? (
        <p role="alert" className="text-fluid-xs text-corpo">
          {erro}
        </p>
      ) : null}

      {videos.length > 0 ? (
        <p className="rounded-2xl border border-linha bg-elevado p-4 text-fluid-xs text-apoio">
          {videos.length === 1 ? "Tem 1 vídeo nesta pasta" : `Tem ${videos.length} vídeos nesta pasta`} (
          {videos.map((v) => v.nome).join(", ")}). Suba no YouTube e cole o link na aba de mídias do imóvel — vídeo
          pesado direto no site trava no celular do cliente.
        </p>
      ) : null}

      {arquivos && itens.length === 0 ? (
        <p className="text-fluid-xs text-apoio">Não encontrei foto nenhuma nesta pasta.</p>
      ) : null}

      {itens.length > 0 ? (
        <>
          <GradeCuradoria itens={itens} escolhas={escolhas} aoMudar={setEscolhas} />

          <button
            type="button"
            onClick={() => void trazer()}
            disabled={transferindo}
            className="w-full min-h-[48px] rounded-xl bg-acento px-5 text-fluid-xs font-bold text-sobre-cor shadow-md shadow-acento/20 transition-all active:scale-95 disabled:opacity-60"
          >
            {transferindo ? `Trazendo… ${progresso.feitos} de ${progresso.total}` : "Trazer as selecionadas"}
          </button>
          {transferindo ? (
            <>
              <p className="text-fluid-xs text-apoio">
                Ainda dá para tirar da fila: toque em “Tirar da fila” na foto que ainda não foi enviada.
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

      {resultado ? <ResultadoDaImportacao resultado={resultado} slug={slug} /> : null}

      {falhas.length > 0 ? (
        <ul role="alert" className="space-y-1 text-fluid-xs text-corpo">
          {falhas.map((falha) => (
            <li key={falha}>{falha}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
