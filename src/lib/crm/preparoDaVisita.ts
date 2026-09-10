/**
 * O que levar na cabeça ao sair para a visita.
 *
 * O card de visita mostrava hora, nome, imóvel, etiqueta de etapa e um botão
 * de ligar. Serve para saber QUE existe uma visita; não serve para chegar
 * nela preparado — e chegar preparado é a diferença entre "me mostra o
 * apartamento" e "trouxe a planta do 2 dormitórios que você pediu".
 *
 * O que este módulo faz é traduzir o que o sistema já sabe do cliente em
 * poucas linhas legíveis. Nada aqui vai ao prompt da IA: é texto para uma
 * pessoa ler no celular, minutos antes de encontrar outra pessoa.
 *
 * Função pura, separada da consulta (a mesma divisão de `agendaDeVisitas.ts`
 * × `agendaDoCorretor.ts`): a régua de "o que vale a pena mostrar" precisa de
 * teste, e consulta não se testa sem banco.
 */

export interface DadosDoPreparo {
  regiaoInteresse?: string | null;
  dormitoriosMin?: number | null;
  /** `numeric` do Postgres chega como STRING no supabase-js — converta antes. */
  orcamentoMin?: number | null;
  orcamentoMax?: number | null;
  rendaMensal?: number | null;
  resumoExecutivo?: string | null;
  objecoes?: string[] | null;
}

/** "R$ 470 mil" — no card, o milhar exato é ruído; a ordem de grandeza não. */
function emReais(valor: number): string {
  if (valor >= 1_000_000) {
    const milhoes = valor / 1_000_000;
    return `R$ ${milhoes.toFixed(milhoes % 1 === 0 ? 0 : 1).replace(".", ",")} mi`;
  }
  return `R$ ${Math.round(valor / 1000)} mil`;
}

function faixa(min: number | null | undefined, max: number | null | undefined): string | null {
  if (min && max && min !== max) return `${emReais(min)} a ${emReais(max)}`;
  const unico = max ?? min;
  return unico ? `até ${emReais(unico)}` : null;
}

/**
 * As etiquetas curtas do card: região, tipologia, orçamento, renda.
 *
 * Campo sem valor não vira etiqueta vazia — etiqueta que vive em branco
 * ensina a ignorar as etiquetas, a mesma régua do contador de aba e do
 * cartão de pendência do Início.
 */
export function etiquetasDoPreparo(dados: DadosDoPreparo): string[] {
  const etiquetas: string[] = [];

  if (dados.regiaoInteresse?.trim()) etiquetas.push(dados.regiaoInteresse.trim());
  if (dados.dormitoriosMin) {
    etiquetas.push(`${dados.dormitoriosMin} dorm${dados.dormitoriosMin > 1 ? "s" : ""}`);
  }

  const orcamento = faixa(dados.orcamentoMin, dados.orcamentoMax);
  if (orcamento) etiquetas.push(orcamento);

  if (dados.rendaMensal) etiquetas.push(`renda ${emReais(dados.rendaMensal)}`);

  return etiquetas;
}

/**
 * A objeção que ficou em aberto — a única coisa do dossiê que muda o que o
 * corretor faz nos primeiros minutos da visita.
 *
 * Só a primeira: a lista inteira vira parágrafo, e parágrafo num card
 * ninguém lê antes de sair de casa.
 */
export function objecaoEmAberto(dados: DadosDoPreparo): string | null {
  const primeira = (dados.objecoes ?? []).find((o) => o?.trim());
  return primeira?.trim() ?? null;
}

/**
 * O resumo do dossiê, cortado.
 *
 * Corta em 160 caracteres e na última palavra inteira: meia palavra com
 * reticências parece defeito, e o card tem de caber na tela do celular sem
 * empurrar a próxima visita para fora.
 */
export function resumoCurto(texto: string | null | undefined, limite = 160): string | null {
  const limpo = texto?.trim();
  if (!limpo) return null;
  if (limpo.length <= limite) return limpo;

  const cortado = limpo.slice(0, limite);
  const ultimoEspaco = cortado.lastIndexOf(" ");
  return `${(ultimoEspaco > limite * 0.6 ? cortado.slice(0, ultimoEspaco) : cortado).trimEnd()}…`;
}

/** Há alguma coisa para mostrar? Sem isto, a seção inteira sai do card. */
export function temPreparo(dados: DadosDoPreparo): boolean {
  return (
    etiquetasDoPreparo(dados).length > 0 ||
    objecaoEmAberto(dados) !== null ||
    resumoCurto(dados.resumoExecutivo) !== null
  );
}
