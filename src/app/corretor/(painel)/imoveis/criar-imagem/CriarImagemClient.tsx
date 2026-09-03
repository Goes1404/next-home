"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { excluirImagem } from "./acoes";
import { RECEITAS, RECEITA_PADRAO, receitaPor } from "@/lib/imagens/receitas";
import {
  CANAIS,
  LIMITE_APOIO,
  LIMITE_TITULO,
  OBJETIVOS,
  PUBLICOS,
  canalPor,
  objetivoPor,
  publicoPor,
  type ChaveCanal,
  type ChaveObjetivo,
  type ChavePublico,
} from "@/lib/imagens/marketing";
import {
  QUALIDADES,
  TAMANHOS,
  type ChaveQualidade,
  type ChaveTamanho,
  type EstadoDoTeto,
  type ImagemGerada,
} from "@/lib/imagens/imagensTipos";

/**
 * Duas portas, e a de marketing é a principal.
 *
 * **Arte para publicar**: imóvel → objetivo → canal → público → "montar
 * briefing". O código decide assunto, luz e composição a partir da ficha; a
 * IA escreve cena e copy dentro da régua; tudo volta para a tela ANTES de
 * custar uma imagem, editável. Só então "criar arte" — e o que sai já vem com
 * a logo, o nome real do imóvel e a chamada permitida, no tamanho do canal.
 *
 * **Imagem livre**: a receita + descrição de antes. Continua existindo porque
 * "mobiliar um cômodo vazio" não é peça de marketing e é útil do mesmo jeito.
 *
 * A foto de referência (modo livre) sobe DIRETO do navegador para o Storage
 * e só o caminho vai para a rota — o padrão de `importar/OrigemPdf.tsx`.
 */

const BUCKET = "empreendimentos";
const TETO_REFERENCIA_BYTES = 15 * 1024 * 1024;

export type ImovelDaLista = {
  slug: string;
  nome: string;
  lugar: string;
  estagio: string;
  temFoto: boolean;
};

type Direcao = {
  cena: string;
  copy: { titulo: string; apoio: string; cta: string };
  origem: { cena: "ia" | "briefing"; copy: "ia" | "mista" | "reserva" };
  problemasDaIa: string[];
  regrasAplicadas: string[];
  fotoDeReferencia: string | null;
  ctasPermitidas: string[];
};

const chip = (ativa: boolean) =>
  `text-fluid-xs min-h-11 cursor-pointer rounded-full border px-3.5 transition-colors disabled:opacity-50 ${
    ativa
      ? "border-acento-linha bg-acento text-sobre-cor font-medium"
      : "border-linha-forte text-corpo hover:border-acento-linha hover:text-titulo"
  }`;

const campo =
  "text-fluid-sm border-linha-forte bg-campo text-corpo placeholder:text-tenue focus:border-acento-linha w-full rounded-xl border px-3 py-2.5 outline-none transition-colors disabled:opacity-50";

export function CriarImagemClient({
  corretorId,
  imoveis,
  iniciais,
  tetoInicial,
}: {
  corretorId: string;
  imoveis: ImovelDaLista[];
  iniciais: ImagemGerada[];
  tetoInicial: EstadoDoTeto;
}) {
  const [modo, setModo] = useState<"arte" | "livre">("arte");
  const [imagens, setImagens] = useState(iniciais);
  const [teto, setTeto] = useState(tetoInicial);
  const [gerando, setGerando] = useState(false);
  const [qualidade, setQualidade] = useState<ChaveQualidade>("low");
  const [, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  // ---- arte
  const [imovelSlug, setImovelSlug] = useState<string>(imoveis[0]?.slug ?? "");
  const [objetivo, setObjetivo] = useState<ChaveObjetivo>("lancamento");
  const [canal, setCanal] = useState<ChaveCanal>("feed");
  const [publico, setPublico] = useState<ChavePublico>("familia");
  const [observacoes, setObservacoes] = useState("");
  const [montando, setMontando] = useState(false);
  const [direcao, setDirecao] = useState<Direcao | null>(null);
  const [cena, setCena] = useState("");
  const [titulo, setTitulo] = useState("");
  const [apoio, setApoio] = useState("");
  const [cta, setCta] = useState("");
  const [usarFotoReal, setUsarFotoReal] = useState(true);
  const [verRegras, setVerRegras] = useState(false);

  // ---- livre
  const [prompt, setPrompt] = useState("");
  const [receita, setReceita] = useState(RECEITA_PADRAO);
  const [antesDeMelhorar, setAntesDeMelhorar] = useState<string | null>(null);
  const [melhorando, setMelhorando] = useState(false);
  const [tamanho, setTamanho] = useState<ChaveTamanho>(receitaPor(RECEITA_PADRAO).tamanhoSugerido);
  const [referencia, setReferencia] = useState<{ path: string; url: string } | null>(null);
  const [enviandoRef, setEnviandoRef] = useState(false);
  const campoArquivo = useRef<HTMLInputElement>(null);

  const restam = Math.max(0, teto.teto - teto.usadasHoje);
  const imovelEscolhido = imoveis.find((i) => i.slug === imovelSlug) ?? null;
  const objetivoAtual = objetivoPor(objetivo);
  const canalAtual = canalPor(canal);
  const publicoAtual = publicoPor(publico);
  const receitaAtual = receitaPor(receita);
  const faltaFoto = receitaAtual.precisaFoto && !referencia;

  const podeMontar = !montando && !gerando;
  const podeCriarArte =
    Boolean(direcao) && cena.trim().length > 0 && titulo.trim().length > 0 && cta.trim().length > 0 && restam > 0 && !gerando && !montando;
  const podeGerarLivre = prompt.trim().length > 0 && restam > 0 && !gerando && !melhorando && !faltaFoto;
  const podeMelhorar = prompt.trim().length > 0 && !melhorando && !gerando;

  /** Trocar qualquer escolha invalida o briefing: ele foi feito para outra peça. */
  function escolher<T>(setar: (v: T) => void) {
    return (v: T) => {
      setar(v);
      setDirecao(null);
    };
  }

  async function montarBriefing() {
    if (!podeMontar) return;
    setMontando(true);
    try {
      const r = await fetch("/api/imagens/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imovelSlug: imovelSlug || null,
          objetivo,
          canal,
          publico,
          observacoes: observacoes.trim() || undefined,
        }),
      });
      const corpo = await r.json();
      if (!r.ok) {
        falhar(corpo.erro ?? "Não deu para montar o briefing.");
        return;
      }
      const d = corpo as Direcao;
      setDirecao(d);
      setCena(d.cena);
      setTitulo(d.copy.titulo);
      setApoio(d.copy.apoio);
      setCta(d.copy.cta);
      setUsarFotoReal(Boolean(d.fotoDeReferencia));
      if (d.problemasDaIa.length > 0) {
        avisar(`A IA escreveu fora da régua (${d.problemasDaIa.join("; ")}) — esse campo veio da ficha.`);
      } else if (d.origem.copy === "reserva") {
        avisar("A IA não respondeu agora. Cena e copy vieram da ficha — dá para editar.");
      }
    } catch {
      falhar("Não deu para montar o briefing. Confira a conexão.");
    } finally {
      setMontando(false);
    }
  }

  async function criarArte() {
    if (!podeCriarArte) return;
    setGerando(true);
    try {
      const r = await fetch("/api/imagens/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modo: "arte",
          imovelSlug: imovelSlug || null,
          objetivo,
          canal,
          publico,
          cena: cena.trim(),
          titulo: titulo.trim(),
          apoio: apoio.trim(),
          cta: cta.trim(),
          usarFotoReal,
          qualidade,
        }),
      });
      const corpo = await r.json();
      if (!r.ok) {
        falhar(corpo.erro ?? "Não deu para criar a arte.");
        if (corpo.teto) setTeto(corpo.teto);
        return;
      }
      setImagens((atuais) => [corpo.imagem, ...atuais]);
      setTeto(corpo.teto);
      avisar(corpo.imagem?.arteUrl ? "Arte pronta para publicar" : "Imagem criada (a arte não pôde ser composta)");
    } catch {
      falhar("Não deu para criar a arte. Confira a conexão.");
    } finally {
      setGerando(false);
    }
  }

  // ---- modo livre (como antes)

  function escolherReceita(chave: string) {
    setReceita(chave);
    setTamanho(receitaPor(chave).tamanhoSugerido);
  }

  async function subirReferencia(arquivo: File) {
    if (arquivo.size > TETO_REFERENCIA_BYTES) {
      falhar("A foto passa de 15 MB. Use uma menor.");
      return;
    }
    setEnviandoRef(true);
    try {
      const supabase = createClient();
      const ext = arquivo.name.split(".").pop()?.toLowerCase() || "png";
      const path = `corretores/${corretorId}/referencias/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, arquivo, { contentType: arquivo.type || "image/png", upsert: true });
      if (error) {
        falhar("Não deu para enviar a foto. Confira a conexão.");
        return;
      }
      setReferencia({ path, url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl });
    } finally {
      setEnviandoRef(false);
    }
  }

  async function melhorar() {
    if (!podeMelhorar) return;
    setMelhorando(true);
    const original = prompt.trim();
    try {
      const r = await fetch("/api/imagens/melhorar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: original, receita }),
      });
      const corpo = await r.json();
      if (!r.ok) {
        falhar(corpo.erro ?? "Não deu para melhorar a descrição.");
        return;
      }
      if (!corpo.melhorado) {
        avisar("A IA não respondeu agora. Sua descrição continua como estava.");
        return;
      }
      setAntesDeMelhorar(original);
      setPrompt(corpo.texto);
    } catch {
      falhar("Não deu para melhorar a descrição. Confira a conexão.");
    } finally {
      setMelhorando(false);
    }
  }

  async function gerarLivre() {
    if (!podeGerarLivre) return;
    setGerando(true);
    try {
      const r = await fetch("/api/imagens/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modo: "livre",
          prompt: prompt.trim(),
          receita,
          tamanho,
          qualidade,
          referenciaPath: referencia?.path ?? null,
        }),
      });
      const corpo = await r.json();
      if (!r.ok) {
        falhar(corpo.erro ?? "Não deu para gerar a imagem.");
        if (corpo.teto) setTeto(corpo.teto);
        return;
      }
      setImagens((atuais) => [corpo.imagem, ...atuais]);
      setTeto(corpo.teto);
      avisar("Imagem criada");
    } catch {
      falhar("Não deu para gerar a imagem. Confira a conexão.");
    } finally {
      setGerando(false);
    }
  }

  function excluir(id: string) {
    const anterior = imagens;
    setImagens((atuais) => atuais.filter((i) => i.id !== id));
    iniciar(async () => {
      try {
        const r = await excluirImagem(id);
        if (r.erro) {
          setImagens(anterior);
          falhar(r.erro);
        }
      } catch {
        setImagens(anterior);
        falhar("Não deu para excluir. Confira a conexão.");
      }
    });
  }

  const contadorTeto = (
    <span className="text-fluid-xs text-tenue tabular-nums">
      {restam > 0 ? `${restam} de ${teto.teto} hoje` : "Limite de hoje atingido"}
    </span>
  );

  return (
    <div className="space-y-5">
      {/* As duas portas. Marketing na frente: é o que a tela existe para fazer. */}
      <div role="tablist" className="flex gap-2">
        {(
          [
            ["arte", "Arte para publicar"],
            ["livre", "Imagem livre"],
          ] as const
        ).map(([chave, rotulo]) => (
          <button
            key={chave}
            role="tab"
            type="button"
            aria-selected={modo === chave}
            onClick={() => setModo(chave)}
            className={chip(modo === chave)}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {modo === "arte" ? (
        <section className="border-linha bg-superficie shadow-painel space-y-4 rounded-2xl border p-4 sm:p-5">
          <label className="block space-y-1.5">
            <span className="text-fluid-xs text-apoio">Imóvel</span>
            <select
              value={imovelSlug}
              disabled={gerando || montando}
              onChange={(e) => escolher(setImovelSlug)(e.target.value)}
              className={`${campo} min-h-11 cursor-pointer`}
            >
              <option value="">Sem imóvel — peça institucional</option>
              {imoveis.map((i) => (
                <option key={i.slug} value={i.slug}>
                  {i.nome} · {i.lugar} · {i.estagio}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="space-y-1.5">
            <legend className="text-fluid-xs text-apoio mb-1.5">Objetivo da peça</legend>
            <div className="flex flex-wrap gap-2">
              {OBJETIVOS.map((o) => (
                <button key={o.chave} type="button" aria-pressed={o.chave === objetivo} disabled={gerando || montando} onClick={() => escolher(setObjetivo)(o.chave)} className={chip(o.chave === objetivo)}>
                  {o.rotulo}
                </button>
              ))}
            </div>
            <p className="text-fluid-xs text-tenue">{objetivoAtual.ajuda}</p>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="text-fluid-xs text-apoio mb-1.5">Canal</legend>
            <div className="flex flex-wrap gap-2">
              {CANAIS.map((c) => (
                <button key={c.chave} type="button" aria-pressed={c.chave === canal} disabled={gerando || montando} onClick={() => escolher(setCanal)(c.chave)} className={chip(c.chave === canal)}>
                  {c.rotulo} · {c.arte.largura}×{c.arte.altura}
                </button>
              ))}
            </div>
            <p className="text-fluid-xs text-tenue">{canalAtual.ajuda}</p>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="text-fluid-xs text-apoio mb-1.5">Para quem</legend>
            <div className="flex flex-wrap gap-2">
              {PUBLICOS.map((p) => (
                <button key={p.chave} type="button" aria-pressed={p.chave === publico} disabled={gerando || montando} onClick={() => escolher(setPublico)(p.chave)} className={chip(p.chave === publico)}>
                  {p.rotulo}
                </button>
              ))}
            </div>
            <p className="text-fluid-xs text-tenue">{publicoAtual.ajuda}</p>
          </fieldset>

          <label className="block space-y-1.5">
            <span className="text-fluid-xs text-apoio">Algo a mais? (opcional)</span>
            <input
              value={observacoes}
              disabled={gerando || montando}
              onChange={(e) => escolher(setObservacoes)(e.target.value)}
              placeholder="ex.: destacar a varanda, tom mais sóbrio"
              className={`${campo} min-h-11`}
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void montarBriefing()}
              disabled={!podeMontar}
              aria-busy={montando}
              className={`text-fluid-sm min-h-12 cursor-pointer rounded-xl px-4 font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${
                direcao ? "border-linha-forte text-corpo hover:border-acento-linha border" : "bg-acento text-sobre-cor hover:bg-acento-hover"
              }`}
            >
              {montando ? "Montando…" : direcao ? "Montar de novo" : "Montar briefing"}
            </button>
            <span className="text-fluid-xs text-tenue">Não gasta imagem do seu limite.</span>
          </div>

          {direcao && (
            <div className="border-linha space-y-4 border-t pt-4">
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setVerRegras((v) => !v)}
                  aria-expanded={verRegras}
                  className="text-fluid-xs text-acento-suave hover:text-titulo min-h-9 cursor-pointer underline underline-offset-4"
                >
                  {verRegras ? "Esconder" : "Ver"} as {direcao.regrasAplicadas.length} regras aplicadas
                </button>
                {verRegras && (
                  <ul className="text-fluid-xs text-apoio list-disc space-y-1 pl-5">
                    {direcao.regrasAplicadas.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>

              <label className="block space-y-1.5">
                <span className="text-fluid-xs text-apoio">
                  A cena {direcao.origem.cena === "ia" ? "(escrita pela IA dentro do briefing)" : "(do briefing — a IA não respondeu)"}
                </span>
                <textarea value={cena} rows={5} disabled={gerando} onChange={(e) => setCena(e.target.value)} className={`${campo} resize-y`} />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-fluid-xs text-apoio flex justify-between">
                    <span>Título</span>
                    <span className="tabular-nums">{titulo.length}/{LIMITE_TITULO}</span>
                  </span>
                  <input value={titulo} maxLength={LIMITE_TITULO} disabled={gerando} onChange={(e) => setTitulo(e.target.value)} className={`${campo} min-h-11`} />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-fluid-xs text-apoio flex justify-between">
                    <span>Apoio</span>
                    <span className="tabular-nums">{apoio.length}/{LIMITE_APOIO}</span>
                  </span>
                  <input value={apoio} maxLength={LIMITE_APOIO} disabled={gerando} onChange={(e) => setApoio(e.target.value)} className={`${campo} min-h-11`} />
                </label>
              </div>

              <div className="flex flex-wrap gap-3">
                <label className="text-fluid-xs text-apoio flex flex-col gap-1">
                  Chamada
                  <select value={cta} disabled={gerando} onChange={(e) => setCta(e.target.value)} className="text-fluid-sm border-linha-forte bg-campo text-corpo min-h-11 cursor-pointer rounded-lg border px-3">
                    {direcao.ctasPermitidas.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="text-fluid-xs text-apoio flex flex-col gap-1">
                  Capricho
                  <select value={qualidade} disabled={gerando} onChange={(e) => setQualidade(e.target.value as ChaveQualidade)} className="text-fluid-sm border-linha-forte bg-campo text-corpo min-h-11 cursor-pointer rounded-lg border px-3">
                    {QUALIDADES.map((q) => (
                      <option key={q.chave} value={q.chave}>{q.rotulo}</option>
                    ))}
                  </select>
                </label>
                {direcao.fotoDeReferencia && (
                  <label className="text-fluid-xs text-corpo flex min-h-11 items-center gap-2 self-end">
                    <input type="checkbox" checked={usarFotoReal} disabled={gerando} onChange={(e) => setUsarFotoReal(e.target.checked)} className="accent-acento h-4 w-4" />
                    Partir da foto real do imóvel
                  </label>
                )}
              </div>

              <p className="text-fluid-xs text-tenue">
                Sem valor, sem prazo não cadastrado, sem promessa de valorização — a régua de publicidade
                imobiliária vale aqui mesmo se você editar. Toda arte leva a ressalva de imagem ilustrativa.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void criarArte()}
                  disabled={!podeCriarArte}
                  aria-busy={gerando}
                  className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm min-h-12 flex-1 cursor-pointer rounded-xl px-4 font-medium transition-colors disabled:cursor-wait disabled:opacity-60 sm:flex-none"
                >
                  {gerando ? "Criando a arte… até um minuto" : `Criar arte para ${canalAtual.rotulo}`}
                </button>
                {contadorTeto}
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="border-linha bg-superficie shadow-painel space-y-3 rounded-2xl border p-4 sm:p-5">
          <fieldset className="space-y-2">
            <legend className="text-fluid-xs text-apoio mb-1.5">O que você quer fazer</legend>
            <div className="flex flex-wrap gap-2">
              {RECEITAS.map((r) => (
                <button key={r.chave} type="button" aria-pressed={r.chave === receita} disabled={gerando || melhorando} onClick={() => escolherReceita(r.chave)} className={chip(r.chave === receita)}>
                  {r.rotulo}
                </button>
              ))}
            </div>
            <p className="text-fluid-xs text-tenue">{receitaAtual.ajuda}</p>
          </fieldset>

          <label className="block">
            <span className="so-para-leitor">O que você quer na imagem</span>
            <textarea
              value={prompt}
              rows={3}
              disabled={gerando || melhorando}
              onChange={(e) => {
                setPrompt(e.target.value);
                if (antesDeMelhorar) setAntesDeMelhorar(null);
              }}
              placeholder={receitaAtual.exemplo}
              className={`${campo} resize-y`}
            />
          </label>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <button type="button" onClick={() => void melhorar()} disabled={!podeMelhorar} aria-busy={melhorando} className="text-fluid-xs border-linha-forte text-corpo hover:border-acento-linha hover:text-titulo min-h-11 cursor-pointer rounded-full border px-3.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50">
              {melhorando ? "Escrevendo…" : "Melhorar descrição com IA"}
            </button>
            {antesDeMelhorar ? (
              <button type="button" onClick={() => { setPrompt(antesDeMelhorar); setAntesDeMelhorar(null); }} className="text-fluid-xs text-apoio hover:text-titulo min-h-11 cursor-pointer px-1 underline underline-offset-4">
                Voltar ao que eu escrevi
              </button>
            ) : (
              !melhorando && <span className="text-fluid-xs text-tenue">Não gasta imagem do seu limite.</span>
            )}
          </div>

          {referencia && (
            <div className="border-acento-linha bg-acento-lavado flex items-center gap-3 rounded-xl border p-2">
              <Image src={referencia.url} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-lg object-cover" unoptimized />
              <span className="text-fluid-xs text-acento-suave flex-1">Partindo desta foto.</span>
              <button type="button" onClick={() => setReferencia(null)} className="text-fluid-xs text-apoio hover:text-titulo min-h-11 shrink-0 cursor-pointer px-3">Tirar</button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <label className="text-fluid-xs text-apoio flex flex-col gap-1">
              Formato
              <select value={tamanho} disabled={gerando} onChange={(e) => setTamanho(e.target.value as ChaveTamanho)} className="text-fluid-sm border-linha-forte bg-campo text-corpo min-h-11 cursor-pointer rounded-lg border px-3">
                {TAMANHOS.map((t) => (<option key={t.chave} value={t.chave}>{t.rotulo}</option>))}
              </select>
            </label>
            <label className="text-fluid-xs text-apoio flex flex-col gap-1">
              Capricho
              <select value={qualidade} disabled={gerando} onChange={(e) => setQualidade(e.target.value as ChaveQualidade)} className="text-fluid-sm border-linha-forte bg-campo text-corpo min-h-11 cursor-pointer rounded-lg border px-3">
                {QUALIDADES.map((q) => (<option key={q.chave} value={q.chave}>{q.rotulo}</option>))}
              </select>
            </label>
            <label className="text-fluid-xs text-apoio flex flex-col gap-1">
              Foto de partida
              <span className="border-linha-forte text-corpo hover:border-acento-linha inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-3">
                {enviandoRef ? "Enviando…" : referencia ? "Trocar foto" : "Anexar foto"}
                <input ref={campoArquivo} type="file" accept="image/*" disabled={gerando || enviandoRef} onChange={(e) => { const a = e.target.files?.[0]; if (a) void subirReferencia(a); e.target.value = ""; }} className="sr-only" />
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void gerarLivre()} disabled={!podeGerarLivre} aria-busy={gerando} className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm min-h-12 flex-1 cursor-pointer rounded-xl px-4 font-medium transition-colors disabled:cursor-wait disabled:opacity-60 sm:flex-none">
              {gerando ? "Criando… pode levar até um minuto" : "Criar imagem"}
            </button>
            {contadorTeto}
          </div>

          {faltaFoto && (
            <p className="text-fluid-xs text-alerta">
              {receitaAtual.rotulo} parte de uma foto sua — anexe uma acima. Sem ela sairia um ambiente qualquer, sem relação com o imóvel.
            </p>
          )}

          <p className="text-fluid-xs text-apoio border-linha border-t pt-3">
            Confira letreiros e números antes de usar: o modelo inventa nome de prédio, placa e texto na arte, sempre com cara de verdadeiro.
          </p>
        </section>
      )}

      {imagens.length === 0 ? (
        <p className="text-fluid-sm text-apoio border-linha bg-superficie rounded-2xl border p-6 text-center">
          Nada criado ainda. O que sair daqui fica só com você — não entra no catálogo do imóvel nem aparece no site.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {imagens.map((img) => {
            const mostrar = img.arteUrl ?? img.url;
            const legenda = img.briefing
              ? `${objetivoPor(img.briefing.objetivo).rotulo} · ${canalPor(img.briefing.canal).rotulo}${img.briefing.imovelNome ? ` · ${img.briefing.imovelNome}` : ""}`
              : img.prompt;
            return (
              <li key={img.id} className="border-linha bg-superficie space-y-2 overflow-hidden rounded-2xl border p-2">
                <a href={mostrar} target="_blank" rel="noreferrer" className="block">
                  <Image src={mostrar} alt={img.briefing?.titulo || img.prompt} width={img.largura ?? 1024} height={img.altura ?? 1024} className="aspect-square w-full rounded-xl object-cover" unoptimized />
                </a>
                <p className="text-fluid-xs text-apoio line-clamp-2 px-1">{legenda}</p>
                <div className="flex flex-wrap gap-1 px-1 pb-1">
                  {img.arteUrl && (
                    <a href={img.arteUrl} target="_blank" rel="noreferrer" className="text-fluid-xs bg-acento text-sobre-cor hover:bg-acento-hover min-h-9 rounded-lg px-2.5 leading-9 font-medium">
                      Baixar arte
                    </a>
                  )}
                  <a href={img.url} target="_blank" rel="noreferrer" className="text-fluid-xs text-corpo hover:text-titulo min-h-9 px-2 leading-9">
                    {img.arteUrl ? "Sem texto" : "Abrir"}
                  </a>
                  <button type="button" onClick={() => { setModo("livre"); setReferencia({ path: caminhoDaUrl(img.url), url: img.url }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-fluid-xs text-corpo hover:text-titulo min-h-9 cursor-pointer px-2">
                    Usar como referência
                  </button>
                  <button type="button" onClick={() => excluir(img.id)} className="text-fluid-xs text-apoio hover:text-perigo min-h-9 cursor-pointer px-2">
                    Excluir
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** O caminho dentro do bucket, a partir da URL pública. */
function caminhoDaUrl(url: string): string {
  const marca = `/public/${BUCKET}/`;
  const i = url.indexOf(marca);
  return i < 0 ? "" : url.slice(i + marca.length);
}
