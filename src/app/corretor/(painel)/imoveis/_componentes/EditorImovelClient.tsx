"use client";

import { useState } from "react";
import type { Empreendimento, Tipologia } from "@/lib/types";
import { EditorFotos } from "./EditorFotos";
import { EditorTextos } from "./EditorTextos";
import { EditorLazer } from "./EditorLazer";
import { EditorTipologias } from "./EditorTipologias";
import { EditorBook } from "./EditorBook";
import { EditorMidiasExternas } from "./EditorMidiasExternas";
import { BarraSalvarFlutuante } from "./BarraSalvarFlutuante";
import { salvarDadosGerais, salvarLazerEmpreendimento } from "../actions";
import { Check } from "lucide-react";

interface Props {
  imovel: Empreendimento;
}

export function EditorImovelClient({ imovel }: Props) {
  const [abaAtiva, setAbaAtiva] = useState<"fotos" | "textos" | "book" | "midia" | "plantas" | "lazer">("fotos");
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState<React.ReactNode | null>(null);
  const [feedbackTipo, setFeedbackTipo] = useState<"sucesso" | "erro" | null>(null);

  // Estados do formulário
  const [dadosGerais, setDadosGerais] = useState({
    nome: imovel.nome,
    nomesAlternativos: imovel.nomesAlternativos ?? [],
    tagline: imovel.tagline || "",
    descricao: imovel.descricao || "",
    precoAPartir: imovel.precoAPartir,
    condominioValor: imovel.condominioValor,
    iptu: imovel.iptu,
    status: imovel.status,
    tipo: imovel.tipo,
    finalidade: imovel.finalidade,
    cidade: imovel.cidade,
    bairro: imovel.bairro,
    endereco: imovel.endereco || "",
    entregaPrevista: imovel.entregaPrevista,
    destaque: imovel.destaque,
    publicado: Boolean(imovel.publicado ?? true),
  });

  const [lazer, setLazer] = useState<string[]>(imovel.lazer || []);
  const [tipologias, setTipologias] = useState<Tipologia[]>(imovel.tipologias || []);

  const handleCampoGeralChange = (campo: string, valor: any) => {
    setDadosGerais((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleToggleLazer = (nomeItem: string) => {
    setLazer((prev) =>
      prev.includes(nomeItem) ? prev.filter((i) => i !== nomeItem) : [...prev, nomeItem],
    );
  };

  const handleAdicionarTipologia = () => {
    const nova: Tipologia = {
      id: `temp-${Date.now()}`,
      nome: "Nova Planta",
      areaPrivativa: 80,
      dormitorios: 2,
      suites: 2,
      banheiros: 2,
      vagas: 2,
      preco: null,
      plantaUrl: null,
      unidadesDisponiveis: null,
    };
    setTipologias((prev) => [...prev, nova]);
  };

  const handleRemoverTipologia = (index: number) => {
    setTipologias((prev) => prev.filter((_, i) => i !== index));
  };

  const handleTipologiaChange = (index: number, campo: keyof Tipologia, valor: any) => {
    setTipologias((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [campo]: valor };
      return copy;
    });
  };

  const handleSalvarTudo = async () => {
    setSalvando(true);
    setFeedback(null);
    setFeedbackTipo(null);

    try {
      const imovelId = imovel.id || imovel.slug;
      // 1. Salva dados gerais
      const resGerais = await salvarDadosGerais(imovelId, imovel.slug, dadosGerais);
      if (!resGerais.ok) throw new Error(resGerais.erro || "Falha ao salvar dados");

      // 2. Salva características de lazer
      await salvarLazerEmpreendimento(imovelId, imovel.slug, lazer);

      setFeedbackTipo("sucesso");
      setFeedback(<><Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> Todas as alterações foram salvas com sucesso no catálogo!</>);
      setTimeout(() => { setFeedback(null); setFeedbackTipo(null); }, 4000);
    } catch (err) {
      console.error(err);
      setFeedbackTipo("erro");
      // `unknown` no catch é o padrão do TypeScript moderno; `any` aqui
      // deixava `err.message` passar sem ninguém garantir que existe.
      const motivo = err instanceof Error ? err.message : "";
      setFeedback(<>❌ Erro: {motivo || "Não foi possível salvar agora."}</>);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-6 pb-28">
      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-fluid-xs font-bold ${
            feedbackTipo === "sucesso"
              ? "bg-ok-lavado border-ok-linha text-ok"
              : "bg-perigo-lavado border-perigo-linha text-perigo"
          }`}
        >
          {feedback}
        </div>
      )}

      {/* Abas Horizontais com Toque Grande para Mobile */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-2 border-b border-linha">
        <button
          type="button"
          onClick={() => setAbaAtiva("fotos")}
          className={`min-h-[44px] px-5 py-2.5 rounded-xl text-fluid-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-2 ${
            abaAtiva === "fotos"
              ? "bg-acento text-sobre-cor shadow-md shadow-acento/20"
              : "bg-vidro text-apoio hover:text-titulo"
          }`}
        >
          <span>📸 Fotos & Capa</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-vidro-forte">
            {imovel.midias?.length || 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("textos")}
          className={`min-h-[44px] px-5 py-2.5 rounded-xl text-fluid-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-2 ${
            abaAtiva === "textos"
              ? "bg-acento text-sobre-cor shadow-md shadow-acento/20"
              : "bg-vidro text-apoio hover:text-titulo"
          }`}
        >
          <span>✍️ Informações & Preços</span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("book")}
          className={`min-h-[44px] px-5 py-2.5 rounded-xl text-fluid-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-2 ${
            abaAtiva === "book"
              ? "bg-acento text-sobre-cor shadow-md shadow-acento/20"
              : "bg-vidro text-apoio hover:text-titulo"
          }`}
        >
          <span>📑 Book Digital (PDF)</span>
          {imovel.bookUrl && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-ok-lavado text-ok border border-ok-linha">
              PDF Ativo
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("midia")}
          className={`min-h-[44px] px-5 py-2.5 rounded-xl text-fluid-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-2 ${
            abaAtiva === "midia"
              ? "bg-acento text-sobre-cor shadow-md shadow-acento/20"
              : "bg-vidro text-apoio hover:text-titulo"
          }`}
        >
          <span>🎬 Vídeos & Tour 3D</span>
          {(imovel.videos?.length || 0) + (imovel.tours360?.length || 0) > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-vidro-forte">
              {(imovel.videos?.length || 0) + (imovel.tours360?.length || 0)}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("lazer")}
          className={`min-h-[44px] px-5 py-2.5 rounded-xl text-fluid-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-2 ${
            abaAtiva === "lazer"
              ? "bg-acento text-sobre-cor shadow-md shadow-acento/20"
              : "bg-vidro text-apoio hover:text-titulo"
          }`}
        >
          <span>🏊 Lazer & Diferenciais</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-vidro-forte">{lazer.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("plantas")}
          className={`min-h-[44px] px-5 py-2.5 rounded-xl text-fluid-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-2 ${
            abaAtiva === "plantas"
              ? "bg-acento text-sobre-cor shadow-md shadow-acento/20"
              : "bg-vidro text-apoio hover:text-titulo"
          }`}
        >
          <span>📐 Plantas & Metragens</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-vidro-forte">
            {tipologias.length}
          </span>
        </button>
      </div>

      {/* Conteúdo da Aba Ativa */}
      <div className=" duration-200">
        {abaAtiva === "fotos" && (
          <EditorFotos
            empreendimentoId={imovel.id || imovel.slug}
            slug={imovel.slug}
            midiasIniciais={imovel.midias || imovel.galeria || []}
          />
        )}

        {abaAtiva === "textos" && (
          <EditorTextos
            dados={dadosGerais}
            onChange={handleCampoGeralChange}
            contexto={{
              tipologias,
              lazer,
              construtora: imovel.construtora,
              totalUnidades: imovel.totalUnidades,
              totalTorres: imovel.totalTorres,
            }}
          />
        )}

        {abaAtiva === "book" && (
          <EditorBook
            empreendimentoId={imovel.id || imovel.slug}
            slug={imovel.slug}
            bookUrlInicial={imovel.bookUrl}
            bookTituloInicial={imovel.bookTitulo}
          />
        )}

        {abaAtiva === "midia" && (
          <EditorMidiasExternas
            empreendimentoId={imovel.id || imovel.slug}
            slug={imovel.slug}
            midiasIniciais={imovel.midias || []}
          />
        )}

        {abaAtiva === "lazer" && (
          <EditorLazer lazerSelecionado={lazer} onToggle={handleToggleLazer} />
        )}

        {abaAtiva === "plantas" && (
          <EditorTipologias
            tipologias={tipologias}
            onAdicionar={handleAdicionarTipologia}
            onRemover={handleRemoverTipologia}
            onChange={handleTipologiaChange}
          />
        )}
      </div>

      {/* Barra de Salvar Fixa no Rodapé (Mobile Sticky Bar) */}
      <BarraSalvarFlutuante
        salvando={salvando}
        onSalvar={handleSalvarTudo}
        slug={imovel.slug}
        publicado={dadosGerais.publicado}
        onTogglePublicado={() =>
          handleCampoGeralChange("publicado", !dadosGerais.publicado)
        }
      />
    </div>
  );
}
