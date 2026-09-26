import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp/provider";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * Manda um aviso da instância do PRÓPRIO corretor para o WhatsApp dele — o
 * caminho do resumo do dia e dos lembretes. Não passa por cota nem janela:
 * não é contato com cliente. Sem número conectado, sem `whatsapp`
 * cadastrado ou corretor inativo, o aviso não sai e devolve `false`.
 * Nunca lança.
 */
export async function avisarCorretor(supabase: Supa, corretorId: string, texto: string): Promise<boolean> {
  try {
    const [{ data: inst }, { data: corretor }] = await Promise.all([
      supabase
        .from("corretor_whatsapp_instancias")
        .select("instance_name")
        .eq("corretor_id", corretorId)
        .eq("status_conexao", "conectado")
        .limit(1)
        .maybeSingle(),
      supabase.from("corretores").select("whatsapp, ativo").eq("id", corretorId).maybeSingle(),
    ]);
    if (!inst?.instance_name || !corretor?.ativo || !corretor.whatsapp) return false;
    const envio = await enviarMensagemWhatsapp({ instanceName: inst.instance_name, telefone: corretor.whatsapp, texto });
    if (!envio.enviado) console.warn("[aviso ao corretor] não saiu:", envio.motivo);
    return envio.enviado;
  } catch (err) {
    console.warn("[aviso ao corretor] falhou:", err);
    return false;
  }
}
