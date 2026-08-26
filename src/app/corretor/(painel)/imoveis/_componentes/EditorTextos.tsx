"use client";

import { useState, useTransition } from "react";
import type { StatusObra, Tipologia, TipoImovel } from "@/lib/types";
import { Building2, MapPin, Sparkles } from 'lucide-react';
import { melhorarDescricaoComIA } from "../actions";


interface Props {
  dados: {
    nome: string;
    nomesAlternativos: string[];
    tagline: string;
    descricao: string;
    precoAPartir: number | null;
    condominioValor: number | null;
    iptu: number | null;
    status: StatusObra;
    tipo: TipoImovel;
    cidade: string;
    bairro: string;
    endereco: string;
    entregaPrevista: string | null;
  };
  onChange: (campo: string, valor: any) => void;
  /**
   * O que a IA precisa saber e que não é editado nesta aba. Vem do
   * formulário aberto (tipologias e lazer que o corretor acabou de mexer),
   * não do banco — pedir o texto logo depois de preencher a ficha é o uso
   * natural, e ler do banco descreveria o imóvel como ele era antes.
   */
  contexto: {
    tipologias: Tipologia[];
    lazer: string[];
    construtora: string | null;
    totalUnidades: number | null;
    totalTorres: number | null;
  };
}

export function EditorTextos({ dados, onChange, contexto }: Props) {
  /**
   * A sugestão da IA fica ao LADO do texto, nunca por cima dele.
   *
   * Trocar a descrição no clique economizaria um botão e destruiria, sem
   * volta, o texto que o corretor escreveu — o campo não tem histórico e a
   * tela não tem desfazer. Ele compara e decide.
   */
  const [sugestao, setSugestao] = useState<string | null>(null);
  const [erroIA, setErroIA] = useState<string | null>(null);
  const [gerando, iniciarGeracao] = useTransition();

  function pedirTexto() {
    setErroIA(null);
    setSugestao(null);
    iniciarGeracao(async () => {
      const res = await melhorarDescricaoComIA({
        nome: dados.nome,
        tagline: dados.tagline,
        descricaoAtual: dados.descricao,
        tipo: dados.tipo,
        status: dados.status,
        cidade: dados.cidade,
        bairro: dados.bairro,
        construtora: contexto.construtora,
        entregaPrevista: dados.entregaPrevista,
        totalUnidades: contexto.totalUnidades,
        totalTorres: contexto.totalTorres,
        tipologias: contexto.tipologias.map((t) => ({
          nome: t.nome,
          areaPrivativa: t.areaPrivativa,
          dormitorios: t.dormitorios,
          suites: t.suites,
          banheiros: t.banheiros,
          vagas: t.vagas,
        })),
        lazer: contexto.lazer,
      });
      if (!res.ok) {
        setErroIA(res.erro);
        return;
      }
      setSugestao(res.descricao);
    });
  }

  return (
    <div className="space-y-6">
      {/* 1. Nome e Textos de Marketing */}
      <div className="p-5 sm:p-6 rounded-3xl border border-linha bg-superficie backdrop-blur space-y-4">
        <h3 className="text-fluid-base font-bold text-titulo border-b border-linha pb-3">
          📝 Informações Principais & Textos
        </h3>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
              Nome do Empreendimento / Casa *
            </label>
            <input
              type="text"
              value={dados.nome}
              onChange={(e) => onChange("nome", e.target.value)}
              placeholder="Ex: Canvas Alphaville"
              className="min-h-[48px] w-full rounded-xl border border-linha-forte bg-campo px-4 text-fluid-sm text-titulo focus:border-acento focus:outline-none"
            />
          </div>

          {/*
            O nome que o CLIENTE usa costuma não ser o do cadastro: nas
            conversas reais, "Dom parque" para o "Lançamento ao Lado do
            Parque" e "manacá Barueri" para o "More na Aldeia de Barueri".
            Sem este campo, a IA trata o imóvel como se fosse de outra
            imobiliária e responde com sugestão genérica.
          */}
          <div className="space-y-1.5">
            <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
              Também conhecido como
            </label>
            <input
              type="text"
              value={dados.nomesAlternativos.join(", ")}
              onChange={(e) =>
                onChange(
                  "nomesAlternativos",
                  e.target.value
                    .split(",")
                    .map((n) => n.trim())
                    .filter(Boolean),
                )
              }
              placeholder="Ex: Dom Parque, Residencial Dom Parque"
              className="min-h-[48px] w-full rounded-xl border border-linha-forte bg-campo px-4 text-fluid-sm text-titulo focus:border-acento focus:outline-none"
            />
            <p className="text-fluid-xs text-legenda">
              Separe por vírgula. É por estes nomes que o cliente chama o imóvel no WhatsApp — sem
              eles, a IA não reconhece que ele está falando deste empreendimento.
            </p>
            {/* O campo vazio é um problema INVISÍVEL: a IA só falha lá no
                WhatsApp, dias depois, e ninguém liga a falha a este campo.
                O aviso traz o problema para onde a correção mora. */}
            {dados.nomesAlternativos.length === 0 && (
              <p className="text-fluid-xs rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-500">
                Sem apelido cadastrado: se o anúncio ou o cliente usarem um nome comercial diferente
                do título acima, a IA não vai reconhecer este imóvel na conversa.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
              Tagline (Frase de Impacto)
            </label>
            <input
              type="text"
              value={dados.tagline}
              onChange={(e) => onChange("tagline", e.target.value)}
              placeholder="Ex: O ápice do design contemporâneo no coração de Alphaville"
              className="min-h-[48px] w-full rounded-xl border border-linha-forte bg-campo px-4 text-fluid-sm text-titulo focus:border-acento focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
                Descrição Comercial Completa
              </label>
              <button
                type="button"
                onClick={pedirTexto}
                disabled={gerando}
                className="text-fluid-xs inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-full border border-acento/40 bg-acento/10 px-3.5 font-bold text-acento-suave transition-colors hover:bg-acento/20 disabled:cursor-wait disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" />
                {gerando ? "Escrevendo…" : dados.descricao.trim() ? "Melhorar com IA" : "Escrever com IA"}
              </button>
            </div>
            <textarea
              rows={4}
              value={dados.descricao}
              onChange={(e) => onChange("descricao", e.target.value)}
              placeholder="Descreva os diferenciais, acabamentos, arquitetura e conveniências..."
              className="w-full rounded-xl border border-linha-forte bg-campo p-4 text-fluid-sm text-titulo focus:border-acento focus:outline-none"
            />
            <p className="text-fluid-xs text-legenda">
              A IA escreve a partir da ficha: plantas, lazer, estágio da obra e localização. Ela não
              cita valores nem inventa item que não esteja cadastrado — quanto mais completa a ficha,
              melhor o texto.
            </p>

            {erroIA && <p className="text-fluid-xs text-perigo">{erroIA}</p>}

            {sugestao && (
              <div className="mt-3 space-y-3 rounded-2xl border border-acento/30 bg-acento/5 p-4">
                <p className="text-fluid-xs font-bold text-acento-suave uppercase tracking-wider">
                  Sugestão da IA — confira antes de usar
                </p>
                <p className="text-fluid-sm whitespace-pre-line text-corpo">{sugestao}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onChange("descricao", sugestao);
                      setSugestao(null);
                    }}
                    className="text-fluid-xs min-h-[40px] cursor-pointer rounded-xl bg-acento px-4 font-bold text-white transition-colors hover:bg-acento-hover"
                  >
                    Usar este texto
                  </button>
                  <button
                    type="button"
                    onClick={pedirTexto}
                    disabled={gerando}
                    className="text-fluid-xs min-h-[40px] cursor-pointer rounded-xl border border-linha-forte px-4 font-bold text-corpo transition-colors hover:text-titulo disabled:opacity-60"
                  >
                    Gerar outra
                  </button>
                  <button
                    type="button"
                    onClick={() => setSugestao(null)}
                    className="text-fluid-xs min-h-[40px] cursor-pointer rounded-xl px-4 font-bold text-legenda transition-colors hover:text-titulo"
                  >
                    Descartar
                  </button>
                </div>
                {/* "Usar este texto" só preenche o campo — quem grava é o
                    botão de salvar da barra, como em todo o resto da tela. */}
                <p className="text-fluid-xs text-legenda">
                  Usar o texto só preenche o campo. Nada vai para o site antes de você salvar.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Valores e Custos */}
      <div className="p-5 sm:p-6 rounded-3xl border border-linha bg-superficie backdrop-blur space-y-4">
        <h3 className="text-fluid-base font-bold text-titulo border-b border-linha pb-3">
          💰 Valores & Condições
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
              Preço a partir de (R$)
            </label>
            <input
              type="number"
              value={dados.precoAPartir ?? ""}
              onChange={(e) => onChange("precoAPartir", e.target.value ? Number(e.target.value) : null)}
              placeholder="1500000"
              className="min-h-[48px] w-full rounded-xl border border-linha-forte bg-campo px-4 text-fluid-sm text-titulo focus:border-acento focus:outline-none font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
              Condomínio Estimado (R$/mês)
            </label>
            <input
              type="number"
              value={dados.condominioValor ?? ""}
              onChange={(e) => onChange("condominioValor", e.target.value ? Number(e.target.value) : null)}
              placeholder="950"
              className="min-h-[48px] w-full rounded-xl border border-linha-forte bg-campo px-4 text-fluid-sm text-titulo focus:border-acento focus:outline-none font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
              IPTU Estimado (R$/ano)
            </label>
            <input
              type="number"
              value={dados.iptu ?? ""}
              onChange={(e) => onChange("iptu", e.target.value ? Number(e.target.value) : null)}
              placeholder="450"
              className="min-h-[48px] w-full rounded-xl border border-linha-forte bg-campo px-4 text-fluid-sm text-titulo focus:border-acento focus:outline-none font-mono"
            />
          </div>
        </div>
      </div>

      {/* 3. Localização */}
      <div className="p-5 sm:p-6 rounded-3xl border border-linha bg-superficie backdrop-blur space-y-4">
        <h3 className="text-fluid-base font-bold text-titulo border-b border-linha pb-3">
           <MapPin className="inline-block w-5 h-5 align-text-bottom mr-1" />  Localização em Alphaville & Região
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
              Bairro
            </label>
            <input
              type="text"
              value={dados.bairro}
              onChange={(e) => onChange("bairro", e.target.value)}
              placeholder="Ex: Alphaville, Tamboré, Green Valley"
              className="min-h-[48px] w-full rounded-xl border border-linha-forte bg-campo px-4 text-fluid-sm text-titulo focus:border-acento focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
              Cidade
            </label>
            <input
              type="text"
              value={dados.cidade}
              onChange={(e) => onChange("cidade", e.target.value)}
              placeholder="Barueri ou Santana de Parnaíba"
              className="min-h-[48px] w-full rounded-xl border border-linha-forte bg-campo px-4 text-fluid-sm text-titulo focus:border-acento focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
              Endereço Completo
            </label>
            <input
              type="text"
              value={dados.endereco}
              onChange={(e) => onChange("endereco", e.target.value)}
              placeholder="Av. Marcos Penteado de Ulhôa Rodrigues, 1000"
              className="min-h-[48px] w-full rounded-xl border border-linha-forte bg-campo px-4 text-fluid-sm text-titulo focus:border-acento focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* 4. Estágio da Obra e Tipo */}
      <div className="p-5 sm:p-6 rounded-3xl border border-linha bg-superficie backdrop-blur space-y-4">
        <h3 className="text-fluid-base font-bold text-titulo border-b border-linha pb-3">
           <Building2 className="inline-block w-5 h-5 align-text-bottom mr-1" />  Estágio & Categoria
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
              Status da Obra
            </label>
            <select
              value={dados.status}
              onChange={(e) => onChange("status", e.target.value as StatusObra)}
              className="min-h-[48px] w-full rounded-xl border border-linha-forte bg-campo px-4 text-fluid-sm text-titulo focus:border-acento focus:outline-none cursor-pointer"
            >
              <option value="lancamento">Lançamento</option>
              <option value="em_construcao">Em Construção</option>
              <option value="pronto_para_morar">Pronto para Morar</option>
              <option value="ultimas_unidades">Últimas Unidades</option>
              <option value="breve_lancamento">Breve Lançamento</option>
              <option value="pre_lancamento">Pré-Lançamento</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
              Tipo do Imóvel
            </label>
            <select
              value={dados.tipo}
              onChange={(e) => onChange("tipo", e.target.value as TipoImovel)}
              className="min-h-[48px] w-full rounded-xl border border-linha-forte bg-campo px-4 text-fluid-sm text-titulo focus:border-acento focus:outline-none cursor-pointer"
            >
              <option value="apartamento">Apartamento</option>
              <option value="alto_padrao">Alto Padrão</option>
              <option value="casa">Casa em Condomínio</option>
              <option value="terreno">Terreno / Lote</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
              Previsão de Entrega
            </label>
            <input
              type="date"
              value={dados.entregaPrevista || ""}
              onChange={(e) => onChange("entregaPrevista", e.target.value || null)}
              className="min-h-[48px] w-full rounded-xl border border-linha-forte bg-campo px-4 text-fluid-sm text-titulo focus:border-acento focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
