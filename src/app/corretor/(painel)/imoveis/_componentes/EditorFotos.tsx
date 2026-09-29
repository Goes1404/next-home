"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import type { Midia } from "@/lib/types";
import {
  uploadFotoOuPlanta,
  removerMidiaImovel,
  definirFotoComoCapa,
  definirTipoDaMidia,
  salvarOrdemDasFotos,
} from "../actions";
import { Check } from 'lucide-react';
import { moverPara, useArrastarParaOrdenar } from "../../_componentes/useArrastarParaOrdenar";
import { IconeAlca } from "../../_componentes/IconeAlca";
import { TEXTO_DO_SALVAMENTO, useSalvarSozinho } from "../../_componentes/useSalvarSozinho";

interface Props {
  empreendimentoId: string;
  slug: string;
  midiasIniciais: Midia[];
}

export function EditorFotos({ empreendimentoId, slug, midiasIniciais }: Props) {
  const [midias, setMidias] = useState<Midia[]>(midiasIniciais);
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState<React.ReactNode | null>(null);
  // Qual cartão está esperando o servidor — trava os botões dele e só dele.
  const [ocupado, setOcupado] = useState<string | null>(null);
  const inputUploadRef = useRef<HTMLInputElement>(null);
  /** A sequência que o banco tem — é contra ela que "mudou a ordem" se mede. */
  const [ordemSalva, setOrdemSalva] = useState<string[]>(() => idsDasImagens(midiasIniciais));
  const [erroOrdem, setErroOrdem] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setEnviando(true);
    setMensagem(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("arquivo", file);
        formData.append("tipo", "foto");
        formData.append("alt", `Foto ${midias.length + i + 1}`);

        const res = await uploadFotoOuPlanta(empreendimentoId, slug, formData);
        if (res.ok && res.midia) {
          const nova: Midia = {
            // Sem o id, a foto recém-enviada não podia ser removida nem
            // marcada como planta até alguém recarregar a página.
            id: res.midia.id ?? undefined,
            tipo: res.midia.tipo,
            url: res.midia.url,
            alt: res.midia.alt,
            // null = o sharp não conseguiu medir (o pior caso documentado é
            // foto sem medida); 0 mantém o contrato de Midia sem inventar.
            largura: res.midia.largura ?? 0,
            altura: res.midia.altura ?? 0,
            blurDataUrl: res.midia.blur_data_url,
          };
          setMidias((prev) => [...prev, nova]);
          // Entra no fim da tela; a sequência salva ganha o mesmo fim, senão
          // toda foto nova acenderia "ordem alterada" sem ninguém ter mexido.
          if (nova.id) setOrdemSalva((prev) => [...prev, nova.id!]);
        }
      }
      setMensagem(<><Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> Foto(s) adicionada(s) com sucesso!</>);
      setTimeout(() => setMensagem(null), 4000);
    } catch (err) {
      console.error(err);
      setMensagem(<>❌ Erro ao enviar foto. Tente novamente.</>);
    } finally {
      setEnviando(false);
      if (inputUploadRef.current) inputUploadRef.current.value = "";
    }
  };

  const avisar = (texto: React.ReactNode, ms = 3000) => {
    setMensagem(texto);
    setTimeout(() => setMensagem(null), ms);
  };

  const handleDefinirCapa = async (midia: Midia) => {
    // A versão anterior só reordenava a TELA e anunciava "Capa atualizada" —
    // a action existia, era importada, e ninguém a chamava. No reload a capa
    // antiga voltava. Primeiro o servidor confirma, depois a tela obedece.
    if (!midia.id) {
      avisar(<>Recarregue a página antes de trocar a capa desta foto.</>, 4000);
      return;
    }
    setOcupado(midia.url);
    const daTela = idsDasImagens(midias);
    const res = await definirFotoComoCapa(empreendimentoId, midia.id, slug, daTela).catch(() => ({
      ok: false as const,
      erro: "Sem resposta do servidor. Tente de novo.",
    }));
    setOcupado(null);
    if (!res.ok) {
      avisar(<>{res.erro ?? "Não foi possível definir a capa agora."}</>, 4000);
      return;
    }
    setMidias((prev) => [midia, ...prev.filter((m) => m.url !== midia.url)]);
    // A capa grava a tela inteira (com ela na frente), então o que estava
    // pendente de ordem também foi salvo.
    setOrdemSalva([midia.id, ...daTela.filter((id) => id !== midia.id)]);
    avisar(<><Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> Capa principal atualizada!</>);
  };

  const handleTrocarTipo = async (midia: Midia) => {
    const novoTipo = midia.tipo === "planta" ? "foto" : "planta";
    if (!midia.id) {
      avisar(<>Recarregue a página antes de mudar esta imagem.</>, 4000);
      return;
    }
    setOcupado(midia.url);
    const res = await definirTipoDaMidia(midia.id, novoTipo, slug).catch(() => ({
      ok: false as const,
      erro: "Sem resposta do servidor. Tente de novo.",
    }));
    setOcupado(null);
    if (!res.ok) {
      avisar(<>{res.erro ?? "Não foi possível mudar o tipo da imagem agora."}</>, 4000);
      return;
    }
    setMidias((prev) => prev.map((m) => (m.url === midia.url ? { ...m, tipo: novoTipo } : m)));
    avisar(
      novoTipo === "planta" ? (
        <><Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> Marcada como planta — a assistente já pode mandá-la.</>
      ) : (
        <><Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> Voltou a ser foto da galeria.</>
      ),
      4000,
    );
  };

  /**
   * Troca a imagem de lugar com a vizinha na grade. Só a TELA muda: a
   * sequência vai ao banco no botão "Salvar ordem", porque arrumar a galeria
   * são várias trocas seguidas e gravar cada uma derrubaria o cache do site
   * no meio do arranjo.
   */
  const mover = (midia: Midia, direcao: -1 | 1) => {
    setMidias((prev) => {
      const imgs = prev.filter(ehImagem);
      const i = imgs.findIndex((m) => m.url === midia.url);
      const alvo = i + direcao;
      if (i < 0 || alvo < 0 || alvo >= imgs.length) return prev;
      const nova = [...imgs];
      [nova[i], nova[alvo]] = [nova[alvo], nova[i]];
      return [...nova, ...prev.filter((m) => !ehImagem(m))];
    });
  };

  const arrasto = useArrastarParaOrdenar({
    escopo: "fotos-do-imovel",
    aoMover: (de, para) =>
      setMidias((prev) => [...moverPara(prev.filter(ehImagem), de, para), ...prev.filter((m) => !ehImagem(m))]),
  });

  /**
   * Grava a sequência da tela. Quem chama é `useSalvarSozinho`, pouco depois
   * da última mudança e nunca no meio de um arrasto.
   */
  const salvarOrdem = async (): Promise<boolean> => {
    const ids = idsDasImagens(midias);
    if (ids.length !== midias.filter(ehImagem).length) {
      setErroOrdem("Recarregue a página antes de ordenar — há foto recém-enviada sem identificação.");
      return false;
    }
    const res = await salvarOrdemDasFotos(empreendimentoId, slug, ids).catch(() => ({
      ok: false as const,
      erro: "Sem resposta do servidor. Tente de novo.",
    }));
    if (!res.ok) {
      setErroOrdem(res.erro ?? "Não foi possível salvar a ordem das fotos.");
      return false;
    }
    setOrdemSalva(ids);
    setErroOrdem(null);
    return true;
  };

  const desfazerOrdem = () => {
    setMidias((prev) => {
      const porId = new Map(prev.filter((m) => m.id).map((m) => [m.id!, m]));
      const naOrdem = ordemSalva.map((id) => porId.get(id)).filter((m): m is Midia => Boolean(m));
      const resto = prev.filter((m) => !m.id || !ordemSalva.includes(m.id));
      return [...naOrdem, ...resto];
    });
  };

  const salvamento = useSalvarSozinho({
    chave: idsDasImagens(midias).join("|"),
    chaveSalva: ordemSalva.join("|"),
    pausado: arrasto.arrastando !== null,
    salvar: salvarOrdem,
  });

  const handleRemover = async (midia: Midia) => {
    if (!confirm("Tem certeza que deseja remover esta foto?")) return;

    // A versão anterior só removia do ESTADO e anunciava "Foto removida!" —
    // a foto continuava no banco e ressuscitava no reload. Primeiro o
    // servidor confirma, depois a tela obedece.
    const res = await removerMidiaImovel(midia.id ?? "", midia.url, slug);
    if (!res.ok) {
      setMensagem(<>Não foi possível remover agora. Tente novamente.</>);
      setTimeout(() => setMensagem(null), 4000);
      return;
    }

    setMidias((prev) => prev.filter((m) => m.url !== midia.url));
    if (midia.id) setOrdemSalva((prev) => prev.filter((id) => id !== midia.id));
    setMensagem(<><Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> Foto removida!</>);
    setTimeout(() => setMensagem(null), 3000);
  };

  // Vídeo e tour 360° são link de terceiro e têm aba própria; aqui só entra
  // o que é imagem. A capa é a primeira FOTO — planta nunca é capa, é o que
  // o mapper faz na vitrine (`capa: fotos[0]`), e a tela tem de dizer o mesmo.
  const imagens = midias.filter(ehImagem);
  const urlDaCapa = imagens.find((m) => m.tipo === "foto")?.url ?? null;
  const totalPlantas = imagens.filter((m) => m.tipo === "planta").length;

  return (
    <div className="space-y-6">
      {mensagem && (
        <div className="p-3.5 rounded-2xl bg-ok-lavado border border-ok-linha text-ok text-fluid-xs font-bold">
          {mensagem}
        </div>
      )}

      {/* Botões de Ação para Celular */}
      <div className="cartao flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5">
        <div>
          <h3 className="text-fluid-base font-bold text-titulo">Galeria de Fotos do Imóvel</h3>
          <p className="text-fluid-xs text-apoio mt-0.5">
            A 1ª foto é a <strong>Capa Principal</strong> na vitrine e nos cards do WhatsApp. Arraste
            pela alça <span aria-hidden>⠿</span> (ou use ◀ ▶) para mudar a sequência do site — salva sozinho.
          </p>
          <p className="text-fluid-xs text-apoio mt-1 break-words">
            Veio uma planta no meio das fotos? Toque em <strong>É planta</strong> — é assim que a
            assistente consegue mandá-la quando o cliente pedir.
            {totalPlantas > 0 && (
              <> Hoje: {totalPlantas} {totalPlantas === 1 ? "planta" : "plantas"}.</>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={inputUploadRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleUpload}
            className="hidden"
            id="input-foto-upload"
          />

          <label
            htmlFor="input-foto-upload"
            className="w-full sm:w-auto min-h-[48px] px-5 py-2.5 rounded-xl bg-acento hover:bg-acento-hover text-sobre-cor text-fluid-xs font-bold transition-all shadow-md shadow-acento/20 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            {enviando ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-linha-forte border-t-white animate-spin" />
                <span>Enviando Foto...</span>
              </>
            ) : (
              <>
                <span>📸 Tirar Foto / Galeria</span>
              </>
            )}
          </label>
        </div>
      </div>

      {imagens.length > 1 && (
        <div className="flex min-h-11 flex-wrap items-center gap-3" role="status" aria-live="polite">
          <p
            className={`text-fluid-xs ${
              salvamento.estado === "erro"
                ? "text-perigo"
                : salvamento.estado === "salvo"
                  ? "text-acento"
                  : "text-apoio"
            }`}
          >
            {salvamento.estado === "erro" && erroOrdem ? erroOrdem : TEXTO_DO_SALVAMENTO[salvamento.estado]}
          </p>
          {salvamento.estado === "erro" && (
            <>
              <button
                type="button"
                onClick={salvamento.tentarDeNovo}
                className="min-h-11 rounded-xl bg-acento px-4 text-fluid-xs font-bold text-sobre-cor hover:bg-acento-hover"
              >
                Tentar de novo
              </button>
              <button
                type="button"
                onClick={desfazerOrdem}
                className="min-h-11 rounded-xl px-3 text-fluid-xs font-semibold text-apoio hover:text-titulo"
              >
                Voltar à ordem salva
              </button>
            </>
          )}
        </div>
      )}

      {/* Grade Visual de Fotos */}
      {imagens.length === 0 ? (
        <div className="p-12 text-center rounded-3xl border border-dashed border-linha-forte bg-elevado space-y-3">
          <span className="text-4xl block">🖼️</span>
          <h4 className="text-fluid-base font-bold text-corpo">Nenhuma foto cadastrada</h4>
          <p className="text-fluid-xs text-tenue max-w-sm mx-auto">
            Toque no botão acima para tirar fotos do imóvel no stand ou selecionar fotos da sua galeria.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {imagens.map((midia, posicao) => {
            const ehCapa = midia.url === urlDaCapa;
            const ehPlanta = midia.tipo === "planta";
            const travado = ocupado === midia.url;
            return (
              <div
                key={midia.url}
                {...arrasto.item(posicao)}
                className={`group relative rounded-2xl overflow-hidden border transition-all ${
                  arrasto.arrastando === posicao ? "z-10 scale-[1.03] shadow-xl ring-2 ring-acento " : ""
                }${
                  ehCapa
                    ? "border-acento ring-acento ring-2"
                    : "border-linha hover:border-linha-forte"
                }`}
              >
                {/* Imagem */}
                <div className="aspect-[4/3] relative bg-campo">
                  <Image
                    src={midia.url}
                    alt={midia.alt || (ehPlanta ? "Planta do imóvel" : "Foto do imóvel")}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-cover"
                  />

                  {ehPlanta && (
                    <span className="absolute top-2 left-2 px-2.5 py-1 rounded-lg bg-realce text-sobre-cor text-[11px] font-bold shadow-md">
                      Planta
                    </span>
                  )}

                  {/* Alça de arrastar: o único ponto com touch-none, para o resto
                      da foto continuar rolando a página com o dedo. */}
                  <button
                    type="button"
                    {...arrasto.alca(posicao)}
                    aria-label="Arrastar para outra posição"
                    title="Arrastar para outra posição"
                    className="absolute right-2 top-2 flex min-h-11 min-w-11 cursor-grab touch-none items-center justify-center rounded-lg bg-black/60 text-white hover:bg-black/80 active:cursor-grabbing"
                  >
                    <IconeAlca className="h-5 w-5" />
                  </button>

                  {/* Setas sobre a foto: sem ocupar a linha de ações do cartão estreito */}
                  <div className="absolute bottom-2 right-2 flex gap-1">
                    <button
                      type="button"
                      onClick={() => mover(midia, -1)}
                      disabled={posicao === 0}
                      aria-label="Mover para antes"
                      title="Mover para antes"
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-black/60 text-white hover:bg-black/80 disabled:opacity-30"
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      onClick={() => mover(midia, 1)}
                      disabled={posicao === imagens.length - 1}
                      aria-label="Mover para depois"
                      title="Mover para depois"
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-black/60 text-white hover:bg-black/80 disabled:opacity-30"
                    >
                      ▶
                    </button>
                  </div>

                  {/* Badge de Capa */}
                  {ehCapa && (
                    <span className="absolute top-2 left-2 px-2.5 py-1 rounded-lg bg-acento text-sobre-cor text-[10px] font-bold shadow-md flex items-center gap-1">
                      ⭐ Capa Principal
                    </span>
                  )}
                </div>

                {/* Ações Rápidas de 1 Toque — quebram linha no cartão estreito do celular */}
                <div className="p-2 bg-superficie flex flex-wrap items-center gap-1.5">
                  {ehCapa ? (
                    <span className="text-[11px] text-acento-suave font-bold px-2 py-1">
                      Foto Destaque
                    </span>
                  ) : !ehPlanta ? (
                    <button
                      type="button"
                      disabled={travado}
                      onClick={() => handleDefinirCapa(midia)}
                      className="min-h-11 px-2.5 rounded-lg bg-vidro hover:bg-acento hover:text-sobre-cor text-corpo text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Definir Capa
                    </button>
                  ) : null}

                  <button
                    type="button"
                    disabled={travado}
                    aria-pressed={ehPlanta}
                    onClick={() => handleTrocarTipo(midia)}
                    title={ehPlanta ? "Voltar a ser foto da galeria" : "Marcar esta imagem como planta"}
                    className={`min-h-11 px-2.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                      ehPlanta
                        ? "bg-realce text-sobre-cor hover:opacity-90"
                        : "bg-vidro hover:bg-vidro-forte text-corpo"
                    }`}
                  >
                    {travado ? "Salvando…" : ehPlanta ? "É foto" : "É planta"}
                  </button>

                  <button
                    type="button"
                    disabled={travado}
                    onClick={() => handleRemover(midia)}
                    title="Excluir Foto"
                    aria-label="Excluir imagem"
                    className="ml-auto min-h-11 min-w-11 flex items-center justify-center rounded-lg disabled:opacity-50 bg-perigo-lavado hover:bg-perigo text-perigo hover:text-titulo transition-colors cursor-pointer"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ehImagem(m: Midia): boolean {
  return m.tipo === "foto" || m.tipo === "planta";
}

function idsDasImagens(midias: Midia[]): string[] {
  return midias.filter(ehImagem).flatMap((m) => (m.id ? [m.id] : []));
}
