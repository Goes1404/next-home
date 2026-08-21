import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { dentroDaJanela } from "./antiBan";
import { enviarMensagemWhatsapp } from "./provider";
import { gravarMensagem, obterOuCriarConversa, registrarResultadoEnvio, reservarCotaCampanha } from "./repositorio";

/**
 * Disparador da fila de campanhas.
 *
 * `gerarMensagensCampanhaPersonalizadas` (campaignQueue.ts) só MONTA a fila
 * — calcula texto e horário de cada item e para aí, de propósito, para ser
 * testável sem rede. Alguém precisa, de fato, mandar a mensagem quando o
 * horário chega: é este módulo.
 *
 * Duas portas de entrada chamam esta mesma função:
 *   1. `/api/cron/campanhas`, batido uma vez por dia pelo cron do Vercel
 *      (ver vercel.json) — plano Hobby recusa o deploy inteiro se o cron
 *      for mais frequente que isso, então é o teto real, não uma escolha.
 *   2. O botão "Processar fila agora" no painel de campanhas — sem ele, uma
 *      campanha criada depois do horário do cron ficaria com a IA de braços
 *      cruzados até o disparo do dia seguinte.
 *
 * Cada chamada processa no máximo `limiteTotal` itens, e no máximo
 * `ITENS_POR_INSTANCIA_POR_CHAMADA` por instância — um teto baixo de
 * propósito. Isso é o que preserva o espaçamento anti-ban de 35-75s já
 * calculado em `agendado_para` (campaignQueue.ts): nunca despachamos a fila
 * inteira de um número de uma vez, então mesmo duas chamadas seguidas cedo
 * (cron atrasado, corretor clicando várias vezes) processam poucos itens
 * cada, nunca uma rajada. O que sobra espera a próxima chamada.
 */

const ITENS_POR_INSTANCIA_POR_CHAMADA = 3;
const LIMITE_TOTAL_PADRAO = 20;

export type ResultadoDispatch = {
  processados: number;
  enviados: number;
  erros: number;
  instanciasBloqueadas: number;
  /** false = fora do horário comercial (antiBan.ts): nada foi tentado nesta chamada. */
  dentroDaJanela: boolean;
};

/**
 * Processa itens já vencidos (`agendado_para` no passado) da fila de
 * campanhas.
 *
 * `corretorId` ausente = todos os corretores (uso do cron). Presente =
 * só a fila deste corretor (uso do botão manual, que não deve mexer na fila
 * de ninguém além de quem clicou).
 */
export async function processarFilaCampanhas(params?: {
  corretorId?: string;
  limiteTotal?: number;
}): Promise<ResultadoDispatch> {
  const limiteTotal = params?.limiteTotal ?? LIMITE_TOTAL_PADRAO;
  const supabase = createServiceClient();

  const resultado: ResultadoDispatch = {
    processados: 0,
    enviados: 0,
    erros: 0,
    instanciasBloqueadas: 0,
    dentroDaJanela: true,
  };

  // Campanha é contato frio: fora do horário comercial, nada sai — mesma
  // regra que rege o preview em antiBan.ts. Mensagem de campanha às 3h é a
  // assinatura mais clara de robô que existe.
  if (!dentroDaJanela(new Date())) {
    resultado.dentroDaJanela = false;
    return resultado;
  }

  let query = supabase
    .from("corretor_whatsapp_instancias")
    .select("id, corretor_id, instance_name, conectado_em, bloqueado_ate");

  if (params?.corretorId) query = query.eq("corretor_id", params.corretorId);

  const { data: instancias } = await query;
  if (!instancias || instancias.length === 0) return resultado;

  for (const instancia of instancias) {
    if (resultado.processados >= limiteTotal) break;

    if (instancia.bloqueado_ate && new Date(instancia.bloqueado_ate) > new Date()) {
      resultado.instanciasBloqueadas++;
      continue;
    }

    const { data: campanhasAtivas } = await supabase
      .from("whatsapp_campanhas")
      .select("id")
      .eq("corretor_id", instancia.corretor_id)
      .eq("status", "em_andamento");

    const idsCampanhas = (campanhasAtivas ?? []).map((c) => c.id);
    if (idsCampanhas.length === 0) continue;

    const vagas = Math.min(ITENS_POR_INSTANCIA_POR_CHAMADA, limiteTotal - resultado.processados);
    if (vagas <= 0) break;

    const { data: itens } = await supabase
      .from("whatsapp_campanhas_fila")
      .select("id, campanha_id, telefone, mensagem_personalizada")
      .in("campanha_id", idsCampanhas)
      .eq("status", "pendente")
      .lte("agendado_para", new Date().toISOString())
      .order("agendado_para", { ascending: true })
      .limit(vagas);

    if (!itens || itens.length === 0) continue;

    for (const item of itens) {
      resultado.processados++;

      const cota = await reservarCotaCampanha(
        instancia.id,
        instancia.conectado_em ? new Date(instancia.conectado_em) : null,
      );

      // Cota do NÚMERO estourou (não é problema deste item específico):
      // deixa este e o resto da instância pendentes para a próxima janela,
      // e segue para a próxima instância.
      if (!cota.permitido) break;

      const envio = await enviarMensagemWhatsapp({
        instanceName: instancia.instance_name,
        telefone: item.telefone,
        texto: item.mensagem_personalizada,
      });

      await registrarResultadoEnvio(instancia.id, envio.enviado);

      if (!envio.enviado) {
        resultado.erros++;
        await supabase
          .from("whatsapp_campanhas_fila")
          .update({ status: "erro", erro_motivo: envio.detalhe || envio.motivo || "Falha desconhecida" })
          .eq("id", item.id);
        continue;
      }

      resultado.enviados++;
      await supabase
        .from("whatsapp_campanhas_fila")
        .update({ status: "enviado", enviado_em: new Date().toISOString() })
        .eq("id", item.id);

      // Registra a conversa com origem 'campanha' (isenta da trava de
      // palavra-chave, ver modoBot.ts) e a mensagem enviada, para o
      // corretor ver no Live Chat e para o webhook reconhecer a resposta do
      // cliente quando ela chegar (marcarRespostaCampanha).
      const conversa = await obterOuCriarConversa({
        corretorId: instancia.corretor_id,
        telefoneCliente: item.telefone,
        origem: "campanha",
      });
      if (conversa) {
        await gravarMensagem({
          conversaId: conversa.id,
          remetente: "bot",
          conteudo: item.mensagem_personalizada,
        });
      }
    }

    await atualizarProgressoCampanhas(supabase, idsCampanhas);
  }

  return resultado;
}

/**
 * Recalcula `total_enviados`/status a partir da contagem real de linhas na
 * fila, para cada campanha tocada nesta chamada.
 *
 * Recontar em vez de incrementar é o que torna esta função segura de
 * rodar em paralelo com `marcarRespostaCampanha` (que só toca
 * `total_respondidos`) e repetível sem risco de contar dobrado.
 */
async function atualizarProgressoCampanhas(
  supabase: ReturnType<typeof createServiceClient>,
  idsCampanhas: string[],
): Promise<void> {
  for (const campanhaId of idsCampanhas) {
    const { count: enviados } = await supabase
      .from("whatsapp_campanhas_fila")
      .select("id", { count: "exact", head: true })
      .eq("campanha_id", campanhaId)
      .in("status", ["enviado", "respondido"]);

    const { count: pendentes } = await supabase
      .from("whatsapp_campanhas_fila")
      .select("id", { count: "exact", head: true })
      .eq("campanha_id", campanhaId)
      .eq("status", "pendente");

    await supabase
      .from("whatsapp_campanhas")
      .update({
        total_enviados: enviados ?? 0,
        // Só fecha quando não sobra nada para tentar de novo — um item com
        // erro não trava a campanha em "em_andamento" para sempre porque
        // ele já não é mais 'pendente', mas também não vira 'concluida' à
        // toa: a contagem de pendentes é que decide.
        ...(pendentes === 0 ? { status: "concluida" } : {}),
      })
      .eq("id", campanhaId);
  }
}
