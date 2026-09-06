import { NextResponse } from "next/server";
import { assinaturaValida } from "@/lib/metaWebhookSignature";
import { normalizarWhatsapp } from "@/lib/whatsapp";
import { createServiceClient } from "@/lib/supabase/service";
import { CAMPOS_DO_ANUNCIO, extrairIdsDoAnuncio, SEM_ANUNCIO } from "@/lib/metaAnuncio";

export const runtime = "nodejs";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v20.0";

/** GET: desafio de verificação que a Meta manda ao salvar a Callback URL. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const modo = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const desafio = url.searchParams.get("hub.challenge");

  if (modo === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN && desafio) {
    return new NextResponse(desafio, { status: 200 });
  }
  return new NextResponse("Verificação inválida.", { status: 403 });
}

type ChangeLeadgen = {
  field: string;
  value?: {
    leadgen_id?: string;
    ad_id?: string;
    form_id?: string;
    page_id?: string;
  };
};

type EventoWebhook = {
  entry?: { changes?: ChangeLeadgen[] }[];
};

type CampoLead = { name: string; values?: string[] };

/** Um campo do formulário da Meta pode vir com um destes nomes. */
function campo(campos: CampoLead[], ...nomes: string[]): string | null {
  for (const nome of nomes) {
    const achado = campos.find((c) => c.name === nome);
    const valor = achado?.values?.[0]?.trim();
    if (valor) return valor;
  }
  return null;
}

async function buscarComRetry(url: string, tentativas = 2): Promise<Response | null> {
  for (let i = 0; i < tentativas; i++) {
    try {
      const resposta = await fetch(url);
      if (resposta.ok) return resposta;
    } catch {
      // tenta de novo
    }
  }
  return null;
}

async function buscarDadosDoLead(leadgenId: string, token: string) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${leadgenId}?fields=field_data,ad_id&access_token=${token}`;
  const resposta = await buscarComRetry(url);
  if (!resposta) return null;

  const corpo = (await resposta.json()) as { field_data?: CampoLead[]; ad_id?: string };
  const campos = corpo.field_data ?? [];

  const nome = campo(campos, "full_name") ?? campo(campos, "first_name");
  const telefoneBruto = campo(campos, "phone_number");
  const email = campo(campos, "email");

  if (!nome || !telefoneBruto) return null;

  const telefone = normalizarWhatsapp(telefoneBruto);
  if (!telefone) return null;

  return { nome, telefone, email, adId: corpo.ad_id };
}

/**
 * O anúncio: nome (para a tela) e os três IDs (para juntar com o gasto).
 *
 * Uma chamada só — `adset` e `campaign` vêm aninhados na mesma resposta.
 * Buscar em três requisições triplicaria a latência de um webhook que já
 * faz uma chamada para os dados do lead, e a Meta espera resposta rápida.
 */
async function buscarAnuncio(adId: string, token: string) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${adId}?fields=${encodeURIComponent(CAMPOS_DO_ANUNCIO)}&access_token=${token}`;
  const resposta = await buscarComRetry(url);
  // Sem resposta, o ad_id do evento ainda vale: é o único ID que temos sem
  // rede, e guardá-lo permite completar campanha e conjunto depois.
  if (!resposta) return extrairIdsDoAnuncio(null, adId);

  try {
    return extrairIdsDoAnuncio(await resposta.json(), adId);
  } catch {
    return extrairIdsDoAnuncio(null, adId);
  }
}

/** POST: evento leadgen. Sempre responde 200 quando assinatura e JSON são válidos. */
export async function POST(req: Request) {
  const corpoBruto = await req.text();

  if (
    !assinaturaValida(
      corpoBruto,
      req.headers.get("x-hub-signature-256"),
      process.env.META_APP_SECRET ?? "",
    )
  ) {
    return NextResponse.json({ erro: "Assinatura inválida." }, { status: 401 });
  }

  let evento: EventoWebhook;
  try {
    evento = JSON.parse(corpoBruto);
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const token = process.env.META_PAGE_ACCESS_TOKEN ?? "";
  /*
   * Chave de SERVIÇO, não a publicável. As policies de `leads` são todas
   * `to authenticated`, e o `anon` tem só INSERT na tabela — o `upsert`
   * abaixo passava por acidente, porque `ignoreDuplicates: true` transforma
   * o conflito em no-op e nunca chega a pedir UPDATE. Equilíbrio frágil:
   * bastaria alguém tirar essa opção para o webhook falhar em silêncio.
   */
  const supabase = createServiceClient();

  const changes =
    evento.entry?.flatMap((entry) => entry.changes ?? []).filter((c) => c.field === "leadgen") ??
    [];

  for (const change of changes) {
    const leadgenId = change.value?.leadgen_id;
    const adId = change.value?.ad_id;
    if (!leadgenId) continue;

    try {
      const dados = await buscarDadosDoLead(leadgenId, token);
      if (!dados) {
        console.error(`Webhook Meta: não foi possível obter dados do lead ${leadgenId}`);
        continue;
      }

      /*
       * O `ad_id` chega por dois caminhos e nem sempre pelos dois: o evento
       * do webhook o traz em `change.value.ad_id`, e os dados do lead o
       * trazem em `ad_id`. Antes só o primeiro era usado — quando ele vinha
       * ausente, o lead nascia sem atribuição nenhuma mesmo com a Graph API
       * sabendo de onde ele veio.
       */
      const idDoAnuncio = adId ?? dados.adId ?? null;
      const anuncio = idDoAnuncio ? await buscarAnuncio(idDoAnuncio, token) : SEM_ANUNCIO;

      const { error } = await supabase.from("leads").upsert(
        {
          meta_lead_id: leadgenId,
          nome: dados.nome,
          telefone: dados.telefone,
          email: dados.email,
          tipo: "comprador",
          origem: "meta/leadads",
          anuncio_origem: anuncio.nome,
          // Os IDs são a chave estável da junção com `meta_ads_metricas`;
          // o nome acima é só rótulo, e muda quando alguém renomeia o
          // anúncio no Gerenciador (roadmap Meta Ads, F0).
          meta_ad_id: anuncio.anuncioId,
          meta_conjunto_id: anuncio.conjuntoId,
          meta_campanha_id: anuncio.campanhaId,
          consentimento_lgpd: true,
          /*
           * Deliberadamente nulo: quem escolhe o dono é o trigger
           * `leads_distribuir` (0007), no BEFORE INSERT. A distribuição mora
           * no banco para que nenhuma porta de entrada precise lembrar de
           * fazê-la — e para não existir uma segunda régua de "quem recebe o
           * próximo lead" para divergir da primeira.
           */
          corretor_id: null,
        },
        /*
         * `ignoreDuplicates` fica: a Meta reentrega o mesmo evento quando a
         * resposta demora, e com a chave de serviço um upsert de verdade
         * sobrescreveria o que o corretor já editou na ficha. Primeira
         * gravação vence.
         */
        { onConflict: "meta_lead_id", ignoreDuplicates: true },
      );

      if (error) {
        console.error(`Webhook Meta: falha ao inserir lead ${leadgenId}: ${error.message}`);
      }
    } catch (e) {
      console.error(`Webhook Meta: erro processando ${leadgenId}:`, e);
    }
  }

  return NextResponse.json({ ok: true });
}
