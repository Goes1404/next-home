import { NextResponse } from "next/server";
import { assinaturaValida } from "@/lib/metaWebhookSignature";
import { normalizarWhatsapp } from "@/lib/whatsapp";
import { createClient } from "@/lib/supabase/public";

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

async function buscarNomeDoAnuncio(adId: string, token: string): Promise<string | null> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${adId}?fields=name&access_token=${token}`;
  const resposta = await buscarComRetry(url);
  if (!resposta) return null;
  const corpo = (await resposta.json()) as { name?: string };
  return corpo.name ?? null;
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
  const supabase = createClient();

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

      const anuncioOrigem = adId ? await buscarNomeDoAnuncio(adId, token) : null;

      const { error } = await supabase.from("leads").upsert(
        {
          meta_lead_id: leadgenId,
          nome: dados.nome,
          telefone: dados.telefone,
          email: dados.email,
          tipo: "comprador",
          origem: "meta/leadads",
          anuncio_origem: anuncioOrigem,
          consentimento_lgpd: true,
          corretor_id: null,
        },
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
