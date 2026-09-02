"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  organizarFila,
  resumoDoCandidato,
  precisaConferir,
  type Candidato,
  type DecisaoCandidato,
} from "@/lib/imoveis/filaDeCandidatos";
import { decidirCandidato } from "./acoes";

/**
 * Três botões, e cada um grava um MOTIVO escrito.
 *
 * "Já temos" é decisão própria, não motivo de descarte, porque as duas
 * levam a ações diferentes quando alguém reabrir a lista: descartado sai
 * do mercado da Next Home; "já temos" é sinal de que o imóvel pode estar
 * cadastrado com outro nome — e aí o que falta é apelido, não cadastro.
 */
const BOTOES: { decisao: DecisaoCandidato; rotulo: string; motivo: string; tom: string }[] = [
  {
    decisao: "cadastrar",
    rotulo: "Vamos cadastrar",
    motivo: "a Next Home representa ou vai representar",
    tom: "border-acento-linha text-titulo hover:bg-elevado",
  },
  {
    decisao: "descartado",
    rotulo: "Não é nosso",
    motivo: "não é da carteira da Next Home",
    tom: "border-linha text-corpo hover:bg-elevado",
  },
  {
    decisao: "ja_temos",
    rotulo: "Já temos",
    motivo: "já está no catálogo (conferir se falta apelido)",
    tom: "border-linha text-corpo hover:bg-elevado",
  },
];

const NOME_DA_DECISAO: Record<DecisaoCandidato, string> = {
  pendente: "esperando decisão",
  cadastrar: "para cadastrar",
  descartado: "não é nosso",
  ja_temos: "já temos",
};

function LinkDaFonte({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-fluid-xs text-apoio hover:text-titulo underline underline-offset-2 transition-colors"
    >
      ver na fonte
    </a>
  );
}

export function FilaCandidatos({ candidatos }: { candidatos: readonly Candidato[] }) {
  const [pendente, iniciar] = useTransition();
  const [emAndamento, setEmAndamento] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const fila = organizarFila(candidatos);

  function decidir(id: string, decisao: DecisaoCandidato, motivo?: string) {
    setErro(null);
    setEmAndamento(id);
    iniciar(async () => {
      const r = await decidirCandidato(id, decisao, motivo);
      if (r.erro) setErro(r.erro);
      setEmAndamento(null);
    });
  }

  const Cabecalho = ({ c }: { c: Candidato }) => (
    <div className="min-w-0 flex-1">
      <p className="text-fluid-sm text-titulo font-medium">{c.nome}</p>
      {resumoDoCandidato(c) && (
        <p className="text-fluid-xs text-apoio mt-0.5">{resumoDoCandidato(c)}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {erro && (
        <p className="text-fluid-xs rounded-xl border-perigo-linha bg-perigo-lavado text-perigo border px-4 py-3" role="status">
          {erro}
        </p>
      )}

      {fila.pendentes.length > 0 && (
        <section className="border-linha bg-superficie shadow-painel overflow-hidden rounded-2xl border">
          <div className="border-linha border-b px-5 py-4 sm:px-6">
            <h2 className="font-display text-titulo text-lg">
              {fila.pendentes.length === 1
                ? "1 esperando decisão"
                : `${fila.pendentes.length} esperando decisão`}
            </h2>
            <p className="text-fluid-xs text-corpo mt-1.5 leading-relaxed text-pretty">
              Cada um destes é um lançamento de Barueri que existe no mercado e não está no nosso
              catálogo. Decidir &ldquo;não é nosso&rdquo; vale tanto quanto decidir cadastrar: é o
              que impede o imóvel de voltar a esta fila no próximo levantamento.
            </p>
          </div>

          <ul>
            {fila.pendentes.map((c) => (
              <li key={c.id} className="border-linha border-b px-5 py-4 last:border-b-0 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <Cabecalho c={c} />
                  <LinkDaFonte href={c.link} />
                </div>

                {precisaConferir(c) && (
                  <p className="text-fluid-xs border-alerta-linha text-corpo mt-2.5 rounded-lg border px-3 py-2">
                    O nome parece com um que já está no catálogo. Confira antes: este projeto já
                    publicou o mesmo empreendimento três vezes.
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {BOTOES.map((b) => (
                    <button
                      key={b.decisao}
                      type="button"
                      disabled={pendente}
                      onClick={() => decidir(c.id, b.decisao, b.motivo)}
                      className={`text-fluid-xs min-h-11 rounded-xl border px-4 font-medium transition-colors disabled:opacity-50 ${b.tom}`}
                    >
                      {emAndamento === c.id && pendente ? "Gravando…" : b.rotulo}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {fila.paraCadastrar.length > 0 && (
        <section className="border-acento-linha bg-superficie shadow-painel overflow-hidden rounded-2xl border">
          <div className="border-linha border-b px-5 py-4 sm:px-6">
            <h2 className="font-display text-titulo text-lg">
              {fila.paraCadastrar.length === 1
                ? "1 para cadastrar"
                : `${fila.paraCadastrar.length} para cadastrar`}
            </h2>
            <p className="text-fluid-xs text-corpo mt-1.5 leading-relaxed text-pretty">
              &ldquo;Criar cadastro&rdquo; abre o editor com o essencial já preenchido. O imóvel
              nasce despublicado: foto, planta e ficha entram lá — inclusive pela importação do PDF
              da construtora — e ele só vai para o site quando você publicar.
            </p>
          </div>
          <ul>
            {fila.paraCadastrar.map((c) => (
              <li
                key={c.id}
                className="border-linha flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-5 py-3.5 last:border-b-0 sm:px-6"
              >
                <Cabecalho c={c} />
                <div className="flex flex-wrap items-center gap-3">
                  <LinkDaFonte href={c.link} />
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={() => decidir(c.id, "pendente")}
                    className="text-fluid-xs text-apoio hover:text-titulo min-h-11 transition-colors disabled:opacity-50"
                  >
                    voltar à fila
                  </button>
                  <Link
                    href={`/corretor/imoveis/novo?candidato=${c.id}`}
                    className="border-acento-linha text-titulo hover:bg-elevado text-fluid-xs inline-flex min-h-11 items-center rounded-xl border px-4 font-medium transition-colors"
                  >
                    Criar cadastro
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {fila.resolvidos.length > 0 && (
        <details className="border-linha bg-superficie overflow-hidden rounded-2xl border">
          <summary className="text-fluid-sm text-apoio hover:text-titulo cursor-pointer list-none px-5 py-4 transition-colors select-none sm:px-6">
            Já decididos ({fila.resolvidos.length})
          </summary>
          <ul>
            {fila.resolvidos.map((c) => (
              <li
                key={c.id}
                className="border-linha flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-5 py-3.5 sm:px-6"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-fluid-sm text-corpo">{c.nome}</p>
                  <p className="text-fluid-xs text-tenue mt-0.5">
                    {NOME_DA_DECISAO[c.decisao]}
                    {c.motivo ? ` — ${c.motivo}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => decidir(c.id, "pendente")}
                  className="text-fluid-xs text-apoio hover:text-titulo min-h-11 transition-colors disabled:opacity-50"
                >
                  voltar à fila
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {candidatos.length === 0 && (
        <p className="text-fluid-sm text-apoio border-linha bg-superficie rounded-2xl border px-5 py-8 text-center">
          Nenhum candidato na fila.
        </p>
      )}
    </div>
  );
}
