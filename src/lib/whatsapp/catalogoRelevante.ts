import type { Empreendimento } from "@/lib/types";
import type { DossieClienteIA } from "./types";

/**
 * Ranking do catálogo para o prompt da IA.
 *
 * O prompt tem espaço para ~10 empreendimentos, e o corte anterior era
 * `slice(0, 10)` na ordem do banco: com um catálogo de 27, os outros 17
 * simplesmente não existiam para a IA — ela dizia "não temos" para imóvel
 * publicado no site. Este ranking usa o que a conversa e o dossiê já
 * revelaram para escolher QUAIS 10 entram.
 *
 * Léxico e simples de propósito: com dezenas de itens, embeddings seriam
 * infraestrutura sem retorno (ver plano). Reavaliar só em outra ordem de
 * grandeza de catálogo.
 */

const LIMITE_PADRAO = 10;

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function ranquearCatalogo(params: {
  catalogo: Empreendimento[];
  mensagemAtual: string;
  historico?: { texto: string }[];
  dossie?: Pick<DossieClienteIA, "orcamentoMin" | "orcamentoMax" | "exigenciasEspecificas"> | null;
  limite?: number;
}): Empreendimento[] {
  const { catalogo, dossie } = params;
  const limite = params.limite ?? LIMITE_PADRAO;
  if (catalogo.length <= limite) return catalogo;

  // A mensagem atual pesa mais que o histórico: é o assunto de AGORA.
  const textoAtual = normalizar(params.mensagemAtual);
  const textoHistorico = normalizar((params.historico ?? []).map((m) => m.texto).join(" "));
  const exigencias = normalizar((dossie?.exigenciasEspecificas ?? []).join(" "));

  const pontuados = catalogo.map((e, indice) => {
    let pontos = 0;
    const nome = normalizar(e.nome);
    const bairro = normalizar(e.bairro);
    const tipo = normalizar(e.tipo);

    if (textoAtual.includes(nome)) pontos += 100;
    if (textoHistorico.includes(nome)) pontos += 40;
    if (textoAtual.includes(bairro)) pontos += 30;
    if (textoHistorico.includes(bairro)) pontos += 12;
    if (exigencias.includes(tipo)) pontos += 8;

    // Faixa de orçamento do dossiê: dentro dela vale mais; sem preço no
    // cadastro fica neutro (não pode sumir só por estar "sob consulta").
    if (e.precoAPartir && (dossie?.orcamentoMin || dossie?.orcamentoMax)) {
      const min = dossie?.orcamentoMin ?? 0;
      const max = dossie?.orcamentoMax ?? Number.MAX_SAFE_INTEGER;
      if (e.precoAPartir >= min * 0.8 && e.precoAPartir <= max * 1.2) pontos += 25;
      else pontos -= 10;
    }

    // Desempate estável: a ordem editorial do site (destaque/ordem) vale
    // como critério final, então sem sinal nenhum o corte é o mesmo de antes.
    return { e, pontos, indice };
  });

  pontuados.sort((a, b) => b.pontos - a.pontos || a.indice - b.indice);
  return pontuados.slice(0, limite).map((p) => p.e);
}
