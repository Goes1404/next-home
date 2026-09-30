import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { inicioDaJanelaEmDias } from "@/lib/tempoServidor";

/**
 * SLA e eventos como SEÇÃO da Visão geral (30/09/2026, decisão do usuário).
 *
 * As duas telas saíram do menu da Administração: eram doze subtópicos numa
 * lista corrida. O número que importa de cada uma aparece aqui, e o detalhe
 * continua a um toque (`/corretor/admin/sla` e `/corretor/admin/eventos`).
 */

function duracao(segundos: number | null): string {
  if (segundos === null) return "—";
  if (segundos < 60) return `${segundos}s`;
  if (segundos < 3600) return `${Math.round(segundos / 60)}min`;
  return `${(segundos / 3600).toFixed(1).replace(".", ",")}h`;
}

function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const ordem = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordem.length / 2);
  return ordem.length % 2 ? ordem[meio] : Math.round((ordem[meio - 1] + ordem[meio]) / 2);
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="bg-vidro rounded-xl p-3">
      <p className="text-fluid-xs text-tenue">{rotulo}</p>
      <p className="text-fluid-lg text-titulo mt-0.5 font-bold tabular-nums">{valor}</p>
    </div>
  );
}

function Detalhe({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="text-fluid-xs text-acento-suave inline-flex min-h-11 items-center font-medium underline decoration-transparent underline-offset-4 hover:decoration-current"
    >
      Ver detalhes →
    </Link>
  );
}

export async function SaudeDaOperacao() {
  const supabase = await createClient();
  const corte = inicioDaJanelaEmDias(30);
  const [sla, pendentes, erros] = await Promise.all([
    supabase
      .from("sla_leads_metricas")
      .select("segundos_automatico, segundos_humano")
      .gte("iniciado_em", corte),
    supabase.from("event_outbox").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    supabase.from("event_outbox").select("id", { count: "exact", head: true }).eq("status", "erro"),
  ]);

  const linhas = sla.data ?? [];
  const automaticos = linhas.flatMap((l) => (l.segundos_automatico === null ? [] : [l.segundos_automatico]));
  const humanos = linhas.flatMap((l) => (l.segundos_humano === null ? [] : [l.segundos_humano]));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="cartao p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-fluid-base text-titulo font-bold">Tempo de resposta</h2>
          <Detalhe href="/corretor/admin/sla" />
        </div>
        <p className="text-fluid-xs text-apoio">Primeira resposta aos leads dos últimos 30 dias.</p>
        {sla.error ? (
          <p className="text-fluid-sm text-apoio mt-3">Não foi possível ler agora.</p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Numero rotulo="Leads medidos" valor={String(linhas.length)} />
            <Numero rotulo="Mediana da IA" valor={duracao(mediana(automaticos))} />
            <Numero rotulo="Mediana humana" valor={duracao(mediana(humanos))} />
          </div>
        )}
      </section>
      <section className="cartao p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-fluid-base text-titulo font-bold">Integrações</h2>
          <Detalhe href="/corretor/admin/eventos" />
        </div>
        <p className="text-fluid-xs text-apoio">A fila que leva os fatos do CRM às integrações.</p>
        {pendentes.error ? (
          <p className="text-fluid-sm text-apoio mt-3">Não foi possível ler agora.</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Numero rotulo="Pendentes" valor={String(pendentes.count ?? 0)} />
            <Numero rotulo="Com erro" valor={String(erros.count ?? 0)} />
          </div>
        )}
      </section>
    </div>
  );
}
