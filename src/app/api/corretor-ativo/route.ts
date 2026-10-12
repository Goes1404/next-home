import { NextResponse } from "next/server";
import { getCorretorAtivo } from "@/lib/corretorAtivo";

/**
 * O corretor do link pessoal, para o NAVEGADOR (F2b, 12/10/2026).
 *
 * Até aqui os layouts públicos liam o cookie `corretor_ativo` no servidor
 * para desenhar a foto ou o vídeo de fundo do corretor — e `cookies()` num
 * layout torna toda rota abaixo dele dinâmica. Hoje o HTML sai estático com
 * o fundo da casa, e `FundoDoLink` (client) pergunta aqui, só quando o
 * cookie existe no navegador, o que trocar.
 *
 * Custa zero ida ao banco: `getCorretorAtivo` lê a lista de corretores já
 * cacheada por etiqueta. Devolve só o que o fundo precisa — nada de id,
 * telefone ou nome — e `no-store`, porque a resposta é por cookie.
 */
export async function GET() {
  const corretor = await getCorretorAtivo();
  return NextResponse.json(
    {
      corretor: corretor
        ? { fundoTipo: corretor.fundoTipo, fundoFotoUrl: corretor.fundoFotoUrl, videoUrl: corretor.videoUrl }
        : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
