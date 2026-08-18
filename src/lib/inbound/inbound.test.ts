import { describe, expect, it } from "vitest";
import { normalizarTelefoneBrasileiro } from "./phoneUtils";
import {
  extrairLeadViaRegex,
  extrairVariosLeadsViaRegex,
  identificarPortalOrigem,
} from "./regexFallback";

describe("Inbound Leads — Normalização de Telefone", () => {
  it("normaliza números com formatação completa (11) 98765-4321 para E.164", () => {
    expect(normalizarTelefoneBrasileiro("(11) 98765-4321")).toBe("5511987654321");
  });

  it("normaliza números com prefixo internacional +55", () => {
    expect(normalizarTelefoneBrasileiro("+55 11 99999-8888")).toBe("5511999998888");
  });

  it("assume DDD 11 para números de 9 dígitos sem DDD", () => {
    expect(normalizarTelefoneBrasileiro("98888-7777")).toBe("5511988887777");
  });

  it("retorna null para strings vazias ou sem dígitos", () => {
    expect(normalizarTelefoneBrasileiro("")).toBeNull();
    expect(normalizarTelefoneBrasileiro(null)).toBeNull();
  });
});

describe("Inbound Leads — Identificação de Portal", () => {
  it("identifica Zap Imóveis a partir do remetente", () => {
    expect(
      identificarPortalOrigem({
        from: "leads@grupozap.com",
        subject: "Novo lead interessado",
      }),
    ).toBe("zap_imoveis");
  });

  it("identifica VivaReal a partir do assunto", () => {
    expect(
      identificarPortalOrigem({
        from: "contato@portal.com",
        subject: "VivaReal: Mensagem de interessado no anúncio",
      }),
    ).toBe("vivareal");
  });

  it("identifica OLX", () => {
    expect(
      identificarPortalOrigem({
        from: "notificacoes@olx.com.br",
        subject: "Você recebeu uma nova mensagem",
      }),
    ).toBe("olx");
  });
});

describe("Inbound Leads — Extração via Regex de E-mails Reais de Portais", () => {
  it("extrai dados de e-mail típico do Zap Imóveis", () => {
    const emailZap = {
      from: "leads@grupozap.com",
      subject: "Novo contato de Carlos Eduardo no Zap Imóveis",
      text: `Você recebeu um novo lead pelo Zap Imóveis!
Nome: Carlos Eduardo Silva
Telefone: (11) 98765-4321
E-mail: carlos.eduardo@gmail.com
Imóvel: Residencial Alphaville 1 - Ref 1234
Mensagem: Olá, gostaria de saber se aceita financiamento e se podemos agendar uma visita.`,
    };

    const lead = extrairLeadViaRegex(emailZap);
    expect(lead).not.toBeNull();
    expect(lead?.nome).toBe("Carlos Eduardo Silva");
    expect(lead?.telefone).toBe("5511987654321");
    expect(lead?.email).toBe("carlos.eduardo@gmail.com");
    expect(lead?.portalOrigem).toBe("zap_imoveis");
    expect(lead?.imovelInteresse).toContain("Residencial Alphaville");
  });

  it("extrai dados de e-mail típico do VivaReal em HTML", () => {
    const emailVivaReal = {
      from: "noreply@vivareal.com.br",
      subject: "Novo Interessado no Viva Real",
      html: `<div>
        <h2>Novo Lead Viva Real</h2>
        <p><strong>Cliente:</strong> Mariana Santos</p>
        <p><strong>Whats:</strong> +55 11 97777-6666</p>
        <p><strong>E-mail:</strong> mariana@outlook.com</p>
        <p><strong>Empreendimento:</strong> Edifício Panorama Alphaville</p>
        <p><strong>Dúvida:</strong> Tenho interesse na cobertura duplex.</p>
      </div>`,
    };

    const lead = extrairLeadViaRegex(emailVivaReal);
    expect(lead).not.toBeNull();
    expect(lead?.nome).toBe("Mariana Santos");
    expect(lead?.telefone).toBe("5511977776666");
    expect(lead?.email).toBe("mariana@outlook.com");
    expect(lead?.portalOrigem).toBe("vivareal");
  });

  it("extrai múltiplos leads (lista de 3 a 50 contatos) em um único e-mail", () => {
    const emailEmLote = {
      from: "relatorios@portais.com.br",
      subject: "Relatório diário de contatos",
      text: `Relatório de Leads:
1. João Paulo - (11) 98888-1111 - joao@email.com
2. Fernanda Lima - (11) 97777-2222 - fernanda@email.com
3. Lucas Souza - (11) 96666-3333 - lucas@email.com`,
    };

    const lista = extrairVariosLeadsViaRegex(emailEmLote);
    expect(lista).toHaveLength(3);
    expect(lista[0].telefone).toBe("5511988881111");
    expect(lista[1].telefone).toBe("5511977772222");
    expect(lista[2].telefone).toBe("5511966663333");
  });
});
