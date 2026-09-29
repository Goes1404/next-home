import type { Metadata } from "next";
import { AbasAdmin } from "@/app/corretor/(painel)/_componentes/AbasAdmin";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { site } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { GestaoDeParceiros } from "./GestaoDeParceiros";

export const metadata: Metadata = { title: "Parceiros" };

/**
 * Corretores parceiros (0125): cada um recebe um link com o espelho de
 * vendas — os imóveis e as unidades disponíveis — e indica clientes por ele.
 * O lead chega marcado com o parceiro, e a co-corretagem é registrada na
 * venda, no Financeiro.
 */
export default async function ParceirosPage() {
  await exigirGestorNaPagina();
  const supabase = await createClient();
  const { data: parceiros } = await supabase
    .from("parceiros")
    .select("id, nome, imobiliaria, creci, telefone, ativo, token")
    .order("created_at", { ascending: false });
  const ids = (parceiros ?? []).map((p) => p.id);
  const { data: leads } = ids.length
    ? await supabase.from("leads").select("parceiro_id").in("parceiro_id", ids).limit(5000)
    : { data: [] };
  const contagem = new Map<string, number>();
  for (const l of leads ?? []) if (l.parceiro_id) contagem.set(l.parceiro_id, (contagem.get(l.parceiro_id) ?? 0) + 1);

  return (
    <div>
      <CabecalhoDeTela
        secao="Administração"
        titulo="Parceiros"
        descricao="Corretores de fora veem as unidades disponíveis e indicam clientes pelo link."
      />
      <div className="mt-4">
        <AbasAdmin ativa="/corretor/admin/parceiros" />
      </div>
      <div className="mt-6">
        <GestaoDeParceiros
          parceiros={(parceiros ?? []).map((p) => ({
            id: p.id,
            nome: p.nome,
            imobiliaria: p.imobiliaria,
            creci: p.creci,
            telefone: p.telefone,
            ativo: p.ativo,
            link: `${site.url}/parceiro/${p.token}`,
            indicados: contagem.get(p.id) ?? 0,
          }))}
        />
      </div>
    </div>
  );
}
