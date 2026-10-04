import type { Metadata } from "next";
import { GerenciarTemplates } from "./GerenciarTemplates";
import { getCorretorLogado, getMeusTemplates } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";

export const metadata: Metadata = { title: "Templates" };

/**
 * A biblioteca de modelos diz qual mensagem JÁ FUNCIONOU (roadmap das
 * listas, Fase 2): cada modelo mostra em quantas listas foi usado e a taxa
 * de resposta delas. Antes, escolher modelo era escolher no escuro.
 */
async function desempenhoDosModelos(): Promise<Record<string, { listas: number; enviadas: number; responderam: number }>> {
  const corretor = await getCorretorLogado();
  if (!corretor) return {};
  const { data } = await (await createClient())
    .from("whatsapp_campanhas")
    .select("template_id, total_enviados, total_respondidos")
    .eq("corretor_id", corretor.id)
    .not("template_id", "is", null);
  const porModelo: Record<string, { listas: number; enviadas: number; responderam: number }> = {};
  for (const c of data ?? []) {
    const a = (porModelo[c.template_id as string] ??= { listas: 0, enviadas: 0, responderam: 0 });
    a.listas++;
    a.enviadas += c.total_enviados;
    a.responderam += c.total_respondidos;
  }
  return porModelo;
}

export default async function TemplatesPage() {
  const [templates, desempenho] = await Promise.all([getMeusTemplates(), desempenhoDosModelos()]);

  return (
    <div>
      <CabecalhoDeTela secao="Marketing" titulo="Modelos de mensagem" descricao="As mensagens que você reaproveita nas listas de transmissão, com a taxa de resposta de cada uma. Só você vê e edita os seus." />

      <div className="mt-6">
        <GerenciarTemplates templatesIniciais={templates} desempenho={desempenho} />
      </div>
    </div>
  );
}
