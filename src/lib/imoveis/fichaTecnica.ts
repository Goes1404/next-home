/**
 * Lê a tabela de metragens da ficha técnica de um book.
 *
 * Existe para tirar a metragem das mãos do modelo. A imagem da planta não
 * diz quantos m² ela tem — o título é texto vetorial da página, e as páginas
 * do PDF vêm em fluxos comprimidos que a extração não associa à imagem.
 * Sem tabela, o modelo escolhe entre as metragens do deck e erra: mediu-se
 * 51,8 m² para a planta de 47,75.
 *
 * O que a imagem TEM, e o modelo lê bem, é o número do final ("PLANTA TIPO
 * FINAL 11"). A tabela faz o resto, e faz sem chutar.
 *
 * A ficha sai da extração em colunas paralelas, uma linha por célula:
 *
 *     FINAL          DORMITÓRIOS       METRAGEM
 *     1              1 dormitório      52 m
 *     2              2 dormitórios     51,8 m
 *     11             3 dormitórios     47,75 m
 *     16 e 17                          49,9 m
 *     …                                 …
 *
 * As colunas de FINAL e METRAGEM têm o mesmo número de itens, na mesma
 * ordem — é essa correspondência que dá `final 11 → 47,75 m²`. Se as duas
 * não baterem em quantidade, a leitura inteira é descartada: tabela
 * desalinhada daria a metragem do vizinho, que é pior que nenhuma.
 */

export type FichaDeMetragens = {
  /** "11" → 47.75, "16" → 49.9, "17" → 49.9 … */
  porFinal: Map<string, number>;
};

const VAZIA: FichaDeMetragens = { porFinal: new Map() };

function numeroBrasileiro(texto: string): number | null {
  const achado = texto.match(/(\d+(?:[.,]\d+)?)\s*m/i);
  if (!achado) return null;
  const n = Number(achado[1].replace(".", "").replace(",", "."));
  return Number.isFinite(n) && n >= 20 && n <= 800 ? n : null;
}

/** "05, 12 e 15" → ["5","12","15"]; "16 e 17" → ["16","17"]; "1" → ["1"]. */
function finaisDaCelula(celula: string): string[] {
  return (celula.match(/\d+/g) ?? []).map((n) => String(Number(n)));
}

export function lerFichaDeMetragens(textoDoDeck: string): FichaDeMetragens {
  const linhas = textoDoDeck.split("\n").map((l) => l.trim());

  const iFinal = linhas.findIndex((l) => l.toUpperCase() === "FINAL");
  const iDormitorios = linhas.findIndex((l) => /^DORMIT[ÓO]RIOS$/i.test(l));
  const iMetragem = linhas.findIndex((l) => l.toUpperCase() === "METRAGEM");

  if (iFinal === -1 || iDormitorios === -1 || iMetragem === -1) return VAZIA;
  if (!(iFinal < iDormitorios && iDormitorios < iMetragem)) return VAZIA;

  const finais = linhas.slice(iFinal + 1, iDormitorios).filter(Boolean);
  const metragens: number[] = [];
  for (const linha of linhas.slice(iMetragem + 1)) {
    const valor = numeroBrasileiro(linha);
    if (valor !== null) {
      metragens.push(valor);
      continue;
    }

    /*
     * O expoente de "m²" costuma sair numa LINHA SÓ DELE ("52 m" seguido de
     * "2"), porque no PDF ele é um caractere separado. Parar nessa linha
     * fazia a coluna terminar na primeira metragem e a tabela inteira ser
     * descartada por desalinhamento — a ficha existia e não era lida.
     */
    if (/^[²2]$/.test(linha)) continue;

    // Linha com palavra de verdade: a coluna acabou, o book continua.
    if (/\p{L}{3}/u.test(linha)) break;
  }

  // Colunas de tamanhos diferentes = leitura desalinhada. Descarta.
  if (finais.length === 0 || finais.length !== metragens.length) return VAZIA;

  const porFinal = new Map<string, number>();
  finais.forEach((celula, i) => {
    for (const final of finaisDaCelula(celula)) porFinal.set(final, metragens[i]);
  });

  /*
   * NÃO existe mapa por dormitório aqui, e a tentativa de ter um foi
   * descartada por medição: a coluna de dormitórios é AGRUPADA (um rótulo
   * para vários finais) e o agrupamento não é regular — no Dom Parque são
   * cinco metragens de 1 dormitório, três de 2 e uma de 3. Dividir as nove
   * em três grupos iguais, como pareceu natural, entregava 68,06 m² para o
   * apartamento de 3 dormitórios, que tem 77,56. Um palpite plausível é
   * exatamente o defeito que esta tabela existe para eliminar.
   */
  return { porFinal };
}

/**
 * A metragem desta planta, quando a ficha permite dizer SEM ambiguidade.
 *
 * Uma porta só: o final que o modelo leu NA IMAGEM ("PLANTA TIPO FINAL 11").
 * Sem final legível não há resposta — melhor campo vazio, que o corretor
 * preenche em dez segundos, do que número errado, que a IA afirma ao cliente
 * e ele confere na visita.
 */
export function metragemPelaFicha(
  ficha: FichaDeMetragens,
  entrada: { final?: string | null },
): number | null {
  if (entrada.final) {
    const soDigitos = entrada.final.match(/\d+/)?.[0];
    if (soDigitos) {
      const achada = ficha.porFinal.get(String(Number(soDigitos)));
      if (achada !== undefined) return achada;
    }
  }

  return null;
}
