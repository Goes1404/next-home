import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { nomeParaExibir } from "@/lib/leads/nomeExibido";
import { RegistrarIndicacao } from "./RegistrarIndicacao";

/**
 * Indicações na ficha (0123): quem este lead indicou, quem o indicou, e o
 * formulário para registrar uma indicação nova. É daqui que sai a conta de
 * quanto o pedido de indicação pós-venda rende.
 */
export async function Indicacoes({ leadId }: { leadId: string }) {
  const supabase = await createClient();
  // Consulta própria, fora de `SELECT_LEAD`: aquele select é lido por toda
  // tela de lead, e engordá-lo por esta cobraria a coluna na lista inteira.
  const { data: este } = await supabase.from("leads").select("indicado_por").eq("id", leadId).maybeSingle();
  const indicadoPor = este?.indicado_por ?? null;
  const [{ data: indicados }, { data: quemIndicou }] = await Promise.all([
    supabase.from("leads").select("id, nome, telefone, etapa").eq("indicado_por", leadId).limit(20),
    indicadoPor
      ? supabase.from("leads").select("id, nome, telefone").eq("id", indicadoPor).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <section className="cartao space-y-3 p-4">
      <h2 className="text-fluid-sm text-titulo font-medium">Indicações</h2>
      {quemIndicou && (
        <p className="text-fluid-xs text-apoio">
          Indicado por{" "}
          <Link href={`/corretor/leads/${quemIndicou.id}`} className="font-semibold text-corpo underline underline-offset-2">
            {nomeParaExibir(quemIndicou)}
          </Link>
        </p>
      )}
      {indicados && indicados.length > 0 && (
        <ul className="space-y-1">
          {indicados.map((i) => (
            <li key={i.id} className="text-fluid-xs">
              <Link href={`/corretor/leads/${i.id}`} className="font-semibold text-corpo underline underline-offset-2">
                {nomeParaExibir(i)}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <RegistrarIndicacao leadId={leadId} />
    </section>
  );
}
