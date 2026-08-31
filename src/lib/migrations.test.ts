import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda da numeração das migrations.
 *
 * Duas sessões trabalhando em paralelo criaram dois arquivos `0020_` sem
 * que nada reclamasse — e a colisão só apareceu quando alguém leu a pasta
 * por acaso. Como estas migrations são aplicadas à mão (não pelo CLI do
 * Supabase, que rastreia por timestamp), o número é a única coisa que
 * define a ordem de execução: dois arquivos com o mesmo prefixo tornam
 * essa ordem indefinida.
 */
const DIR_MIGRATIONS = join(process.cwd(), "supabase", "migrations");

/**
 * Números que outra branch já ocupou, e que por isso ficam vagos AQUI.
 *
 * Descoberto em 31/08/2026 auditando o roadmap: a branch que está de fato
 * em produção (`ingestao-de-midia`, deploy `4c1359c` de 29/08 — nem a
 * `main`, nem a `claude/modernizar-plataforma-imobiliaria-2tm13q` que a
 * MEMORIA registrava) traz `0064` a `0069` com conteúdo próprio
 * (atribuição de marketing, outbox de eventos, consentimentos, SLA,
 * opt-out). O trabalho desta branch nasceu como 0064/0065 e foi renumerado
 * para 0070/0071.
 *
 * Entre as duas opções, a colisão é pior que o buraco: dois arquivos
 * `0064_*.sql` com conteúdos diferentes só se revelam no merge, e o número
 * é a ÚNICA coisa que define a ordem de execução aqui (estas migrations não
 * passam pelo CLI do Supabase). O buraco, em compensação, se fecha sozinho
 * quando as branches se encontrarem.
 *
 * Ao fundir com a branch de produção, esta lista deve ficar VAZIA — e o
 * teste abaixo reprova reserva que já foi ocupada, para ela não virar
 * comentário morto.
 */
const RESERVADOS = new Set([64, 65, 66, 67, 68, 69]);

function migrations(): { arquivo: string; prefixo: string }[] {
  return readdirSync(DIR_MIGRATIONS)
    .filter((nome) => nome.endsWith(".sql"))
    .map((arquivo) => ({ arquivo, prefixo: arquivo.slice(0, 4) }));
}

describe("Numeração das migrations", () => {
  it("não tem dois arquivos com o mesmo prefixo", () => {
    const porPrefixo = new Map<string, string[]>();
    for (const { arquivo, prefixo } of migrations()) {
      porPrefixo.set(prefixo, [...(porPrefixo.get(prefixo) ?? []), arquivo]);
    }

    const colisoes = [...porPrefixo.entries()].filter(([, arquivos]) => arquivos.length > 1);

    expect(
      colisoes.map(([prefixo, arquivos]) => `${prefixo}: ${arquivos.join(" e ")}`),
    ).toEqual([]);
  });

  it("usa quatro dígitos no prefixo, seguidos de underscore", () => {
    const foraDoPadrao = migrations()
      .filter(({ arquivo }) => !/^\d{4}_/.test(arquivo))
      .map(({ arquivo }) => arquivo);

    expect(foraDoPadrao).toEqual([]);
  });

  it("não pula números na sequência, exceto os reservados aqui", () => {
    // Um buraco quase sempre significa arquivo perdido num merge, não uma
    // decisão — e passaria despercebido até alguém tentar recriar o banco
    // do zero. "Quase sempre": quando FOR decisão, ela é declarada em
    // RESERVADOS acima, onde alguém a vê ao revisar. Buraco não declarado
    // continua reprovando, que é o ponto da guarda.
    const numeros = migrations()
      .map(({ prefixo }) => Number(prefixo))
      .sort((a, b) => a - b);

    const faltando: number[] = [];
    for (let n = numeros[0]; n < numeros[numeros.length - 1]; n++) {
      if (!numeros.includes(n) && !RESERVADOS.has(n)) faltando.push(n);
    }

    expect(faltando).toEqual([]);
  });

  it("não reserva número que já existe — reserva obsoleta é ruído", () => {
    const existentes = new Set(migrations().map(({ prefixo }) => Number(prefixo)));
    const reservadosOcupados = [...RESERVADOS].filter((n) => existentes.has(n));

    expect(reservadosOcupados).toEqual([]);
  });
});
