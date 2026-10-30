import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp/provider";
import { notificarCorretor } from "@/lib/notificacoes/push";
import { lerMarcaDoCrm } from "@/lib/marcaDoCrm/ler";
import { NOME_SEM_LEITURA } from "@/lib/marcaDoCrm/marca";
import { site } from "@/lib/site";
import { avisoPeloCentral } from "@/lib/central/avisos";

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
 *
 * `espontaneo`: é um dos avisos do desenho do número central (spec 4.7 —
 * hoje, só o resumo do dia passa por aqui). Com o central ligado para a
 * pessoa, o WhatsApp sai PELO CENTRAL e toca; senão (ou se o central falhar
 * no minuto), sai como sempre. A notificação no celular não muda. Os demais
 * avisos (alertas de conversa, reuniões…) não passam `espontaneo` e ficam no
 * canal de hoje: avisos demais pelo central é o anti-objetivo 6.2.
 */
export async function avisarCorretor(
  supabase: Supa,
  corretorId: string,
  texto: string,
  url = "/corretor",
  opcoes: { espontaneo?: boolean } = {},
): Promise<boolean> {
  const nomeDaCasa = await nomeDaCasaDoCorretor(supabase, corretorId);
  const porWhatsappHoje = () => avisarPorWhatsapp(supabase, corretorId, texto);
  const [porWhatsapp, porNotificacao] = await Promise.all([
    opcoes.espontaneo
      ? avisoPeloCentral(supabase, corretorId, texto).then((peloCentral) => peloCentral || porWhatsappHoje())
      : porWhatsappHoje(),
    notificarCorretor(supabase, corretorId, { ...notificacaoDoTexto(texto, nomeDaCasa), url }),
  ]);
  return porWhatsapp || porNotificacao > 0;
}

/**
 * A mesma mensagem, na forma de notificação: a primeira linha (a ação) vira
 * o título e o resto o corpo, sem os endereços — quem leva ao lugar certo é
 * o toque. Texto de uma linha só sai com o nome da casa no título: o do grupo
 * do corretor (`nomeDaCasaDoCorretor`), a Next Home no grupo 1.
 */
export function notificacaoDoTexto(texto: string, nomeDaCasa: string = site.nome): { titulo: string; corpo: string } {
  const linhas = texto
    .split("\n")
    .map((l) => l.replace(/\*/g, "").trim())
    .filter((l) => l && !/^(\S+: )?https?:\/\//.test(l));
  if (linhas.length < 2) return { titulo: nomeDaCasa, corpo: linhas[0] ?? "" };
  return { titulo: linhas[0], corpo: linhas.slice(1).join("\n") };
}

/**
 * O nome da casa do grupo do corretor, para o título da notificação. Lê o
 * grupo da ficha (uma linha) e a marca vem do cache de 60 s: o laço de um
 * cron sobre 40 corretores do mesmo grupo lê o grupo uma vez. Não lança; sem
 * conseguir ler a ficha, o nome genérico (nunca o de outra casa).
 */
async function nomeDaCasaDoCorretor(supabase: Supa, corretorId: string): Promise<string> {
  try {
    const { data } = await supabase.from("corretores").select("grupo_id").eq("id", corretorId).maybeSingle();
    if (!data?.grupo_id) return NOME_SEM_LEITURA;
    return (await lerMarcaDoCrm(data.grupo_id)).nome;
  } catch (err) {
    console.warn("[aviso ao corretor] nome da casa não lido:", err);
    return NOME_SEM_LEITURA;
  }
}

/**
 * Marca invisível no fim de todo aviso ao corretor pelo WhatsApp (Agenda,
 * fase 5): se o provedor devolver o eco da mensagem na conversa do próprio
 * corretor, o canal de comandos (`agenda/comandos/canal.ts`) a reconhece e
 * não a lê como pedido. U+2063 não aparece na tela.
 */
export const MARCA_INVISIVEL_DO_SISTEMA = "\u2063";

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
    const envio = await enviarMensagemWhatsapp({
      instanceName: inst.instance_name,
      telefone: corretor.whatsapp,
      texto: `${texto}${MARCA_INVISIVEL_DO_SISTEMA}`,
    });
    if (!envio.enviado) console.warn("[aviso ao corretor] não saiu:", envio.motivo);
    return envio.enviado;
  } catch (err) {
    console.warn("[aviso ao corretor] falhou:", err);
    return false;
  }
}
