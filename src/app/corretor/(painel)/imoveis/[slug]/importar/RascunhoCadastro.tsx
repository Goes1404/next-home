"use client";

import { useState } from "react";
import { STATUS_LABEL, type StatusObra } from "@/lib/types";
import type { RascunhoCadastro as Rascunho } from "@/lib/imoveis/rascunhoDePdf";

/**
 * O que a IA leu da apresentação, campo a campo, para o corretor aceitar ou
 * ignorar.
 *
 * Nada é aplicado sozinho. O que entra errado num cadastro não fica no
 * cadastro: vai para o prompt do bot e é afirmado ao cliente como verdade.
 * Por isso cada linha mostra o que JÁ ESTÁ gravado ao lado do que a IA
 * propõe — sem essa comparação, aceitar é apostar.
 */

type CampoSimples = {
  chave: keyof Rascunho;
  rotulo: string;
  sugerido: string;
  atual: string;
};

const ROTULOS: Partial<Record<keyof Rascunho, string>> = {
  nome: "Nome",
  construtora: "Construtora",
  cidade: "Cidade",
  bairro: "Bairro",
  endereco: "Endereço",
  status: "Situação da obra",
  entregaPrevista: "Entrega prevista",
  totalTorres: "Torres",
  totalAndares: "Andares",
  totalUnidades: "Unidades",
  tagline: "Chamada",
  descricao: "Descrição",
};

function comoTexto(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "";
  if (typeof valor === "string" && valor in STATUS_LABEL) return STATUS_LABEL[valor as StatusObra];
  return String(valor);
}

export function RascunhoCadastro({
  rascunho,
  atual,
  aoAplicar,
}: {
  rascunho: Rascunho;
  /** O que já está gravado no imóvel, para comparar antes de aceitar. */
  atual: Partial<Record<keyof Rascunho, unknown>>;
  aoAplicar: (aceitos: Partial<Rascunho>) => Promise<void> | void;
}) {
  const campos: CampoSimples[] = (Object.keys(ROTULOS) as (keyof Rascunho)[])
    .filter((chave) => rascunho[chave] !== undefined)
    .map((chave) => ({
      chave,
      rotulo: ROTULOS[chave] ?? String(chave),
      sugerido: comoTexto(rascunho[chave]),
      atual: comoTexto(atual[chave]),
    }));

  // Campo que só CONFIRMA o que já está lá não precisa de decisão: já vem
  // desmarcado e some do caminho do corretor.
  const [marcados, setMarcados] = useState<Record<string, boolean>>(
    Object.fromEntries(campos.map((c) => [c.chave, c.atual !== c.sugerido])),
  );
  const [aplicando, setAplicando] = useState(false);

  if (campos.length === 0) {
    return <p className="text-fluid-xs text-apoio">Não achei dados de cadastro nesta apresentação.</p>;
  }

  const aplicar = async () => {
    const aceitos: Partial<Rascunho> = {};
    for (const campo of campos) {
      if (marcados[campo.chave]) {
        // O valor vai como a IA leu, não como está escrito na tela: o
        // rótulo de status é para humano, o banco quer o enum.
        Object.assign(aceitos, { [campo.chave]: rascunho[campo.chave] });
      }
    }
    setAplicando(true);
    await aoAplicar(aceitos);
    setAplicando(false);
  };

  const quantos = Object.values(marcados).filter(Boolean).length;

  return (
    <div className="space-y-4 rounded-2xl border border-linha bg-elevado p-4">
      <div>
        <h3 className="text-fluid-base font-bold text-titulo">O que li na apresentação</h3>
        <p className="text-fluid-xs text-apoio mt-0.5">
          Confira cada linha antes de aceitar. O que entra aqui é o que a IA conta ao cliente no WhatsApp.
        </p>
      </div>

      <ul className="space-y-2">
        {campos.map((campo) => (
          <li key={campo.chave} className="rounded-xl bg-campo p-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={marcados[campo.chave] ?? false}
                onChange={(e) => setMarcados((antes) => ({ ...antes, [campo.chave]: e.target.checked }))}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-fluid-xs text-tenue">{campo.rotulo}</span>
                <span className="block text-fluid-xs text-corpo break-words">{campo.sugerido}</span>
                {campo.atual && campo.atual !== campo.sugerido ? (
                  <span className="block text-fluid-xs text-apoio break-words">hoje está: {campo.atual}</span>
                ) : null}
                {campo.atual === campo.sugerido ? (
                  <span className="block text-fluid-xs text-tenue">já está assim</span>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {rascunho.tipologias?.length ? (
        <div className="rounded-xl bg-campo p-3">
          <p className="text-fluid-xs text-tenue">Plantas citadas na apresentação</p>
          <ul className="text-fluid-xs text-corpo">
            {rascunho.tipologias.map((t) => (
              <li key={t.nome}>
                {t.nome}
                {t.metragem ? ` — ${t.metragem} m²` : ""}
                {t.dormitorios ? `, ${t.dormitorios} dorm.` : ""}
                {t.suites ? `, ${t.suites} suíte${t.suites > 1 ? "s" : ""}` : ""}
              </li>
            ))}
          </ul>
          <p className="text-fluid-xs text-apoio mt-1">
            Cadastre as plantas na aba de tipologias do imóvel — elas têm preço e unidades, que não saem daqui.
          </p>
        </div>
      ) : null}

      {rascunho.lazer?.length ? (
        <div className="rounded-xl bg-campo p-3">
          <p className="text-fluid-xs text-tenue">Lazer citado</p>
          <p className="text-fluid-xs text-corpo">{rascunho.lazer.join(" · ")}</p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void aplicar()}
        disabled={aplicando || quantos === 0}
        className="w-full min-h-[48px] rounded-xl bg-acento px-5 text-fluid-xs font-bold text-sobre-cor shadow-md shadow-acento/20 transition-all active:scale-95 disabled:opacity-60"
      >
        {aplicando ? "Salvando…" : quantos === 0 ? "Marque o que quer aproveitar" : `Salvar ${quantos} no cadastro`}
      </button>
    </div>
  );
}
