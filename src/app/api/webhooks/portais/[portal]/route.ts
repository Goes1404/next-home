import { NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { avisarLeadsNovos } from "@/lib/notificacoes/leadNovo";
import {
  basicDoGrupoOlxConfere,
  configDoPortal,
  lerLeadDoPortal,
  TETO_DO_CORPO,
  tokenComFormato,
  tokenDaRequisicao,
} from "@/lib/portais/formatos";
import { receberLeadDoPortal, registrarLeadIgnorado } from "@/lib/portais/receberLead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Captação direta dos portais (29/10/2026): ZAP Imóveis, Viva Real e OLX
 * pelo webhook de leads do Canal Pro (Grupo OLX), e o formato genérico do
 * CRM para automações. Os formatos e o que é confirmado estão em
 * `src/lib/portais/formatos.ts`.
 *
 * Credencial em duas camadas:
 * - o TOKEN do grupo (`?token=` ou `x-webhook-token`), sorteado na tela
 *   "Integração com portais" do gestor: é ele que diz de que grupo é o lead;
 * - no Grupo OLX, a chave Basic da homologação (`GRUPO_OLX_SECRET_KEY`),
 *   que é por CRM e só diz que quem mandou foi o Grupo OLX.
 *
 * Respostas pensadas para a reentrega do portal (fora de 2xx ele tenta de
 * novo): credencial errada → 401; corpo ilegível → 400; lead sem telefone →
 * 200 com `ok: false` (repetir não conserta); falha do banco → 500 (repetir
 * pode consertar). O lead novo avisa o celular do corretor que a roleta
 * escolheu, depois da resposta.
 */
export async function POST(req: Request, { params }: { params: Promise<{ portal: string }> }) {
  const { portal } = await params;
  const config = configDoPortal(portal);
  if (!config) return NextResponse.json({ erro: "Portal desconhecido." }, { status: 404 });

  const url = new URL(req.url);
  const token = tokenDaRequisicao(url, req.headers);
  if (!tokenComFormato(token)) {
    return NextResponse.json({ erro: "Token de autenticação inválido." }, { status: 401 });
  }
  if (
    config.integracao === "grupo_olx" &&
    !basicDoGrupoOlxConfere(req.headers.get("authorization"), process.env.GRUPO_OLX_SECRET_KEY)
  ) {
    return NextResponse.json({ erro: "Chave do Grupo OLX inválida." }, { status: 401 });
  }

  let corpo: unknown;
  try {
    const bruto = await req.text();
    if (bruto.length > TETO_DO_CORPO) return NextResponse.json({ erro: "Corpo grande demais." }, { status: 413 });
    corpo = JSON.parse(bruto);
  } catch {
    return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
  }

  const supabase = createServiceClient();
  // O token decide o grupo: nada do corpo escolhe grupo, corretor ou imóvel
  // de fora dele.
  const { data: integracao, error: erroDaLeitura } = await supabase
    .from("integracoes_de_portais")
    .select("id, grupo_id, portal, ativo")
    .eq("token", token)
    .maybeSingle();
  if (erroDaLeitura) {
    // Sem a 0245 aplicada a tabela não existe: o portal tenta de novo depois.
    console.error("[portais] leitura da integração falhou:", erroDaLeitura.message);
    return NextResponse.json({ erro: "Webhook indisponível." }, { status: 503 });
  }
  if (!integracao || !integracao.ativo || integracao.portal !== config.integracao) {
    return NextResponse.json({ erro: "Token de autenticação inválido." }, { status: 401 });
  }

  const lido = lerLeadDoPortal(config, corpo);
  if ("erro" in lido) {
    await registrarLeadIgnorado(supabase, integracao, lido.erro);
    return NextResponse.json({ ok: false, mensagem: `Lead ignorado: ${lido.erro}.` }, { status: 200 });
  }

  const r = await receberLeadDoPortal(supabase, integracao, lido);
  if (r.status === "erro") return NextResponse.json({ ok: false, erro: "Falha ao gravar o lead." }, { status: 500 });

  if (r.status === "criado") {
    const leadId = r.leadId;
    after(async () => {
      await avisarLeadsNovos(supabase, new Date(), leadId).catch(() => 0);
    });
  }
  return NextResponse.json({ ok: true, status: r.status });
}
