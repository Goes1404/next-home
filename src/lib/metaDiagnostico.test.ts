import { describe, expect, it } from "vitest";

import {
  contasDeAnuncio,
  DIAS_DE_AVISO_DE_VENCIMENTO,
  idadeDaSincronizacao,
  lerDebugToken,
  linhasParaColar,
  vereditoDoToken,
} from "./metaDiagnostico";

const AGORA = new Date("2026-09-11T12:00:00Z");

describe("lerDebugToken", () => {
  it("lê tipo, app, escopos e validade de um token de usuário", () => {
    const lido = lerDebugToken({
      data: {
        app_id: "111",
        application: "Next Home",
        type: "USER",
        is_valid: true,
        // 60 dias depois de AGORA
        expires_at: Math.floor(new Date("2026-11-10T12:00:00Z").getTime() / 1000),
        scopes: ["ads_read", "public_profile"],
      },
    });

    expect(lido.valido).toBe(true);
    expect(lido.tipo).toBe("usuario");
    expect(lido.appNome).toBe("Next Home");
    expect(lido.temAdsRead).toBe(true);
    expect(lido.expiraEm?.toISOString()).toBe("2026-11-10T12:00:00.000Z");
  });

  it("`expires_at: 0` é token que NÃO vence (o do Usuário do Sistema)", () => {
    const lido = lerDebugToken({
      data: { type: "SYSTEM_USER", is_valid: true, expires_at: 0, scopes: ["ads_read"] },
    });

    expect(lido.tipo).toBe("sistema");
    // Nulo, nunca uma data no passado: 0 é "nunca vence", e tratá-lo como
    // epoch faria o diagnóstico condenar justamente o token definitivo.
    expect(lido.expiraEm).toBeNull();
  });

  it("reconhece token de página, que não lê investimento", () => {
    expect(lerDebugToken({ data: { type: "PAGE", is_valid: true, scopes: [] } }).tipo).toBe(
      "pagina",
    );
  });

  it("token inválido devolve o motivo da Meta, não um vazio", () => {
    const lido = lerDebugToken({
      data: { is_valid: false, error: { message: "Session has expired" } },
    });

    expect(lido.valido).toBe(false);
    expect(lido.erro).toBe("Session has expired");
  });

  it("resposta sem `data` não estoura — vira token inválido", () => {
    expect(lerDebugToken(null).valido).toBe(false);
    expect(lerDebugToken({ error: { message: "Invalid OAuth access token" } }).erro).toBe(
      "Invalid OAuth access token",
    );
  });

  it("aceita ads_read vindo só em granular_scopes", () => {
    // A Meta migrou para escopo granular: o token tem a permissão mas
    // `scopes` pode não citá-la. Olhar só `scopes` reprovaria token bom.
    const lido = lerDebugToken({
      data: {
        type: "USER",
        is_valid: true,
        scopes: ["public_profile"],
        granular_scopes: [{ scope: "ads_read", target_ids: ["act_1"] }],
      },
    });

    expect(lido.temAdsRead).toBe(true);
  });
});

describe("contasDeAnuncio", () => {
  it("tira o prefixo act_ — é o formato que a env var espera", () => {
    const contas = contasDeAnuncio({
      data: [{ id: "act_1852235209038533", name: "Next Home", account_status: 1, currency: "BRL" }],
    });

    expect(contas).toEqual([
      { id: "1852235209038533", nome: "Next Home", ativa: true, moeda: "BRL" },
    ]);
  });

  it("traduz account_status: só 1 é conta ativa", () => {
    const contas = contasDeAnuncio({
      data: [
        { id: "act_1", name: "A", account_status: 1 },
        { id: "act_2", name: "B", account_status: 2 },
      ],
    });

    expect(contas.map((c) => c.ativa)).toEqual([true, false]);
  });

  it("conta sem nome vira o próprio id, nunca string vazia", () => {
    // Sem isso a lista sairia com uma linha em branco e o gestor não teria
    // como escolher — o mesmo motivo de `nomeUtilDoLead` existir.
    expect(contasDeAnuncio({ data: [{ id: "act_9" }] })[0].nome).toBe("9");
  });

  it("resposta vazia ou torta devolve lista vazia", () => {
    expect(contasDeAnuncio(null)).toEqual([]);
    expect(contasDeAnuncio({ data: [{ name: "sem id" }] })).toEqual([]);
  });
});

describe("vereditoDoToken", () => {
  const usuarioOk = {
    valido: true,
    tipo: "usuario" as const,
    appNome: "App",
    temAdsRead: true,
    expiraEm: new Date("2026-11-10T12:00:00Z"),
    escopos: ["ads_read"],
    erro: null,
  };

  it("token bom com conta: serve", () => {
    const v = vereditoDoToken(usuarioOk, [{ id: "1", nome: "N", ativa: true, moeda: "BRL" }], AGORA);
    expect(v.serve).toBe(true);
    expect(v.problema).toBeNull();
  });

  it("token inválido não serve, e o motivo é o da Meta", () => {
    const v = vereditoDoToken(
      { ...usuarioOk, valido: false, erro: "Session has expired" },
      [],
      AGORA,
    );
    expect(v.serve).toBe(false);
    expect(v.problema).toContain("Session has expired");
  });

  it("sem ads_read não serve, e diz o que falta", () => {
    const v = vereditoDoToken({ ...usuarioOk, temAdsRead: false }, [], AGORA);
    expect(v.serve).toBe(false);
    expect(v.problema).toContain("ads_read");
  });

  it("token de página não serve, e diz que investimento não se lê por ali", () => {
    const v = vereditoDoToken({ ...usuarioOk, tipo: "pagina" }, [], AGORA);
    expect(v.serve).toBe(false);
    expect(v.problema).toMatch(/página/i);
  });

  it("token bom sem nenhuma conta de anúncios não serve", () => {
    // Este é o caso do Usuário do Sistema criado e sem ativo atribuído:
    // token válido, ads_read presente, e nada para ler.
    const v = vereditoDoToken(usuarioOk, [], AGORA);
    expect(v.serve).toBe(false);
    expect(v.problema).toMatch(/nenhuma conta/i);
  });

  it("token de usuário avisa quando vence, porque ele vence", () => {
    const v = vereditoDoToken(usuarioOk, [{ id: "1", nome: "N", ativa: true, moeda: "BRL" }], AGORA);
    expect(v.serve).toBe(true);
    expect(v.avisoDeVencimento).toContain("60 dias");
  });

  it("token que não vence não ganha aviso de vencimento", () => {
    const v = vereditoDoToken(
      { ...usuarioOk, tipo: "sistema", expiraEm: null },
      [{ id: "1", nome: "N", ativa: true, moeda: "BRL" }],
      AGORA,
    );
    expect(v.avisoDeVencimento).toBeNull();
  });

  it("token já vencido não serve, mesmo com is_valid true", () => {
    const v = vereditoDoToken(
      { ...usuarioOk, expiraEm: new Date("2026-09-10T12:00:00Z") },
      [{ id: "1", nome: "N", ativa: true, moeda: "BRL" }],
      AGORA,
    );
    expect(v.serve).toBe(false);
    expect(v.problema).toMatch(/venceu/i);
  });

  it("avisa com urgência quando falta pouco", () => {
    const v = vereditoDoToken(
      { ...usuarioOk, expiraEm: new Date(AGORA.getTime() + 3 * 86_400_000) },
      [{ id: "1", nome: "N", ativa: true, moeda: "BRL" }],
      AGORA,
    );
    expect(v.serve).toBe(true);
    expect(v.vencePerto).toBe(true);
    expect(DIAS_DE_AVISO_DE_VENCIMENTO).toBeGreaterThan(3);
  });
});

describe("linhasParaColar", () => {
  it("monta as duas linhas da Vercel com a conta escolhida", () => {
    const texto = linhasParaColar("1852235209038533", "EAAG123");
    expect(texto).toContain("META_ADS_ACCOUNT_ID=1852235209038533");
    expect(texto).toContain("META_ADS_TOKEN=EAAG123");
  });

  it("uma conta só não vira pergunta: já sai escolhida", () => {
    expect(linhasParaColar("42", "t")).not.toMatch(/escolha|qual/i);
  });
});

describe("idadeDaSincronizacao", () => {
  it("nunca sincronizou é estado próprio, não 'muito velho'", () => {
    // São diagnósticos diferentes: um é configuração que nunca rodou, o
    // outro é token que venceu no meio do caminho.
    const i = idadeDaSincronizacao(null, AGORA);
    expect(i.estado).toBe("nunca");
  });

  it("sincronizado hoje não gera linha na tela", () => {
    // Número bom não vira linha: aviso que vive aceso vira paisagem.
    const i = idadeDaSincronizacao("2026-09-11T09:00:00Z", AGORA);
    expect(i.estado).toBe("em_dia");
    expect(i.texto).toBeNull();
  });

  it("ontem ainda é em dia — a Meta ajusta gasto com atraso", () => {
    expect(idadeDaSincronizacao("2026-09-10T09:00:00Z", AGORA).estado).toBe("em_dia");
  });

  it("três dias parado é atraso, e o texto diz quantos dias", () => {
    const i = idadeDaSincronizacao("2026-09-08T09:00:00Z", AGORA);
    expect(i.estado).toBe("atrasado");
    expect(i.dias).toBe(3);
    expect(i.texto).toContain("3 dias");
  });

  it("concorda no singular quando é um dia só", () => {
    // "há 1 dias" na tela do gestor custa autoridade — e é o tipo de erro
    // que passa por revisão humana e não passa por `toBe`.
    const i = idadeDaSincronizacao("2026-09-10T12:00:00Z", new Date("2026-09-11T13:00:00Z"));
    expect(i.texto === null || i.texto.includes("1 dia")).toBe(true);
    expect(i.texto ?? "").not.toContain("1 dias");
  });

  it("data impossível não vira 'há -3 dias'", () => {
    // Relógio do banco à frente do nosso: o piso é zero.
    const i = idadeDaSincronizacao("2026-09-14T12:00:00Z", AGORA);
    expect(i.dias).toBe(0);
    expect(i.estado).toBe("em_dia");
  });

  it("data ilegível é tratada como nunca sincronizou", () => {
    expect(idadeDaSincronizacao("nao é data", AGORA).estado).toBe("nunca");
  });
});
