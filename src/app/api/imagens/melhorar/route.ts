import { NextResponse, type NextRequest } from "next/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { melhorarPedido } from "@/lib/imagens/melhorarPedido";

export const runtime = "nodejs";
/**
 * Curto de propósito. Isto acontece com a pessoa parada olhando para o botão,
 * e `melhorarPedido` já tem orçamento de 12s: o teto aqui é só a rede de
 * segurança da plataforma.
 */
export const maxDuration = 30;

/**
 * Reescrever o pedido do corretor com o motor de texto.
 *
 * Rota separada da geração, e não um passo dentro dela, por uma razão de
 * produto: o corretor precisa VER e poder corrigir o texto antes de gastar uma
 * imagem. Melhorar por dentro, escondido, transformaria toda geração numa
 * caixa-preta um degrau mais funda — e ele nunca aprenderia a pedir melhor,
 * que é justamente o objetivo.
 *
 * Não consome o teto diário: o teto existe porque IMAGEM custa caro por
 * clique. Uma chamada de texto do `gpt-4.1-mini` é ordens de grandeza mais
 * barata, e cobrá-la do mesmo balde faria o corretor economizar exatamente o
 * passo que melhora o resultado.
 */
export async function POST(req: NextRequest) {
  const corretor = await getCorretorLogado();
  if (!corretor) {
    return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  }

  const corpo = (await req.json().catch(() => null)) as {
    prompt?: string;
    receita?: string;
  } | null;

  const prompt = corpo?.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ erro: "Escreva alguma coisa primeiro." }, { status: 400 });
  }

  const r = await melhorarPedido(prompt, corpo?.receita ?? "livre");

  // 200 mesmo quando o motor não respondeu: o texto volta como veio e a tela
  // diz isso em uma linha. Devolver erro faria a pessoa achar que perdeu o que
  // escreveu — e ela não perdeu nada, só não ganhou o degrau.
  return NextResponse.json({ ok: true, texto: r.texto, melhorado: r.melhorado });
}
