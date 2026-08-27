import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * Sonda de diagnóstico do provedor de WhatsApp.
 *
 * ## Por que ela existe
 *
 * Em 27/08/2026 a Evolution passou a devolver `key.id` para todo envio — ou
 * seja, confirmação de mensagem criada — e **nenhuma das mensagens chegou**,
 * nem ao destinatário nem ao histórico do próprio número que enviou. Ao
 * mesmo tempo, a entrada continuava funcionando: chegou mensagem de cliente
 * às 11:19, no mesmo minuto do disparo.
 *
 * Recebe mas não entrega, e mesmo assim confirma. Nenhum dado que o nosso
 * banco guarda distingue as causas possíveis, e a URL e a chave do provedor
 * vivem só nas variáveis de ambiente de produção — não há como perguntar a
 * ele de fora.
 *
 * A saída é a mesma que este projeto já usou no caso do `sharp`: **erro que
 * só existe no runtime se investiga NO runtime**. A sonda roda dentro da
 * função, pergunta ao provedor e grava a resposta CRUA em `admin_eventos`,
 * que é lido depois com calma.
 *
 * ## Por que gravar o corpo cru
 *
 * Porque foi exatamente o descarte do corpo (`res.json().catch(() => null)`)
 * que manteve o defeito invisível por semanas. Aqui nada é interpretado: o
 * texto vai como veio, truncado só no necessário.
 *
 * TEMPORÁRIA. Quando a causa aparecer, some junto com o botão que a chama.
 */

const TETO_DO_CORPO = 4000;

type Passo = {
  passo: string;
  url: string;
  status: number | null;
  corpo: string;
};

async function perguntar(nome: string, url: string, init?: RequestInit): Promise<Passo> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timeout);
    const corpo = await res.text().catch(() => "(corpo ilegível)");
    return { passo: nome, url, status: res.status, corpo: corpo.slice(0, TETO_DO_CORPO) };
  } catch (err) {
    return {
      passo: nome,
      url,
      status: null,
      corpo: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }
}

/**
 * Pergunta ao provedor três coisas e grava tudo.
 *
 * 1. Quais instâncias existem, e em que estado — é aqui que apareceria uma
 *    instância duplicada ou pareada a outro número.
 * 2. O estado da conexão desta instância, direto da fonte. O nosso banco
 *    diz "conectado", mas quem sabe a verdade é o provedor.
 * 3. Um envio de teste PARA O PRÓPRIO NÚMERO conectado, com a resposta
 *    inteira. Mandar para si mesmo é o teste mais limpo que existe: não
 *    gasta a reputação com terceiro, não incomoda cliente nenhum, e o
 *    resultado é verificável na hora abrindo o próprio WhatsApp.
 */
export async function sondarProvedor(instanceName: string, numeroDestino: string) {
  const baseUrl = process.env.WHATSAPP_API_URL?.replace(/\/$/, "");
  const apiKey = process.env.WHATSAPP_API_KEY;

  if (!baseUrl || !apiKey) {
    return { erro: "WHATSAPP_API_URL / WHATSAPP_API_KEY não estão definidas neste ambiente." };
  }

  const cabecalho = { "Content-Type": "application/json", apikey: apiKey };
  const instancia = encodeURIComponent(instanceName);

  const passos: Passo[] = [];
  passos.push(await perguntar("instâncias no provedor", `${baseUrl}/instance/fetchInstances`, { headers: cabecalho }));
  passos.push(
    await perguntar("estado desta conexão", `${baseUrl}/instance/connectionState/${instancia}`, { headers: cabecalho }),
  );
  passos.push(
    await perguntar("envio de teste para o próprio número", `${baseUrl}/message/sendText/${instancia}`, {
      method: "POST",
      headers: cabecalho,
      body: JSON.stringify({
        number: numeroDestino,
        text: `Teste de diagnóstico Next Home — ${new Date().toISOString()}`,
      }),
    }),
  );

  // Cliente de serviço: `admin_eventos` não tem policy de INSERT de
  // propósito (log que o ator pode forjar não é log), então só as funções
  // security definer e o serviço escrevem nele.
  const supabase = createServiceClient();
  await supabase.from("admin_eventos").insert({
    acao: "diagnostico_provedor_whatsapp",
    detalhes: { instanceName, numeroDestino, passos },
  });

  return { ok: true, passos: passos.map((p) => ({ passo: p.passo, status: p.status })) };
}
