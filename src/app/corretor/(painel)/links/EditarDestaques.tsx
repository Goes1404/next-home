"use client";

import { useState, useTransition } from "react";
import { salvarDestaques } from "@/app/corretor/actions";

type Item = { slug: string; nome: string };

export function EditarDestaques({
  itens,
  destaquesIniciais,
}: {
  itens: Item[];
  destaquesIniciais: string[];
}) {
  const [ordem, setOrdem] = useState<string[]>(destaquesIniciais);
  const [adicionar, setAdicionar] = useState("");
  const [pendente, iniciarTransicao] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const porSlug = new Map(itens.map((i) => [i.slug, i.nome]));
  const disponiveis = itens.filter((i) => !ordem.includes(i.slug));

  function persistir(nova: string[]) {
    setOrdem(nova);
    setErro(null);
    iniciarTransicao(async () => {
      const resultado = await salvarDestaques(nova);
      if (resultado.erro) setErro(resultado.erro);
    });
  }

  function mover(index: number, direcao: -1 | 1) {
    const alvo = index + direcao;
    if (alvo < 0 || alvo >= ordem.length) return;
    const nova = [...ordem];
    [nova[index], nova[alvo]] = [nova[alvo], nova[index]];
    persistir(nova);
  }

  function remover(slug: string) {
    persistir(ordem.filter((s) => s !== slug));
  }

  function adicionarItem() {
    if (!adicionar || ordem.length >= 15) return;
    persistir([...ordem, adicionar]);
    setAdicionar("");
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-ink-900/50 p-6">
      <p className="font-display text-mist-50">Destaques do seu link</p>
      <p className="text-fluid-sm mt-1 mb-4 text-mist-400">
        Quem entra pelo seu link vê estes primeiro, nesta ordem. O resto do
        catálogo segue atrás, na ordem padrão.
      </p>

      {ordem.length === 0 && (
        <p className="text-fluid-sm text-mist-500">
          Nenhum destaque ainda — todo o catálogo aparece na ordem padrão.
        </p>
      )}

      <ol className="space-y-2">
        {ordem.map((slug, i) => (
          <li
            key={slug}
            className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-ink-950/50 px-4 py-2.5"
          >
            <span className="text-fluid-sm text-mist-100">{porSlug.get(slug) ?? slug}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => mover(i, -1)}
                disabled={i === 0}
                aria-label="Subir"
                className="rounded-lg p-1.5 text-mist-400 hover:text-mist-100 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => mover(i, 1)}
                disabled={i === ordem.length - 1}
                aria-label="Descer"
                className="rounded-lg p-1.5 text-mist-400 hover:text-mist-100 disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remover(slug)}
                aria-label="Remover"
                className="rounded-lg p-1.5 text-mist-400 hover:text-red-300"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ol>

      {ordem.length < 15 ? (
        <div className="mt-4 flex gap-2">
          <select
            value={adicionar}
            onChange={(e) => setAdicionar(e.target.value)}
            className="text-fluid-sm flex-1 rounded-lg border border-white/15 bg-ink-950 px-3 py-2 text-mist-200"
          >
            <option value="">Adicionar empreendimento…</option>
            {disponiveis.map((i) => (
              <option key={i.slug} value={i.slug}>
                {i.nome}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={adicionarItem}
            disabled={!adicionar}
            className="text-fluid-sm rounded-lg bg-brand-500 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>
      ) : (
        <p className="text-fluid-xs mt-3 text-mist-500">Máximo de 15 destaques.</p>
      )}

      {pendente && <p className="text-fluid-xs mt-2 text-mist-500">Salvando…</p>}
      {erro && <p className="text-fluid-xs mt-2 text-red-300">{erro}</p>}
    </div>
  );
}
