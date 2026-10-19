import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FAIXAS_DE_ESPERA, faixasDeEspera, type FaixaDeEspera } from "@/lib/graficos/calculos";
import { nomeUtilDoLead } from "@/lib/leads/nomeExibido";

/**
 * "Quem está esfriando?" (28/09/2026) — no Início.
 *
 * Aqui a pergunta não é comparar nada: é "quantos, e quem primeiro". Por isso
 * a forma é um NÚMERO grande, uma faixa só dividida pelo tempo de espera
 * (parte do todo, com a ordem de urgência da esquerda para a direita) e a
 * lista de quem espera há mais tempo, cada um abrindo a conversa.
 *
 * A cor É estado (quanto mais espera, mais urgente) e por isso usa as cores
 * de estado da casa, sempre com o tempo escrito na legenda.
 *
 * Some quando ninguém espera: gráfico que vive em zero ensina a ignorar o
 * gráfico, a mesma régua do contador de aba.
 */

const COR: Record<FaixaDeEspera, { barra: string; ponto: string }> = {
  mais_de_24h: { barra: "bg-perigo", ponto: "bg-perigo" },
  ate_24h: { barra: "bg-alerta", ponto: "bg-alerta" },
  ate_6h: { barra: "bg-alerta/55", ponto: "bg-alerta/55" },
  ate_1h: { barra: "bg-ok", ponto: "bg-ok" },
};

/** Mais urgente primeiro: é a ordem de leitura e de ação. */
const ORDEM = [...FAIXAS_DE_ESPERA].reverse();

function haQuanto(iso: string, agora: Date): string {
  const min = Math.max(0, Math.round((agora.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

export async function QuemEstaEsperando({ corretorId }: { corretorId: string }) {
  const supabase = await createClient();
  // Filtro explícito por corretor: o gestor enxerga a equipe toda pela RLS, e
  // o Início é o trabalho DELE.
  const { data, error } = await supabase
    .from("whatsapp_esperando_resposta")
    .select("conversa_id, esperando_desde, nome_cliente, telefone_cliente")
    .eq("corretor_id", corretorId)
    .order("esperando_desde", { ascending: true });
  const linhas = (error ? [] : (data ?? [])).filter(
    (d): d is typeof d & { esperando_desde: string } => d.esperando_desde !== null,
  );
  if (linhas.length === 0) return null;

  return <EsperaVisual linhas={linhas} agora={new Date()} />;
}

export function EsperaVisual({
  linhas,
  agora,
}: {
  linhas: { conversa_id: string | null; esperando_desde: string; nome_cliente: string | null; telefone_cliente: string | null }[];
  agora: Date;
}) {
  const faixas = faixasDeEspera(
    linhas.map((l) => l.esperando_desde),
    agora,
  );
  const total = linhas.length;
  const atrasados = faixas.ate_24h + faixas.mais_de_24h;
  const primeiros = linhas.slice(0, 3);

  return (
    <section className="cartao space-y-4 p-4 sm:p-5" aria-labelledby="esperando-titulo">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p id="esperando-titulo" className="text-fluid-sm text-apoio">
            Esperando sua resposta
          </p>
          <p className="font-display text-titulo mt-1 text-5xl leading-none font-bold tracking-[-0.03em] tabular-nums">{total}</p>
        </div>
        <p className="text-fluid-xs text-apoio sm:max-w-[16rem] sm:text-right">
          {atrasados > 0
            ? `${atrasados} há mais de 6 horas. Resposta depois de um dia costuma chegar tarde.`
            : "Todos há menos de 6 horas."}
        </p>
      </div>

      {/* Uma faixa, parte do todo. 2px de respiro entre os pedaços. */}
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={
        ORDEM.filter((f) => faixas[f.faixa] > 0)
          .map((f) => `${faixas[f.faixa]} ${f.rotulo.toLowerCase()}`)
          .join(", ")
      }>
        {ORDEM.filter((f) => faixas[f.faixa] > 0).map((f) => (
          <span
            key={f.faixa}
            title={`${f.rotulo}: ${faixas[f.faixa]}`}
            className={`${COR[f.faixa].barra} h-full`}
            style={{ flexGrow: faixas[f.faixa] }}
          />
        ))}
      </div>
      <ul className="text-fluid-xs text-apoio flex flex-wrap gap-x-4 gap-y-1" aria-hidden>
        {ORDEM.filter((f) => faixas[f.faixa] > 0).map((f) => (
          <li key={f.faixa} className="flex items-center gap-1.5">
            <span className={`${COR[f.faixa].ponto} size-2 rounded-full`} />
            {f.rotulo} <span className="text-titulo font-semibold tabular-nums">{faixas[f.faixa]}</span>
          </li>
        ))}
      </ul>

      <div>
        <p className="text-fluid-xs text-tenue mb-1">Comece por aqui</p>
        <ul className="divide-linha divide-y">
          {primeiros.map((l) => (
            <li key={l.conversa_id ?? l.esperando_desde}>
              <Link
                href={l.conversa_id ? `/corretor/pessoas?c=${l.conversa_id}` : "/corretor/pessoas"}
                className="hover:bg-vidro active:bg-vidro-forte -mx-2 flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors"
              >
                <span className="text-fluid-sm text-titulo min-w-0 truncate">
                  {nomeUtilDoLead(l.nome_cliente) ?? l.telefone_cliente ?? "Contato"}
                </span>
                <span className="text-fluid-xs text-apoio shrink-0 tabular-nums">
                  {haQuanto(l.esperando_desde, agora)} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {total > primeiros.length && (
          <Link href="/corretor/pessoas" className="text-fluid-xs text-apoio hover:text-titulo mt-1 inline-flex min-h-11 items-center link-acao">
            Ver os outros {total - primeiros.length} →
          </Link>
        )}
      </div>
    </section>
  );
}
