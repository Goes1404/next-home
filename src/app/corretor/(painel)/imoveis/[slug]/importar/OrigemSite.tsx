"use client";

import { useEffect, useRef, useState } from "react";
import type { RascunhoCadastro as Rascunho } from "@/lib/imoveis/rascunhoDePdf";
import { adicionarMidiaExterna } from "../../actions";
import {
  analisarSite,
  aplicarRascunhoNoCadastro,
  gerarTipologiaDaPlantaDoSite,
  sugerirCadastroDoSite,
  trazerImagemDoSite,
  type AnaliseDoSite,
} from "./acoes";
import { GradeCuradoria, type EscolhaCuradoria, type ItemDaGrade } from "./GradeCuradoria";
import { RascunhoCadastro } from "./RascunhoCadastro";

/** Três de cada vez, como no Drive: rápido e sem abrir dezenas de conexões. */
const EM_PARALELO = 3;

type Analise = Extract<AnaliseDoSite, { ok: true }>;

/**
 * Aba do site da construtora.
 *
 * O corretor cola o link da página do empreendimento. A página é lida no
 * servidor (`analisarSite`), e três blocos aparecem: os dados do cadastro
 * propostos pela IA, as fotos e plantas para marcar, e os vídeos e tours.
 * Nada é gravado sem ele marcar, e só o que foi marcado é baixado.
 */
export function OrigemSite({
  empreendimentoId,
  slug,
  cadastroAtual,
  linkInicial,
}: {
  empreendimentoId: string;
  slug: string;
  cadastroAtual: Record<string, unknown>;
  /** Vindo do cadastro de imóvel novo: a página é lida sozinha ao abrir. */
  linkInicial?: string;
}) {
  const [link, setLink] = useState(linkInicial ?? "");
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, EscolhaCuradoria>>({});
  const [midiasMarcadas, setMidiasMarcadas] = useState<Record<string, boolean>>({});
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [avisoRascunho, setAvisoRascunho] = useState<string | null>(null);
  const [rascunhoSalvo, setRascunhoSalvo] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number; etapa: string } | null>(null);
  const [falhas, setFalhas] = useState<string[]>([]);
  const [resumo, setResumo] = useState<string | null>(null);

  const ler = async () => {
    setErro(null);
    setAnalise(null);
    setRascunho(null);
    setAvisoRascunho(null);
    setRascunhoSalvo(null);
    setFalhas([]);
    setResumo(null);
    setProgresso(null);
    setLendo(true);

    let resultado: AnaliseDoSite;
    try {
      resultado = await analisarSite({ url: link, empreendimentoId });
    } catch {
      setLendo(false);
      setErro("Não consegui ler a página agora. Confira sua conexão e tente de novo.");
      return;
    }
    setLendo(false);

    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }

    setAnalise(resultado);
    setEscolhas(
      Object.fromEntries(
        resultado.imagens.map((img) => [
          img.url,
          { chave: img.url, incluir: img.sugerida, tipo: img.parecePlanta ? "planta" : "foto", capa: false },
        ]),
      ),
    );
    setMidiasMarcadas(Object.fromEntries(resultado.midias.map((m) => [m.url, !m.jaCadastrada])));

    // Depois das imagens e sem travar a tela: a IA é o elo que pode demorar
    // ou estar fora do ar, e a curadoria das fotos não depende dela.
    if (!resultado.montadaPorJs) {
      void sugerirCadastroDoSite({ texto: resultado.texto, dicas: resultado.dicas })
        .then((sugestao) => {
          if (sugestao.ok) setRascunho(sugestao.rascunho);
          else setAvisoRascunho(sugestao.aviso);
        })
        .catch(() => setAvisoRascunho("Não consegui ler os dados da página agora. As fotos continuam disponíveis."));
    }
  };

  // Quem acabou de criar o imóvel pelo link já decidiu ler esta página: pedir
  // um segundo toque seria perguntar de novo o que ele acabou de responder.
  const jaLeuOInicial = useRef(false);
  useEffect(() => {
    if (!linkInicial || jaLeuOInicial.current) return;
    jaLeuOInicial.current = true;
    void ler();
    // `ler` muda a cada render; o que importa é rodar UMA vez com o link inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkInicial]);

  const salvarRascunho = async (aceitos: Partial<Rascunho>) => {
    try {
      const resultado = await aplicarRascunhoNoCadastro({ empreendimentoId, slug, aceitos });
      setRascunhoSalvo(
        resultado.ok
          ? `${Object.keys(aceitos).length} ${Object.keys(aceitos).length === 1 ? "campo salvo" : "campos salvos"} no cadastro.`
          : (resultado.erro ?? "Não consegui salvar agora."),
      );
      if (resultado.ok) setRascunho(null);
    } catch {
      setRascunhoSalvo("Não consegui salvar agora. Confira sua conexão e tente de novo.");
    }
  };

  const trazer = async () => {
    if (!analise) return;

    const imagensEscolhidas = Object.values(escolhas).filter((e) => e.incluir);
    const midiasEscolhidas = analise.midias.filter((m) => midiasMarcadas[m.url] && !m.jaCadastrada);
    const total = imagensEscolhidas.length + midiasEscolhidas.length;
    if (total === 0) {
      setResumo("Marque pelo menos uma foto, planta, vídeo ou tour.");
      return;
    }

    setFalhas([]);
    setResumo(null);
    const problemas: string[] = [];
    const plantasTrazidas: string[] = [];
    let fotos = 0;
    let plantas = 0;
    let duplicadas = 0;
    let feitos = 0;
    setProgresso({ feitos, total, etapa: "Trazendo" });

    // ─── Fotos e plantas, três de cada vez ────────────────────────────────
    const fila = [...imagensEscolhidas];
    const trabalhador = async () => {
      for (;;) {
        const escolha = fila.shift();
        if (!escolha) return;
        const imagem = analise.imagens.find((i) => i.url === escolha.chave);
        if (!imagem) continue;

        try {
          const r = await trazerImagemDoSite({
            empreendimentoId,
            slug,
            url: imagem.url,
            legenda: imagem.legenda,
            tipo: escolha.tipo,
            capa: escolha.capa,
          });
          if (!r.ok) problemas.push(`${imagem.legenda || "Imagem"}: ${r.erro ?? "não veio"}`);
          else if (r.duplicada) duplicadas++;
          else if (escolha.tipo === "planta") {
            plantas++;
            if (r.url) plantasTrazidas.push(r.url);
          } else fotos++;
        } catch {
          problemas.push(`${imagem.legenda || "Imagem"}: a conexão caiu no meio`);
        }
        feitos++;
        setProgresso({ feitos, total, etapa: "Trazendo" });
      }
    };
    await Promise.all(Array.from({ length: Math.min(EM_PARALELO, fila.length) }, trabalhador));

    // ─── Vídeos e tours: só o link é guardado ─────────────────────────────
    let midias = 0;
    for (const midia of midiasEscolhidas) {
      try {
        const r = await adicionarMidiaExterna(empreendimentoId, slug, {
          tipo: midia.tipo,
          url: midia.url,
          titulo: midia.titulo,
        });
        if (r.ok) midias++;
        else problemas.push(`${midia.titulo}: ${r.erro ?? "não entrou"}`);
      } catch {
        problemas.push(`${midia.titulo}: a conexão caiu no meio`);
      }
      feitos++;
      setProgresso({ feitos, total, etapa: "Trazendo" });
    }

    // ─── Planta vira tipologia (a ficha que a assistente lê) ──────────────
    // Uma por vez: cada leitura é uma ida ao modelo com a imagem.
    let tipologias = 0;
    for (const [i, plantaUrl] of plantasTrazidas.entries()) {
      setProgresso({ feitos: i, total: plantasTrazidas.length, etapa: "Lendo as plantas" });
      try {
        const r = await gerarTipologiaDaPlantaDoSite({ empreendimentoId, slug, plantaUrl, texto: analise.texto });
        if (r.ok) tipologias++;
        else problemas.push(`Planta ${i + 1}: ${r.erro}`);
      } catch {
        problemas.push(`Planta ${i + 1}: a conexão caiu no meio`);
      }
    }

    setProgresso(null);
    setFalhas(problemas);
    setResumo(
      [
        fotos > 0 ? `${fotos} ${fotos === 1 ? "foto adicionada" : "fotos adicionadas"}.` : "",
        plantas > 0 ? `${plantas} ${plantas === 1 ? "planta adicionada" : "plantas adicionadas"}.` : "",
        tipologias > 0 ? `${tipologias} ${tipologias === 1 ? "planta virou ficha" : "plantas viraram ficha"} (dormitórios e metragem).` : "",
        midias > 0 ? `${midias} ${midias === 1 ? "vídeo ou tour adicionado" : "vídeos e tours adicionados"}.` : "",
        duplicadas > 0 ? `${duplicadas} ${duplicadas === 1 ? "já estava" : "já estavam"} na galeria.` : "",
      ]
        .filter(Boolean)
        .join(" ") || "Nada novo entrou.",
    );
  };

  const itens: ItemDaGrade[] =
    analise?.imagens.map((img) => ({
      chave: img.url,
      preview: img.url,
      legenda: img.legenda || "Imagem da página",
    })) ?? [];

  const trabalhando = progresso !== null;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="link-do-site" className="block text-fluid-xs text-apoio">
          Cole o link da página do empreendimento no site da construtora.
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="link-do-site"
            type="url"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://construtora.com.br/…"
            className="flex-1 min-h-[48px] min-w-0 rounded-xl border border-linha bg-campo px-4 text-fluid-xs text-corpo"
          />
          <button
            type="button"
            onClick={() => void ler()}
            disabled={lendo || trabalhando || link.trim().length === 0}
            className="min-h-[48px] rounded-xl bg-acento px-5 text-fluid-xs font-bold text-sobre-cor shadow-md shadow-acento/20 transition-all active:scale-95 disabled:opacity-60"
          >
            {lendo ? "Lendo a página…" : "Ler a página"}
          </button>
        </div>
      </div>

      {erro ? (
        <p role="alert" className="rounded-2xl border border-linha bg-elevado p-4 text-fluid-xs text-corpo">
          {erro}
        </p>
      ) : null}

      {analise?.montadaPorJs ? (
        <p role="status" className="rounded-2xl border border-linha bg-elevado p-4 text-fluid-xs text-corpo">
          Esta página é montada pelo navegador depois que abre, e por isso chegou quase vazia para mim. Use a aba de
          PDF ou a do Drive com o material que a construtora mandou.
        </p>
      ) : null}

      {analise ? (
        <p className="text-fluid-xs text-apoio break-words">
          Lido: <strong className="text-corpo">{analise.titulo || analise.urlFinal}</strong>
        </p>
      ) : null}

      {avisoRascunho ? <p className="text-fluid-xs text-apoio">{avisoRascunho}</p> : null}
      {rascunho ? <RascunhoCadastro rascunho={rascunho} atual={cadastroAtual} aoAplicar={salvarRascunho} /> : null}
      {rascunhoSalvo ? (
        <p role="status" className="text-fluid-xs text-corpo">
          {rascunhoSalvo}
        </p>
      ) : null}

      {analise && analise.midias.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-fluid-sm font-bold text-titulo">Vídeos e tours 3D</h3>
          <ul className="space-y-2">
            {analise.midias.map((m) => (
              <li key={m.url}>
                <label className="flex min-h-[44px] items-center gap-3 rounded-xl border border-linha bg-campo px-4 py-2">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-[var(--color-acento)]"
                    checked={Boolean(midiasMarcadas[m.url]) && !m.jaCadastrada}
                    disabled={m.jaCadastrada}
                    onChange={(e) => setMidiasMarcadas({ ...midiasMarcadas, [m.url]: e.target.checked })}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-fluid-xs font-bold text-corpo">
                      {m.titulo}
                      {m.jaCadastrada ? <span className="ml-2 font-normal text-apoio">já está no imóvel</span> : null}
                    </span>
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-fluid-xs text-acento underline decoration-transparent hover:decoration-current"
                    >
                      {m.url}
                    </a>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {analise && itens.length === 0 && !analise.montadaPorJs ? (
        <p className="text-fluid-xs text-apoio">Não encontrei foto nesta página.</p>
      ) : null}

      {itens.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-fluid-sm font-bold text-titulo">Fotos e plantas</h3>
          <p className="text-fluid-xs text-apoio">
            Já marquei as que parecem deste empreendimento e separei as plantas. Confira: a página às vezes mostra
            outros imóveis da construtora.
          </p>
          <GradeCuradoria itens={itens} escolhas={escolhas} aoMudar={setEscolhas} />
        </section>
      ) : null}

      {analise && (itens.length > 0 || analise.midias.length > 0) ? (
        <div className="space-y-2">
          <p className="text-fluid-xs text-apoio">
            As fotos são da construtora: traga só as de imóveis que a Next Home representa.
          </p>
          <button
            type="button"
            onClick={() => void trazer()}
            disabled={trabalhando}
            className="w-full min-h-[48px] rounded-xl bg-acento px-5 text-fluid-xs font-bold text-sobre-cor shadow-md shadow-acento/20 transition-all active:scale-95 disabled:opacity-60"
          >
            {progresso ? `${progresso.etapa}… ${progresso.feitos} de ${progresso.total}` : "Trazer os marcados"}
          </button>
        </div>
      ) : null}

      {resumo ? (
        <p role="status" className="text-fluid-xs text-corpo">
          {resumo}
        </p>
      ) : null}

      {falhas.length > 0 ? (
        <ul role="alert" className="space-y-1 text-fluid-xs text-corpo break-words">
          {falhas.map((falha) => (
            <li key={falha}>{falha}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
