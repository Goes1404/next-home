import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { aplicarTemplate } from "@/lib/whatsapp/campaignQueue";
import type { ContextoTemplate } from "@/lib/whatsapp/listaDeTransmissao";
import { placarDaFila, resultadoAB, vencedoraDoPlacar } from "@/lib/whatsapp/testeAB";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * O teste A/B escolhe a vencedora sozinho (0121, 26/09/2026).
 *
 * Roda no disparador, antes de pegar o próximo item, para as campanhas
 * ativas que têm segunda versão e ainda não decidiram. Quando o placar
 * atinge a régua de `resultadoAB` (30 envios de cada lado e respostas
 * diferentes), grava `variante_vencedora` e reescreve os itens PENDENTES da
 * perdedora com o texto da vencedora (e sem letra: já não fazem parte do teste).
 *
 * O carimbo é o claim: o UPDATE só vale se `variante_vencedora` ainda é
 * nulo, então dois tiques não reescrevem a fila duas vezes. Os itens
 * reescritos voltam a `personalizado_por_ia = false` e perdem a conferência
 * (`semelhanca_max` nula): o disparador reescreve e confere de novo no envio,
 * sobre o texto novo.
 *
 * Nunca lança: falhar aqui só adia a troca para o próximo tique, e o
 * disparo segue com o texto que já estava na fila.
 */
export async function aplicarVencedoras(supabase: Supa, campanhaIds: string[]): Promise<number> {
  if (campanhaIds.length === 0) return 0;
  try {
    const { data: campanhas } = await supabase
      .from("whatsapp_campanhas")
      .select("id, mensagem_base, mensagem_base_b, contexto_template, empreendimento:empreendimentos(nome)")
      .in("id", campanhaIds)
      .not("mensagem_base_b", "is", null)
      .is("variante_vencedora", null);

    let trocadas = 0;
    for (const c of campanhas ?? []) {
      const { data: itens } = await supabase
        .from("whatsapp_campanhas_fila")
        .select("variante, status")
        .eq("campanha_id", c.id)
        .not("variante", "is", null);
      const vencedora = vencedoraDoPlacar(resultadoAB(placarDaFila(itens ?? [])));
      if (!vencedora) continue;

      const { data: carimbo } = await supabase
        .from("whatsapp_campanhas")
        .update({ variante_vencedora: vencedora, vencedora_em: new Date().toISOString() })
        .eq("id", c.id)
        .is("variante_vencedora", null)
        .select("id");
      if (!carimbo || carimbo.length === 0) continue;
      trocadas++;

      // Os pendentes da vencedora também saem do teste: o placar fica
      // com o que foi enviado ANTES da decisão.
      await supabase
        .from("whatsapp_campanhas_fila")
        .update({ variante: null })
        .eq("campanha_id", c.id)
        .eq("status", "pendente")
        .eq("variante", vencedora);

      const perdedora = vencedora === "A" ? "B" : "A";
      const texto = vencedora === "A" ? c.mensagem_base : c.mensagem_base_b!;
      const imovel = Array.isArray(c.empreendimento) ? c.empreendimento[0] : c.empreendimento;

      const { data: pendentes } = await supabase
        .from("whatsapp_campanhas_fila")
        .select("id, lead_id")
        .eq("campanha_id", c.id)
        .eq("status", "pendente")
        .eq("variante", perdedora);
      if (!pendentes || pendentes.length === 0) continue;

      const leadIds = [...new Set(pendentes.map((p) => p.lead_id).filter((id): id is string => Boolean(id)))];
      const { data: leads } = leadIds.length
        ? await supabase.from("leads").select("id, nome").in("id", leadIds)
        : { data: [] as Array<{ id: string; nome: string }> };
      const nomes = new Map((leads ?? []).map((l) => [l.id, l.nome]));

      for (const p of pendentes) {
        await supabase
          .from("whatsapp_campanhas_fila")
          .update({
            /*
             * Sem letra depois da decisão (roadmap das listas, Fase 2): o
             * item já não faz parte do teste. Antes ele ganhava a letra da
             * vencedora, e o placar passava a misturar envios de depois da
             * troca. Sem letra, a reescrita do envio volta a poder mexer na
             * abertura, que durante o teste fica fixa.
             */
            variante: null,
            personalizado_por_ia: false,
            semelhanca_max: null,
            tentativas_texto: 0,
            mensagem_personalizada: aplicarTemplate({
              mensagemBase: texto,
              nomeLead: (p.lead_id && nomes.get(p.lead_id)) || "",
              empreendimentoNome: imovel?.nome ?? undefined,
              contexto: c.contexto_template as ContextoTemplate | null,
            }),
          })
          .eq("id", p.id)
          .eq("status", "pendente");
      }
    }
    return trocadas;
  } catch (err) {
    console.warn("[A/B] escolha da vencedora adiada:", err);
    return 0;
  }
}
