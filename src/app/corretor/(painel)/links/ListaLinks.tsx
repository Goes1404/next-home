"use client";

import { useMemo, useState } from "react";

export type ItemLink = { slug: string; nome: string; bairro: string; cidade: string };

const CAMPO =
  "w-full rounded-xl border border-white/15 bg-ink-950/60 px-4 py-3 text-mist-50 placeholder:text-mist-500 outline-none transition-colors focus:border-brand-300";

/** Remove acento para a busca casar "parnaiba" com "Parnaíba". */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }}
      className="rounded-full border border-white/15 px-4 py-2 text-xs font-medium text-mist-100 transition-colors hover:border-brand-300/50 hover:text-brand-200"
    >
      {copiado ? "Copiado!" : rotulo}
    </button>
  );
}

/**
 * Todos os empreendimentos publicados, não só os "do" corretor: a atribuição
 * por link vale em qualquer imóvel — é justamente o que o `?corretor=` faz.
 * Ele pode divulgar o que fizer sentido para o cliente dele.
 */
export function ListaLinks({
  itens,
  slugCorretor,
  baseUrl,
}: {
  itens: ItemLink[];
  slugCorretor: string;
  baseUrl: string;
}) {
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const alvo = normalizar(busca.trim());
    if (!alvo) return itens;
    return itens.filter((i) =>
      normalizar(`${i.nome} ${i.bairro} ${i.cidade}`).includes(alvo),
    );
  }, [itens, busca]);

  return (
    <div>
      <label htmlFor="busca-links" className="sr-only">
        Buscar empreendimento
      </label>
      <input
        id="busca-links"
        type="search"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome, bairro ou cidade…"
        className={CAMPO}
      />

      {filtrados.length === 0 ? (
        <p className="text-fluid-sm mt-6 text-mist-400">
          Nenhum empreendimento encontrado para “{busca}”.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {filtrados.map((item) => {
            const link = `${baseUrl}/empreendimentos/${item.slug}?corretor=${slugCorretor}`;
            const mensagem = `Olá! Separei este empreendimento pra você: ${item.nome}, em ${item.bairro}, ${item.cidade}.\n\n${link}`;
            return (
              <li
                key={item.slug}
                className="rounded-2xl border border-white/10 bg-ink-900/50 p-4"
              >
                <p className="font-display text-mist-50">{item.nome}</p>
                <p className="text-fluid-xs mt-0.5 text-mist-400">
                  {item.bairro}, {item.cidade}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <BotaoCopiar texto={link} rotulo="Copiar link" />
                  <BotaoCopiar texto={mensagem} rotulo="Copiar mensagem" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
