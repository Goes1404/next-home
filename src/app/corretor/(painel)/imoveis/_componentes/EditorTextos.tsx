"use client";

import type { StatusObra, TipoImovel } from "@/lib/types";

interface Props {
  dados: {
    nome: string;
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
}

export function EditorTextos({ dados, onChange }: Props) {
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
            <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
              Descrição Comercial Completa
            </label>
            <textarea
              rows={4}
              value={dados.descricao}
              onChange={(e) => onChange("descricao", e.target.value)}
              placeholder="Descreva os diferenciais, acabamentos, arquitetura e conveniências..."
              className="w-full rounded-xl border border-linha-forte bg-campo p-4 text-fluid-sm text-titulo focus:border-acento focus:outline-none"
            />
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
          📍 Localização em Alphaville & Região
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
          🏗️ Estágio & Categoria
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
