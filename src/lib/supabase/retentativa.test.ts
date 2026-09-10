import { describe, expect, it, vi } from "vitest";
import { comRetentativa, type ErroDoSupabase } from "./retentativa";

/** A união discriminada que o Supabase devolve, no formato mínimo do teste. */
type Resp<T> = { data: T | null; error: ErroDoSupabase };

/**
 * A retentativa das leituras públicas.
 *
 * O que precisa não regredir: erro PASSAGEIRO ganha nova chance, erro de
 * CONSULTA não ganha nenhuma, e nada disto pode transformar uma falha real em
 * espera longa — a home é a página mais aberta do site.
 */

const ok = <T,>(data: T) => ({ data, error: null });
const gateway = { data: null, error: { message: "Gateway Timeout" } };
const semColuna = { data: null, error: { message: "column x does not exist", code: "42703" } };

describe("erro passageiro ganha nova chance", () => {
  it("a segunda tentativa devolve o dado, e o chamador nem vê o tropeço", async () => {
    const consulta = vi
      .fn()
      .mockResolvedValueOnce(gateway)
      .mockResolvedValueOnce(ok(["a", "b"]));

    const r = await comRetentativa<Resp<string[]>>("slugs", consulta);

    expect(r.error).toBeNull();
    expect(r.data).toEqual(["a", "b"]);
    expect(consulta).toHaveBeenCalledTimes(2);
  });

  it("falhando sempre, para depois das tentativas e devolve o erro de verdade", async () => {
    const consulta = vi.fn().mockResolvedValue(gateway);

    const r = await comRetentativa("slugs", consulta);

    // Uma primeira + duas retentativas. O erro sobe como veio: envolver a
    // consulta não pode ESCONDER a falha, só dar uma segunda chance a ela.
    expect(consulta).toHaveBeenCalledTimes(3);
    expect(r.error?.message).toBe("Gateway Timeout");
  });
});

describe("erro de CONSULTA não é repetido", () => {
  /*
   * Coluna inexistente, permissão negada, ambiguidade de relacionamento — o
   * `PGRST201` que já derrubou o site inteiro nesta base. Nenhum melhora na
   * segunda vez; repetir só dobra a espera do visitante antes do mesmo erro.
   */
  it("erro com `code` do PostgREST sai na primeira", async () => {
    const consulta = vi.fn().mockResolvedValue(semColuna);

    const r = await comRetentativa("empreendimentos", consulta);

    expect(consulta).toHaveBeenCalledTimes(1);
    expect(r.error?.code).toBe("42703");
  });

  it("ambiguidade de relacionamento também sai na primeira", async () => {
    const consulta = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "more than one relationship", code: "PGRST201" } });

    await comRetentativa("empreendimentos", consulta);
    expect(consulta).toHaveBeenCalledTimes(1);
  });
});

describe("o caminho feliz não paga nada", () => {
  it("consulta que dá certo é chamada UMA vez", async () => {
    const consulta = vi.fn().mockResolvedValue(ok([1, 2, 3]));
    const r = await comRetentativa<Resp<number[]>>("corretores", consulta);
    expect(consulta).toHaveBeenCalledTimes(1);
    expect(r.data).toEqual([1, 2, 3]);
  });
});

describe("a consulta é refeita, nunca reaproveitada", () => {
  /*
   * O construtor do `postgrest-js` é um thenable de USO ÚNICO: aguardá-lo de
   * novo devolve o resultado já resolvido, sem tocar na rede. Se a fábrica
   * virasse "a consulta pronta", a retentativa repetiria o mesmo erro de
   * graça e pareceria estar funcionando.
   */
  it("cada tentativa chama a fábrica de novo", async () => {
    let vezes = 0;
    const r = await comRetentativa<Resp<string>>("slugs", () => {
      vezes += 1;
      return Promise.resolve(vezes < 3 ? gateway : ok("enfim"));
    });

    expect(vezes).toBe(3);
    expect(r.data).toBe("enfim");
  });
});

describe("o orçamento de tempo", () => {
  it("indisponibilidade longa NÃO vira espera longa", async () => {
    vi.useFakeTimers();
    try {
      // Cada tentativa "demora" 3s, como um gateway que só responde no fim.
      const consulta = vi.fn().mockImplementation(async () => {
        vi.advanceTimersByTime(3_000);
        return gateway;
      });

      const promessa = comRetentativa("slugs", consulta);
      await vi.advanceTimersByTimeAsync(10_000);
      await promessa;

      /*
       * Com o teto de 4s, a segunda tentativa ainda cabe (0s decorridos na
       * checagem) e a terceira não (6s). Sem o teto seriam três timeouts
       * empilhados, e a função estouraria o limite da plataforma — trocando um
       * 500 rápido por um 504 lento, pior para o visitante e para o robô.
       */
      expect(consulta).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
