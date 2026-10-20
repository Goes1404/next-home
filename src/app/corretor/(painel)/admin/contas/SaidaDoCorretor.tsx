"use client";

import { useState, useTransition } from "react";
import { Download, Shuffle, UserRound } from "lucide-react";
import {
  fraseDoDesfecho,
  fraseDoRestante,
  frasesDaDivisao,
  passoDepoisDaDivisao,
  type DivisaoDaCarteira,
} from "@/lib/corretores/saidaDoCorretor";
import { alternarAtivoCorretor, devolverLeadsDaImobiliaria } from "../acoes";

/**
 * A saída do corretor (fase 5, 0200), aberta pelo "Desativar" de quem tem
 * leads, ou pelo "Fichas e leads de quem saiu" de quem já foi desativado.
 * Mostra a carteira dividida em dois lados:
 *
 * - os leads que vieram da imobiliária ficam com ela: o gestor escolhe para
 *   quem vão (roleta ou um corretor);
 * - os que ele trouxe são dele: o gestor baixa as FICHAS (planilha, sem
 *   conversa nenhuma) e entrega a ele. Esses ficam na carteira dele.
 *
 * Lead da imobiliária que a roleta não consegue passar (ninguém ativo atende
 * a região) segura a desativação: o painel pede um corretor para o restante.
 *
 * Os números vêm da action e são lidos no clique, nunca num efeito: o
 * painel do gestor não precisa contar a carteira de todo mundo ao abrir.
 */

type Destino = { id: string; nome: string };

export function SaidaDoCorretor({
  corretor,
  divisao,
  equipe,
  jaDesativado = false,
  aoFechar,
  aoAvisar,
}: {
  corretor: { id: string; nome: string };
  divisao: DivisaoDaCarteira;
  /** Quem pode receber: ativo, visível e diferente de quem sai. */
  equipe: Destino[];
  /** A conta já foi desativada: o painel só passa leads e entrega fichas. */
  jaDesativado?: boolean;
  aoFechar: () => void;
  aoAvisar: (msg: string, erro: boolean) => void;
}) {
  const [modo, setModo] = useState<"roleta" | "escolher">("roleta");
  const [destino, setDestino] = useState(equipe[0]?.id ?? "");
  // Os da imobiliária que ainda estão com ele (cai depois de cada divisão).
  const [daCasa, setDaCasa] = useState(divisao.daImobiliaria);
  const [pendente, iniciar] = useTransition();
  const frases = frasesDaDivisao(corretor.nome, { ...divisao, daImobiliaria: daCasa });
  const temDaCasa = daCasa > 0;
  const semEquipe = equipe.length === 0;

  const confirmar = () =>
    iniciar(async () => {
      try {
        let desfecho = "";
        let semDestino = 0;
        let movidos = 0;
        if (temDaCasa) {
          if (modo === "escolher" && !destino) return aoAvisar("Escolha para quem vão os leads.", true);
          const r = await devolverLeadsDaImobiliaria(corretor.id, modo === "roleta" ? null : destino);
          if (r.erro) return aoAvisar(r.erro, true);
          desfecho = `${r.ok ?? ""} `;
          semDestino = r.semDestino ?? 0;
          movidos = r.movidos ?? 0;
        }

        const passo = passoDepoisDaDivisao(semDestino, jaDesativado);
        if (passo === "escolher_restante") {
          setDaCasa(semDestino);
          setModo("escolher");
          const passaram = movidos > 0 ? `${fraseDoDesfecho(movidos, 0)} ` : "";
          return aoAvisar(`${passaram}${fraseDoRestante(corretor.nome, semDestino)}`, true);
        }
        if (passo === "pronto") {
          aoAvisar(desfecho.trim() || "Pronto.", false);
          return aoFechar();
        }

        const d = await alternarAtivoCorretor(corretor.id, false);
        if (d.erro) return aoAvisar(`${desfecho}${d.erro}`, true);
        aoAvisar(`${desfecho}${corretor.nome} foi desativado.`, false);
        aoFechar();
      } catch {
        aoAvisar("Não deu para falar com o servidor. Atualize a página e confira a lista antes de tentar de novo.", true);
      }
    });

  const rotuloDoBotao = pendente
    ? "Fazendo…"
    : jaDesativado
      ? "Passar os leads da imobiliária"
      : temDaCasa
        ? "Passar os leads e desativar"
        : "Desativar";

  return (
    <div className="border-linha-forte bg-vidro mt-3 space-y-4 rounded-xl border p-4">
      <p className="text-fluid-sm font-semibold text-titulo">
        {jaDesativado ? `A carteira de ${corretor.nome}, que já saiu` : `Antes de desativar ${corretor.nome}`}
      </p>

      <section className="space-y-2">
        <p className="text-fluid-xs text-corpo">{frases.daCasa}</p>
        {temDaCasa && (
          <fieldset className="space-y-2" disabled={pendente || semEquipe}>
            <legend className="text-fluid-xs text-apoio mb-1">Para quem eles vão:</legend>
            <label className="text-fluid-xs text-corpo flex min-h-11 cursor-pointer items-center gap-2">
              <input type="radio" name={`modo-${corretor.id}`} checked={modo === "roleta"} onChange={() => setModo("roleta")} />
              <Shuffle className="h-3.5 w-3.5" /> Dividir entre a equipe, pela roleta
            </label>
            <label className="text-fluid-xs text-corpo flex min-h-11 cursor-pointer items-center gap-2">
              <input type="radio" name={`modo-${corretor.id}`} checked={modo === "escolher"} onChange={() => setModo("escolher")} />
              <UserRound className="h-3.5 w-3.5" /> Passar todos para um corretor
            </label>
            {modo === "escolher" && (
              <select
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                aria-label="Corretor que recebe os leads"
                className="text-fluid-xs border-linha-forte bg-superficie text-titulo min-h-11 w-full rounded-lg border px-3"
              >
                {equipe.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            )}
            {semEquipe && (
              <p className="text-fluid-xs text-alerta">Não há outro corretor ativo para receber os leads.</p>
            )}
          </fieldset>
        )}
      </section>

      <section className="space-y-2">
        <p className="text-fluid-xs text-corpo">{frases.dele}</p>
        {divisao.doCorretor > 0 && (
          <>
            <a
              href={`/api/painel/fichas-do-corretor?corretor=${corretor.id}`}
              className="botao-secundario text-fluid-xs text-corpo inline-flex min-h-11 items-center gap-2 rounded-lg px-3"
            >
              <Download className="h-3.5 w-3.5" /> Baixar as fichas dele (planilha)
            </a>
            <p className="text-fluid-xs text-apoio">
              {jaDesativado
                ? "Esses leads continuam na carteira dele, parados."
                : "Esses leads continuam na carteira dele, parados, depois de desativar."}
            </p>
          </>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        {(!jaDesativado || temDaCasa) && (
          <button
            type="button"
            onClick={confirmar}
            disabled={pendente || (temDaCasa && semEquipe)}
            className="text-fluid-xs bg-acento hover:bg-acento-hover flex min-h-11 cursor-pointer items-center rounded-lg px-4 font-medium text-sobre-cor disabled:opacity-60"
          >
            {rotuloDoBotao}
          </button>
        )}
        <button
          type="button"
          onClick={aoFechar}
          disabled={pendente}
          className="botao-secundario text-fluid-xs text-corpo flex min-h-11 cursor-pointer items-center rounded-lg px-3"
        >
          {jaDesativado ? "Fechar" : "Cancelar"}
        </button>
      </div>
    </div>
  );
}
