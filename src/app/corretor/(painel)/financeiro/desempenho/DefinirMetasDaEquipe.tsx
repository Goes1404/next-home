"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { MEDIDAS, rotulosDaMedida, type Medida, type MetasDoMes } from "@/lib/financeiro/placarDaEquipe";
import { useRamoDoPainel } from "@/lib/ramos/RamoDoPainel";
import { maiuscula, vocabularioDoRamo } from "@/lib/ramos/ramos";
import { salvarMetasDaEquipe, type LinhaDeMetaDigitada } from "./metasAcoes";

type Mes = { chave: string; rotulo: string; metas: Record<string, MetasDoMes> };

const campo =
  "text-fluid-sm border-linha-forte bg-campo text-titulo min-h-11 w-full min-w-0 rounded-lg border px-2 text-center tabular-nums";

function paraTexto(m: MetasDoMes | undefined): Record<Medida, string> {
  return {
    visitas: m?.visitas ? String(m.visitas) : "",
    propostas: m?.propostas ? String(m.propostas) : "",
    vendas: m?.vendas ? String(m.vendas) : "",
  };
}

/**
 * A linha de um corretor no mês, com fallback (30/10/2026, revisão): o
 * estado do formulário nasce UMA vez com a equipe daquele momento; quem
 * entra na equipe depois de um `router.refresh()` não tinha linha e a tela
 * quebrava ao ler `doMes[id][medida]`. Sem linha guardada, vale a meta que
 * veio do servidor (ou vazio).
 */
export function linhaDaMeta(
  valores: Record<string, Record<string, Record<Medida, string>> | undefined>,
  meses: Mes[],
  chaveDoMes: string,
  corretorId: string,
): Record<Medida, string> {
  return valores[chaveDoMes]?.[corretorId] ?? paraTexto(meses.find((m) => m.chave === chaveDoMes)?.metas[corretorId]);
}

/**
 * As metas do mês da equipe, definidas pelo gestor (0246, 29/10/2026): uma
 * linha por corretor, três números (vazio = sem meta naquela medida). O mês
 * atual e o seguinte, para planejar antes de o mês virar. "Copiar para
 * todos" repete a primeira linha preenchida nas vazias.
 */
export function DefinirMetasDaEquipe({
  equipe,
  meses,
}: {
  equipe: { id: string; nome: string }[];
  meses: Mes[];
}) {
  const router = useRouter();
  const { avisar, falhar } = useAvisos();
  const [salvando, iniciar] = useTransition();
  const [mes, setMes] = useState(meses[0].chave);
  const [valores, setValores] = useState<Record<string, Record<string, Record<Medida, string>>>>(() =>
    Object.fromEntries(meses.map((m) => [m.chave, Object.fromEntries(equipe.map((c) => [c.id, paraTexto(m.metas[c.id])]))])),
  );
  // O vocabulário do ramo (30/10/2026, revisão): "Reuniões", "Consultor"...
  const { ramo } = useRamoDoPainel();
  const rotulos = rotulosDaMedida(ramo);
  const colunaDaEquipe = maiuscula(vocabularioDoRamo(ramo).equipe.singular);

  const linhaDe = (v: typeof valores, chaveDoMes: string, corretorId: string) => linhaDaMeta(v, meses, chaveDoMes, corretorId);
  const doMes = Object.fromEntries(equipe.map((c) => [c.id, linhaDe(valores, mes, c.id)])) as Record<string, Record<Medida, string>>;

  const mudar = (corretorId: string, medida: Medida, valor: string) =>
    setValores((v) => ({
      ...v,
      [mes]: { ...v[mes], [corretorId]: { ...linhaDe(v, mes, corretorId), [medida]: valor.replace(/\D/g, "").slice(0, 4) } },
    }));

  const copiarParaTodos = () => {
    const modelo = equipe.map((c) => doMes[c.id]).find((l) => MEDIDAS.some((m) => l[m] !== ""));
    if (!modelo) return falhar("Preencha a meta de alguém primeiro.");
    setValores((v) => ({
      ...v,
      [mes]: Object.fromEntries(
        equipe.map((c) => {
          const atual = linhaDe(v, mes, c.id);
          return [c.id, MEDIDAS.some((m) => atual[m] !== "") ? atual : { ...modelo }];
        }),
      ),
    }));
  };

  const salvar = () =>
    iniciar(async () => {
      try {
        const linhas: LinhaDeMetaDigitada[] = equipe.map((c) => ({ corretorId: c.id, ...doMes[c.id] }));
        const r = await salvarMetasDaEquipe({ mes, linhas });
        if (r.erro) return falhar(r.erro);
        avisar(r.ok ?? "Metas salvas.");
        router.refresh();
      } catch {
        falhar("Não deu para salvar. Confira a conexão e tente de novo.");
      }
    });

  return (
    <section id="metas-da-equipe" className="cartao space-y-4 p-4 sm:p-5" aria-labelledby="titulo-metas-da-equipe">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="titulo-metas-da-equipe" className="text-fluid-base text-titulo font-medium">
            Metas da equipe
          </h2>
          <p className="text-fluid-xs text-apoio mt-1">
            Quantas {MEDIDAS.map((m) => rotulos[m].plural.toLowerCase()).join(", ")} você espera de cada um no mês.
            Vazio = sem meta. A equipe vê o placar no Ranking (cada um vê os próprios números e o pódio).
          </p>
        </div>
        <nav aria-label="Mês das metas" className="flex gap-2">
          {meses.map((m) => (
            <button
              key={m.chave}
              type="button"
              onClick={() => setMes(m.chave)}
              aria-pressed={m.chave === mes}
              className={`text-fluid-xs min-h-11 rounded-full border px-4 font-medium first-letter:uppercase ${
                m.chave === mes ? "bg-acento text-sobre-cor border-transparent" : "border-linha-forte text-apoio"
              }`}
            >
              {m.rotulo}
            </button>
          ))}
        </nav>
      </div>

      {/* Sem rolagem lateral: três campos estreitos cabem em 320px, e o nome quebra linha. */}
      <div>
        <table className="w-full table-fixed border-separate border-spacing-y-1.5">
          <thead>
            <tr className="text-fluid-xs text-tenue text-left">
              <th className="font-medium">{colunaDaEquipe}</th>
              {MEDIDAS.map((m) => (
                <th key={m} className="w-16 text-center font-medium sm:w-24">
                  {rotulos[m].plural}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {equipe.map((c) => (
              <tr key={c.id}>
                <td className="text-fluid-sm text-titulo pr-2 break-words">{c.nome}</td>
                {MEDIDAS.map((m) => (
                  <td key={m} className="px-1">
                    <input
                      inputMode="numeric"
                      aria-label={`${rotulos[m].plural} de ${c.nome}`}
                      value={doMes[c.id][m]}
                      onChange={(e) => mudar(c.id, m, e.target.value)}
                      className={campo}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="text-fluid-sm bg-acento text-sobre-cor min-h-11 rounded-xl px-5 font-bold disabled:opacity-60"
        >
          {salvando ? "Salvando…" : "Salvar metas"}
        </button>
        <button type="button" onClick={copiarParaTodos} className="botao-secundario text-fluid-sm min-h-11 px-4">
          Copiar para quem está vazio
        </button>
      </div>
    </section>
  );
}
