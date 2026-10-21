import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp/provider";
import { notificarCorretor } from "@/lib/notificacoes/push";
import { site } from "@/lib/site";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * Manda um aviso ao corretor — o caminho do resumo do dia e dos lembretes.
 * Não passa por cota nem janela: não é contato com cliente. Nunca lança.
 *
 * Sai por dois canais, e basta um para valer (devolve `true`):
 *
 * - WhatsApp, da instância do PRÓPRIO corretor para o número dele. Esse cai
 *   na conversa "Você", SEM notificação — foi assim que a Carolini perdeu 8
 *   leads de anúncio em três dias com o aviso "chegando" (20/10/2026).
 * - Notificação no celular (Web Push, 0203), que não depende do WhatsApp e
 *   é a que de fato chama a atenção. `url` é para onde o toque leva.
 */
export async function avisarCorretor(
  supabase: Supa,
  corretorId: string,
  texto: string,
  url = "/corretor",
): Promise<boolean> {
  const [porWhatsapp, porNotificacao] = await Promise.all([
    avisarPorWhatsapp(supabase, corretorId, texto),
    notificarCorretor(supabase, corretorId, { ...notificacaoDoTexto(texto), url }),
  ]);
  return porWhatsapp || porNotificacao > 0;
}

/**
 * A mesma mensagem, na forma de notificação: a primeira linha (a ação) vira
 * o título e o resto o corpo, sem os endereços — quem leva ao lugar certo é
 * o toque. Texto de uma linha só sai com o nome da casa no título.
 */
export function notificacaoDoTexto(texto: string): { titulo: string; corpo: string } {
  const linhas = texto
    .split("\n")
    .map((l) => l.replace(/\*/g, "").trim())
    .filter((l) => l && !/^(\S+: )?https?:\/\//.test(l));
  if (linhas.length < 2) return { titulo: site.nome, corpo: linhas[0] ?? "" };
  return { titulo: linhas[0], corpo: linhas.slice(1).join("\n") };
}

async function avisarPorWhatsapp(supabase: Supa, corretorId: string, texto: string): Promise<boolean> {
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
