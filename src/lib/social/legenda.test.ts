import { describe, expect, it } from "vitest";
import { hashtagsDe, legendaDoPost } from "./legenda";
import type { Empreendimento } from "@/lib/types";

const IMOVEL = {
  nome: "Terra Alta Barueri",
  status: "em_construcao",
  cidade: "Barueri",
  bairro: "Jardim Tupanci",
  construtora: "P4 Engenharia",
  precoAPartir: 470000,
  entregaPrevista: null,
  tagline: "Morar perto de tudo, com a calma de um bairro residencial.",
  tipologias: [
    { nome: "2", areaPrivativa: 63, dormitorios: 2, suites: 1, banheiros: 2, vagas: 1, preco: null, plantaUrl: null, unidadesDisponiveis: null },
  ],
} as unknown as Empreendimento;

const base = { imovel: IMOVEL, linkDaChamada: "nexthome.com/?corretor=bruna", nomeCorretor: "Bruna" };

describe("legendaDoPost", () => {
  it("traz nome, região, tipologia, estágio e o caminho para o corretor", () => {
    const t = legendaDoPost(base);
    expect(t).toContain("Terra Alta Barueri");
    expect(t).toContain("Jardim Tupanci");
    expect(t).toContain("2 dormitórios");
    expect(t).toContain("Em construção");
    expect(t).toContain("Bruna");
    expect(t).toContain("?corretor=bruna");
  });

  it("NÃO fala valor, mesmo com piso cadastrado", () => {
    /*
     * A conversa libera o piso porque o corretor acompanha e corrige. O
     * post fica no ar: tabela muda, imagem não se edita, e a promessa que o
     * cliente guarda é a que ele leu primeiro.
     */
    expect(legendaDoPost(base)).not.toMatch(/R\$|470|\bmil\b/);
  });

  it("só cita entrega quando a data está cadastrada", () => {
    // Prazo é a promessa mais cara do negócio, e num post fica escrita.
    expect(legendaDoPost(base)).not.toMatch(/Entrega prevista/);

    const comData = { ...IMOVEL, entregaPrevista: "dez/2027" } as Empreendimento;
    expect(legendaDoPost({ ...base, imovel: comData })).toContain("Entrega prevista: dez/2027");
  });
});

describe("hashtagsDe", () => {
  it("junta as fixas com bairro, cidade e construtora, sem acento", () => {
    expect(hashtagsDe(IMOVEL)).toContain("#jardimtupanci");
    expect(hashtagsDe(IMOVEL)).toContain("#p4engenharia");
  });

  it("não repete — hashtag duplicada denuncia post de máquina", () => {
    const emBarueri = { ...IMOVEL, bairro: "Barueri" } as Empreendimento;
    const tags = hashtagsDe(emBarueri);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("ignora campo vazio em vez de gerar '#'", () => {
    const semConstrutora = { ...IMOVEL, construtora: null } as Empreendimento;
    expect(hashtagsDe(semConstrutora)).not.toContain("#");
  });
});
