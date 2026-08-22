import { describe, expect, it } from "vitest";
import { construirPromptSistema, type ContextoAtendimento } from "./aiAgent";
import { ranquearCatalogo } from "./catalogoRelevante";
import { sanearRespostaIA } from "./guardrails";
import { candidatosTelefone, validarDataVisita } from "./repositorio";
import type { Empreendimento } from "@/lib/types";
import type { DossieClienteIA } from "./types";

function imovel(parcial: Partial<Empreendimento> & { nome: string; slug: string }): Empreendimento {
  return {
    nome: parcial.nome,
    slug: parcial.slug,
    tagline: "",
    descricao: "Descrição de teste",
    bairro: parcial.bairro ?? "Alphaville",
    cidade: parcial.cidade ?? "Barueri",
    status: "lancamento",
    tipo: parcial.tipo ?? "apartamento",
    finalidade: "lancamento",
    precoAPartir: parcial.precoAPartir ?? null,
    capa: (parcial.capa ?? { url: `https://cdn.nexthome.com/${parcial.slug}/capa.jpg`, tipo: "foto", alt: "" }) as Empreendimento["capa"],
    plantas: parcial.plantas ?? [],
    videos: parcial.videos ?? [],
    lazer: [],
    tipologias: [],
  } as unknown as Empreendimento;
}

const dossieBase: DossieClienteIA = {
  id: "d1",
  leadId: "l1",
  orcamentoMin: 500_000,
  orcamentoMax: 800_000,
  formaPagamento: "financiamento",
  perfilFamiliar: "casal_com_filhos",
  urgenciaMudanca: "3_meses",
  exigenciasEspecificas: ["3_vagas"],
  objecoesIdentificadas: ["preco"],
  temperaturaScore: 70,
  temperaturaLabel: "morno",
  resumoExecutivo: "Cliente qualificado.",
  proximoPassoSugerido: "Agendar visita.",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("Vínculo conversa ↔ lead — candidatos de telefone", () => {
  it("gera a variante sem o nono dígito para celular BR", () => {
    expect(candidatosTelefone("5511988881111")).toEqual(["5511988881111", "551188881111"]);
  });

  it("gera a variante com o nono dígito para número curto", () => {
    expect(candidatosTelefone("551188881111")).toEqual(["551188881111", "5511988881111"]);
  });

  it("não inventa variante para número estrangeiro", () => {
    expect(candidatosTelefone("14155552671")).toEqual(["14155552671"]);
  });
});

describe("Guardrails de saída", () => {
  const catalogo = [
    imovel({ nome: "Canvas", slug: "canvas", capa: { url: "https://cdn.x/capa.jpg", tipo: "foto", alt: "" } as unknown as Empreendimento["capa"] }),
  ];

  const resposta = {
    textoResposta: "Segue a planta!",
    sugerirVisita: false,
    transferirHumano: false,
    imoveisRecomendados: [
      { nome: "Canvas", slug: "canvas", preco: null },
      { nome: "Inventado", slug: "nao-existe", preco: null },
    ],
    anexosMidia: [
      { tipo: "foto" as const, url: "https://cdn.x/capa.jpg", titulo: "Capa" },
      { tipo: "foto" as const, url: "https://malicioso.com/foto.jpg", titulo: "Alucinada" },
    ],
    visitaProposta: null,
    meta: { latenciaMs: 10, fallback: false, tokensEntrada: null, tokensSaida: null },
  };

  it("descarta anexo com URL fora do catálogo e conta o bloqueio", () => {
    const saneada = sanearRespostaIA(resposta, catalogo);
    expect(saneada.resposta.anexosMidia).toHaveLength(1);
    expect(saneada.resposta.anexosMidia[0].url).toBe("https://cdn.x/capa.jpg");
    expect(saneada.anexosBloqueados).toBe(1);
  });

  it("filtra recomendação com slug inexistente", () => {
    const saneada = sanearRespostaIA(resposta, catalogo);
    expect(saneada.resposta.imoveisRecomendados.map((r) => r.slug)).toEqual(["canvas"]);
    expect(saneada.slugsBloqueados).toBe(1);
  });
});

describe("Catálogo relevante — ranking léxico", () => {
  const catalogo = Array.from({ length: 15 }, (_, i) =>
    imovel({ nome: `Residencial ${i}`, slug: `res-${i}`, precoAPartir: 300_000 + i * 100_000 }),
  ).concat([
    imovel({ nome: "Canvas Alphaville", slug: "canvas", precoAPartir: 700_000 }),
  ]);

  it("empreendimento citado na mensagem sobe para o topo", () => {
    const top = ranquearCatalogo({ catalogo, mensagemAtual: "quero saber do canvas alphaville" });
    expect(top[0].slug).toBe("canvas");
    expect(top).toHaveLength(10);
  });

  it("faixa de orçamento do dossiê pesa no ranking", () => {
    const top = ranquearCatalogo({ catalogo, mensagemAtual: "olá", dossie: dossieBase });
    // Na faixa (com a tolerância de ±20%): res-1..res-6 e canvas — sete
    // itens empatados, desempatados pela ordem editorial. Fora da faixa
    // (res-12, 1,5M) é penalizado e cai para fora do corte.
    const slugsTop = top.slice(0, 7).map((e) => e.slug);
    expect(slugsTop).toContain("canvas");
    expect(top.map((e) => e.slug)).not.toContain("res-12");
  });

  it("sem sinal nenhum, mantém a ordem editorial (corte antigo)", () => {
    const top = ranquearCatalogo({ catalogo, mensagemAtual: "oi" });
    expect(top.map((e) => e.slug)).toEqual(catalogo.slice(0, 10).map((e) => e.slug));
  });
});

describe("Prompt — tom de voz e dossiê", () => {
  const ctx: ContextoAtendimento = {
    nomeCorretor: "Bruna",
    creciCorretor: "12345",
    telefoneCorretor: "5511999999999",
    nomeAssistente: "Sofia",
    tomVoz: "descontraido_acolhedor",
    catalogo: [],
    historicoMensagens: [],
  };

  it("o tom escolhido pelo corretor entra no prompt (era config decorativa)", () => {
    expect(construirPromptSistema(ctx)).toContain("descontraído e acolhedor");
    expect(construirPromptSistema({ ...ctx, tomVoz: "formal_direto" })).toContain("formal e direto");
  });

  it("tom desconhecido cai no consultivo padrão", () => {
    expect(construirPromptSistema({ ...ctx, tomVoz: "invalido" })).toContain("consultivo de alto padrão");
  });

  it("o dossiê do cliente entra no prompt para a IA não re-perguntar", () => {
    const prompt = construirPromptSistema({ ...ctx, dossie: dossieBase });
    expect(prompt).toContain("O QUE VOCÊ JÁ SABE DESTE CLIENTE");
    expect(prompt).toContain("casal com filhos");
  });

  it("instrui o agendamento com dois horários e confirmação explícita", () => {
    const prompt = construirPromptSistema(ctx);
    expect(prompt).toContain("AGENDAMENTO DE VISITA");
    expect(prompt).toContain("visitaProposta");
  });
});

describe("Validação da data de visita proposta pela IA", () => {
  const agora = new Date("2026-08-22T12:00:00-03:00");

  it("aceita data futura dentro de 60 dias", () => {
    expect(validarDataVisita("2026-08-25T10:00:00-03:00", agora)).not.toBeNull();
  });

  it("recusa data no passado", () => {
    expect(validarDataVisita("2026-08-21T10:00:00-03:00", agora)).toBeNull();
  });

  it("recusa data além de 60 dias (provável parse errado)", () => {
    expect(validarDataVisita("2027-08-25T10:00:00-03:00", agora)).toBeNull();
  });

  it("recusa lixo não-ISO", () => {
    expect(validarDataVisita("terça às 10", agora)).toBeNull();
  });
});
