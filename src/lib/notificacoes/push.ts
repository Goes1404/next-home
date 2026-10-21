import "server-only";
import webpush from "web-push";
import type { createServiceClient } from "@/lib/supabase/service";

type Supa = ReturnType<typeof createServiceClient>;

export type Notificacao = {
  titulo: string;
  corpo: string;
  /** Para onde o toque na notificação leva (caminho do painel). */
  url: string;
  /** Mesma tag substitui a notificação anterior em vez de empilhar. */
  tag?: string;
};

let configurado: boolean | null = null;

/**
 * Liga o web-push com as chaves VAPID da Vercel. Sem as três variáveis a
 * notificação fica desligada (devolve false), e quem chama segue normal:
 * avisar é bônus, nunca motivo de derrubar um ciclo.
 */
function configurar(): boolean {
  if (configurado !== null) return configurado;
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  const assunto = process.env.VAPID_SUBJECT || "mailto:contato@nexthomeimoveis.com";
  if (!publica || !privada) {
    console.warn("[notificação] sem NEXT_PUBLIC_VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY: não envia");
    configurado = false;
    return false;
  }
  webpush.setVapidDetails(assunto, publica, privada);
  configurado = true;
  return true;
}

/**
 * Manda uma notificação para todo aparelho inscrito do corretor.
 *
 * Endereço que o serviço de push devolve como 404/410 é de aparelho que
 * desinstalou ou revogou a permissão: a inscrição é apagada, senão cada
 * aviso tentaria de novo para sempre. Devolve quantos aparelhos receberam.
 * Nunca lança.
 */
export async function notificarCorretor(supabase: Supa, corretorId: string, n: Notificacao): Promise<number> {
  try {
    if (!configurar()) return 0;
    const { data: inscricoes, error } = await supabase
      .from("inscricoes_push")
      .select("id, endpoint, p256dh, auth")
      .eq("corretor_id", corretorId);
    if (error) {
      console.warn("[notificação] falha ao ler inscrições:", error.message);
      return 0;
    }
    if (!inscricoes?.length) return 0;

    const carga = JSON.stringify({ titulo: n.titulo, corpo: n.corpo.slice(0, 240), url: n.url, tag: n.tag });
    let entregues = 0;
    await Promise.all(
      inscricoes.map(async (i) => {
        try {
          await webpush.sendNotification(
            { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
            carga,
            { TTL: 60 * 60 * 6, urgency: "high" },
          );
          entregues++;
          await supabase.from("inscricoes_push").update({ ultimo_envio_em: new Date().toISOString() }).eq("id", i.id);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await supabase.from("inscricoes_push").delete().eq("id", i.id);
          } else {
            console.warn("[notificação] não saiu:", status ?? err);
          }
        }
      }),
    );
    return entregues;
  } catch (err) {
    console.warn("[notificação] falhou:", err);
    return 0;
  }
}
