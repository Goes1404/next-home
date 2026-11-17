import type { Metadata } from "next";
import Link from "next/link";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import { destinatariosDoGrupo, listarComunicados, listarGruposAtivos } from "@/lib/plataforma/comunicados";
import { NovoComunicado } from "./NovoComunicado";
import { SituacaoDoComunicado } from "./SituacaoDoComunicado";

export const metadata: Metadata = { title: "Comunicados pelo número central" };

const DATA_E_HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

const ROTULO: Record<"enviando" | "pausado" | "concluido", string> = { enviando: "Enviando", pausado: "Pausado", concluido: "Concluído" };

/**
 * Comunicado da Astro no PRIVADO de cada corretor de uma imobiliária, pelo
 * número central (0260). Escolher a imobiliária, revisar a lista e a
 * mensagem, confirmar. A fila anda sozinha no tique dos follow-ups: uma
 * mensagem a cada 5 min, das 9h às 21h de segunda a sábado, até 10 por dia
 * (`comunicadoRegras.ts`), para o central não ser bloqueado.
 */
export default async function ComunicadosPage({ searchParams }: { searchParams: Promise<{ grupo?: string }> }) {
  const prova = await exigirAdminDaPlataformaNaPagina();
  const { grupo: grupoEscolhido } = await searchParams;
  const [grupos, comunicados] = await Promise.all([listarGruposAtivos(prova), listarComunicados(prova)]);
  const grupo = grupos.find((g) => g.id === grupoEscolhido) ?? null;
  const pessoas = grupo ? await destinatariosDoGrupo(prova, grupo.id) : [];

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/plataforma" className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center">
          ← Contas
        </Link>
        <h1 className="font-display text-titulo text-fluid-2xl mt-1">Comunicados pelo número central</h1>
        <p className="text-fluid-sm text-apoio mt-2 max-w-2xl">
          Uma mensagem da Astro no privado de cada corretor de uma imobiliária. Sai pelo número central, uma a cada 5 minutos, das 9h às
          21h, de segunda a sábado, até 10 por dia, para o número não ser bloqueado.
        </p>
      </div>

      <form method="get" className="cartao flex flex-wrap items-end gap-3 p-5">
        <label className="flex min-w-64 flex-col gap-2">
          <span className="text-fluid-sm text-apoio">Imobiliária</span>
          <select
            name="grupo"
            defaultValue={grupo?.id ?? ""}
            className="text-fluid-sm border-linha-forte bg-campo text-titulo min-h-11 rounded-xl border px-3.5"
          >
            <option value="">Escolha…</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="botao-secundario text-fluid-sm text-titulo min-h-11 rounded-xl border px-4 font-medium">
          Ver quem recebe
        </button>
      </form>

      {grupo && (
        <>
          <div className="cartao flex flex-col gap-2 p-5">
            <h2 className="text-titulo text-fluid-lg font-medium">
              Quem recebe <span className="text-apoio tabular-nums">({pessoas.length})</span>
            </h2>
            <p className="text-fluid-sm text-apoio">Corretores e gestores ativos, com WhatsApp no perfil. A ordem da lista é a ordem de envio.</p>
            <ol className="text-fluid-sm text-titulo list-decimal pl-5">
              {pessoas.map((p) => (
                <li key={p.id}>{p.nome}</li>
              ))}
            </ol>
          </div>
          <NovoComunicado grupoId={grupo.id} grupoNome={grupo.nome} nomes={pessoas.map((p) => p.nome)} />
        </>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-titulo text-fluid-lg font-medium">Enviados e na fila</h2>
        {comunicados.length === 0 ? (
          <p className="cartao text-fluid-sm text-apoio p-5">Nenhum comunicado ainda.</p>
        ) : (
          comunicados.map((c) => (
            <div key={c.id} className="cartao flex flex-col gap-2 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-titulo text-fluid-base font-medium">
                  {c.grupo} · {ROTULO[c.situacao]}
                </p>
                <SituacaoDoComunicado id={c.id} situacao={c.situacao} />
              </div>
              <p className="text-fluid-sm text-apoio tabular-nums">
                {DATA_E_HORA.format(new Date(c.criado_em))} · {c.enviados} de {c.total} enviados
                {c.falharam > 0 ? ` · ${c.falharam} falharam` : ""}
                {c.pulados > 0 ? ` · ${c.pulados} pulados` : ""}
              </p>
              {c.ultimoMotivo && <p className="text-fluid-sm text-perigo">Última falha: {c.ultimoMotivo}</p>}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
