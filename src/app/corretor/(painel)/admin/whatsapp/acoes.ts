"use server";

import { revalidatePath } from "next/cache";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { createServiceClient } from "@/lib/supabase/service";
import { desconectarInstancia } from "@/lib/whatsapp/provider";

/**
 * O ADM derruba o número de um corretor (30/09/2026, 0134).
 *
 * Existe para o caso de alguém sair da empresa ou perder o aparelho com o
 * número ainda respondendo em nome da imobiliária. É o único poder do ADM
 * sobre o WhatsApp de outro: ele não conecta (isso exige o celular do dono)
 * e não mexe no tom da IA de ninguém.
 *
 * Desde a 0134 a RLS não dá ao gestor a instância alheia, então a escrita
 * vai pela chave de serviço, DEPOIS da guarda de papel. Fica registrada em
 * `admin_eventos`, com quem fez, para o corretor saber por que caiu.
 */
export async function desconectarNumeroDoCorretor(
  corretorId: string,
): Promise<{ ok?: string; erro?: string }> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };

  const servico = createServiceClient();
  const { data: instancia } = await servico
    .from("corretor_whatsapp_instancias")
    .select("id, instance_name")
    .eq("corretor_id", corretorId)
    .maybeSingle();
  if (!instancia?.instance_name) return { erro: "Este corretor não tem número conectado." };

  const resultado = await desconectarInstancia(instancia.instance_name);
  if (!resultado.ok) {
    return { erro: resultado.detalhe || "Não foi possível desconectar agora. Tente novamente." };
  }

  await servico
    .from("corretor_whatsapp_instancias")
    .update({
      status_conexao: "desconectado",
      // Zerar a base da curva de aquecimento: número novo não herda a
      // maturidade do anterior (mesma regra do botão do próprio corretor).
      conectado_em: null,
      telefone_conectado: null,
      qrcode_base64: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", instancia.id);

  await servico.from("admin_eventos").insert({
    ator_id: guarda.corretor.id,
    acao: "numero_desconectado",
    alvo_corretor_id: corretorId,
  });

  revalidatePath("/corretor/admin/whatsapp");
  return { ok: "Número desconectado. A IA desse corretor para até ele conectar de novo." };
}
