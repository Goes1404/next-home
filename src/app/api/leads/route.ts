import { NextResponse } from "next/server";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { createClient } from "@/lib/supabase/public";

export const runtime = "nodejs";

type CorpoLead = {
  nome?: string;
  email?: string;
  telefone?: string;
  mensagem?: string;
  empreendimentoSlug?: string;
  origem?: string;
  consentimentoLgpd?: boolean;
  /** Honeypot: campo que só um bot preenche. */
  empresa?: string;
  /** Tempo em ms desde que o formulário apareceu na tela do visitante. */
  elapsedMs?: number | null;
};

/**
 * Limite por IP em memória do processo — best-effort de propósito. Funções
 * serverless não compartilham memória entre instâncias/regiões, então isto
 * não substitui um rate limit de verdade (ex. Upstash), mas já barra o caso
 * comum de um mesmo visitante martelando o form na mesma instância quente.
 */
const ENVIOS_POR_IP = new Map<string, number[]>();
const JANELA_MS = 10 * 60 * 1000;
const LIMITE_NA_JANELA = 5;

function limitado(ip: string): boolean {
  const agora = Date.now();
  const envios = (ENVIOS_POR_IP.get(ip) ?? []).filter((t) => agora - t < JANELA_MS);
  envios.push(agora);
  ENVIOS_POR_IP.set(ip, envios);
  return envios.length > LIMITE_NA_JANELA;
}

function normalizado(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  if (limitado(ip)) {
    return NextResponse.json({ erro: "Muitas tentativas. Tente novamente em alguns minutos." }, { status: 429 });
  }

  let corpo: CorpoLead;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  // Bot: campo-isca preenchido ou envio rápido demais para ser um humano
  // preenchendo o formulário. Responde como sucesso de propósito, para não
  // ensinar o bot a driblar a checagem.
  if (corpo.empresa || (corpo.elapsedMs != null && corpo.elapsedMs < 800)) {
    return NextResponse.json({ ok: true });
  }

  const nome = normalizado(corpo.nome);
  const email = normalizado(corpo.email);
  const telefone = normalizado(corpo.telefone);
  const mensagem = normalizado(corpo.mensagem);

  if (!nome || nome.length < 2 || nome.length > 120) {
    return NextResponse.json({ erro: "Informe seu nome." }, { status: 400 });
  }
  if (!email && !telefone) {
    return NextResponse.json({ erro: "Informe e-mail ou telefone para retornarmos o contato." }, { status: 400 });
  }
  if (mensagem && mensagem.length > 2000) {
    return NextResponse.json({ erro: "Mensagem muito longa." }, { status: 400 });
  }
  if (corpo.consentimentoLgpd !== true) {
    return NextResponse.json({ erro: "É preciso concordar com o tratamento dos dados." }, { status: 400 });
  }

  const supabase = createClient();

  let empreendimentoId: string | null = null;
  const slug = normalizado(corpo.empreendimentoSlug);
  if (slug) {
    const { data } = await supabase
      .from("empreendimentos")
      .select("id")
      .eq("slug", slug)
      .eq("publicado", true)
      .maybeSingle();
    empreendimentoId = data?.id ?? null;
  }

  // Corretor do link pessoal do visitante (ver lib/corretorAtivo.ts) — o
  // mesmo motivo pelo qual os CTAs de WhatsApp são sobrepostos: sem isso, um
  // lead vindo pelo link de um corretor mas sobre empreendimento de outro
  // dono ficaria sem crédito correto de atribuição.
  const corretorAtivo = await getCorretorAtivo();

  const { error } = await supabase.from("leads").insert({
    nome,
    email,
    telefone,
    mensagem,
    empreendimento_id: empreendimentoId,
    corretor_id: corretorAtivo?.id ?? null,
    origem: normalizado(corpo.origem) ?? "site/contato",
    consentimento_lgpd: true,
  });

  if (error) {
    return NextResponse.json({ erro: "Não foi possível enviar agora. Tente pelo WhatsApp." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
