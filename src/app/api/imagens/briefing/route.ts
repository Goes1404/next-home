import { NextResponse, type NextRequest } from "next/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getEmpreendimentoDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { dirigir } from "@/lib/imagens/diretorCriativo";
import { montarBriefing } from "@/lib/imagens/marketing";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Monta o briefing e dirige a peça — sem gastar imagem.
 *
 * É o passo que separa esta tela de "um ChatGPT que gera imagem": o corretor
 * escolhe imóvel, objetivo, canal e público; o código decide assunto, luz e
 * composição a partir da ficha real; a IA escreve a cena e a copy dentro
 * dessa régua; e tudo volta para a tela ANTES de custar uma geração, para
 * ele ler, corrigir e aprender.
 */
export async function POST(req: NextRequest) {
  const corretor = await getCorretorLogado();
  if (!corretor) {
    return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  }

  const corpo = (await req.json().catch(() => null)) as {
    imovelSlug?: string | null;
    objetivo?: string;
    canal?: string;
    publico?: string;
    observacoes?: string;
  } | null;
  if (!corpo?.objetivo || !corpo.canal || !corpo.publico) {
    return NextResponse.json({ erro: "Escolha objetivo, canal e público." }, { status: 400 });
  }

  const imovel = corpo.imovelSlug ? await getEmpreendimentoDoPainel(corpo.imovelSlug) : null;
  if (corpo.imovelSlug && !imovel) {
    return NextResponse.json({ erro: "Imóvel não encontrado." }, { status: 404 });
  }

  const briefing = montarBriefing({
    imovel,
    objetivo: corpo.objetivo as never,
    canal: corpo.canal as never,
    publico: corpo.publico as never,
    observacoes: corpo.observacoes,
  });
  const direcao = await dirigir(briefing);

  return NextResponse.json({
    ok: true,
    cena: direcao.cena,
    copy: direcao.copy,
    origem: direcao.origem,
    problemasDaIa: direcao.problemasDaIa,
    regrasAplicadas: briefing.regrasAplicadas,
    fotoDeReferencia: briefing.fotoDeReferencia,
    ctasPermitidas: briefing.objetivo.ctas,
  });
}
