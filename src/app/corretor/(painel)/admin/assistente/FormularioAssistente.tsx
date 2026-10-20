"use client";

import { useState } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import {
  apresentacaoDaCasa,
  casaDoGrupo,
  perguntaDeRegiao,
  ROTULO_DO_TOM,
  TAMANHO_MAXIMO,
  TONS_DA_ASSISTENTE,
  type LinhaDaCasa,
} from "@/lib/whatsapp/casa";
import type { TomVozBot } from "@/lib/whatsapp/types";
import { salvarIdentidadeDaIa } from "./acoes";

/**
 * A grade da assistente do grupo. A prévia embaixo é montada pelas MESMAS
 * funções que escrevem o prompt (`casa.ts`): o que a tela mostra é o que a
 * IA recebe, inclusive o padrão quando o campo fica vazio.
 */
export function FormularioAssistente({ grupoId, inicial }: { grupoId: string; inicial: LinhaDaCasa | null }) {
  const { avisar, falhar } = useAvisos();
  const [nomeDaCasa, setNomeDaCasa] = useState(inicial?.ia_nome_da_casa ?? "");
  const [nomeAssistente, setNomeAssistente] = useState(inicial?.ia_nome_assistente ?? "");
  const [regiao, setRegiao] = useState(inicial?.ia_regiao ?? "");
  const [tom, setTom] = useState<TomVozBot | "">(
    TONS_DA_ASSISTENTE.includes(inicial?.ia_tom as TomVozBot) ? (inicial?.ia_tom as TomVozBot) : "",
  );
  const [salvando, setSalvando] = useState(false);

  // O que a IA vai receber com o que está na tela agora.
  const casa = casaDoGrupo(
    {
      nome: inicial?.nome ?? null,
      ia_nome_da_casa: nomeDaCasa,
      ia_nome_assistente: nomeAssistente,
      ia_regiao: regiao,
      ia_tom: tom || null,
    },
    grupoId,
  );
  const padrao = casaDoGrupo(inicial ? { ...inicial, ia_nome_da_casa: null, ia_regiao: null } : null, grupoId);

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await salvarIdentidadeDaIa({ nomeDaCasa, nomeAssistente, regiao, tom });
      if ("erro" in r) falhar(r.erro);
      else avisar("Salvo. A próxima resposta da IA no WhatsApp da equipe já sai assim.");
    } catch {
      // Erro de rede não devolve `{erro}` — sem este ramo a tela destrava muda.
      falhar("Não consegui salvar. Confira a conexão e tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="cartao grid gap-4 p-4 sm:grid-cols-2">
        <Campo
          rotulo="Nome da imobiliária"
          valor={nomeDaCasa}
          maximo={TAMANHO_MAXIMO.nomeDaCasa}
          exemplo="Ex.: Horizonte Imóveis"
          ajuda={
            padrao.nomeDaCasa
              ? `Em branco, ela diz "${padrao.nomeDaCasa}".`
              : "Em branco, ela se apresenta sem o nome da casa."
          }
          aoMudar={setNomeDaCasa}
        />
        <Campo
          rotulo="Nome da assistente"
          valor={nomeAssistente}
          maximo={TAMANHO_MAXIMO.nomeAssistente}
          exemplo="Ex.: Ana"
          ajuda="Vale para a equipe toda. Em branco, cada corretor escolhe o nome na tela Minha IA."
          aoMudar={setNomeAssistente}
        />
        <Campo
          rotulo="Cidade ou região onde vocês atendem"
          valor={regiao}
          maximo={TAMANHO_MAXIMO.regiao}
          exemplo="Ex.: Campinas"
          ajuda={`Ela pergunta: "${perguntaDeRegiao(padrao)} você procura?" quando fica em branco.`}
          aoMudar={setRegiao}
        />
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-tenue text-[11px] font-medium tracking-wide uppercase">Jeito de falar</span>
          <select
            value={tom}
            onChange={(e) => setTom(e.target.value as TomVozBot | "")}
            className="border-linha bg-elevado text-corpo focus:border-linha-forte min-h-11 w-full rounded-xl border px-3 text-sm outline-none"
          >
            <option value="">Cada corretor escolhe</option>
            {TONS_DA_ASSISTENTE.map((t) => (
              <option key={t} value={t}>
                {ROTULO_DO_TOM[t]}
              </option>
            ))}
          </select>
          <span className="text-apoio text-xs">
            Escolhido aqui, vale para a equipe toda e ganha do que cada corretor marcou.
          </span>
        </label>
      </section>

      <section className="cartao space-y-2 p-4">
        <h2 className="text-fluid-sm text-titulo font-semibold">Como ela vai falar</h2>
        <p className="text-corpo text-sm break-words">
          {`“Aqui é a ${casa.nomeAssistente ?? "assistente"}${casa.nomeDaCasa ? `, da ${casa.nomeDaCasa}` : ""}.”`}
        </p>
        <p className="text-corpo text-sm break-words">{`“${maiuscula(perguntaDeRegiao(casa))} você procura?”`}</p>
        <p className="text-apoio text-xs break-words">
          Ela se vê como consultora{apresentacaoDaCasa(casa)}
          {casa.tom ? `, no tom "${ROTULO_DO_TOM[casa.tom]}"` : ", no tom que cada corretor escolheu"}.
        </p>
        <p className="text-tenue text-xs">
          O que protege o cliente não muda: ela não inventa dado do imóvel, não promete prazo nem valorização, não nega
          que é uma IA quando perguntada e para quando o cliente pede.
        </p>
      </section>

      {/* Barra no polegar: é o gesto final da tela, e ela é usada no celular. */}
      <div className="acima-da-nav border-linha bg-elevado/95 sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3">
        <p className="text-tenue min-w-0 text-xs">Vale a partir da próxima resposta, no número de todos.</p>
        <button
          type="button"
          onClick={() => void salvar()}
          disabled={salvando}
          className="bg-acento hover:bg-acento-hover text-sobre-cor min-h-11 shrink-0 cursor-pointer rounded-full px-6 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {salvando ? "Salvando…" : "Salvar assistente"}
        </button>
      </div>
    </div>
  );
}

function maiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function Campo({
  rotulo,
  valor,
  maximo,
  exemplo,
  ajuda,
  aoMudar,
}: {
  rotulo: string;
  valor: string;
  maximo: number;
  exemplo: string;
  ajuda: string;
  aoMudar: (v: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-tenue text-[11px] font-medium tracking-wide uppercase">{rotulo}</span>
      <input
        type="text"
        value={valor}
        maxLength={maximo}
        placeholder={exemplo}
        onChange={(e) => aoMudar(e.target.value)}
        className="border-linha bg-elevado text-corpo focus:border-linha-forte min-h-11 w-full rounded-xl border px-3 text-sm outline-none"
      />
      <span className="text-apoio text-xs break-words">{ajuda}</span>
    </label>
  );
}
