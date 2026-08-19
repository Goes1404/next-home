import { describe, it, expect } from "vitest";
import { extrairVariosLeadsComIA } from "./aiParser";
import { extrairVariosLeadsViaRegex, identificarPortalOrigem } from "./regexFallback";

describe("Extrator Visual de E-mails / Gmail e Portais", () => {
  it("identifica corretamente o portal Zap Imóveis a partir do texto do e-mail", () => {
    const emailZap = {
      from: "leads@zapimoveis.com.br",
      subject: "Novo lead interessado no imóvel Canvas Alphaville",
      text: `Nome: Roberto Albuquerque de Mello
Telefone: (11) 98452-9910
E-mail: roberto.albuquerque@gmail.com
Imóvel: Canvas Alphaville
Mensagem: Olá, tenho interesse na planta de 180m²`,
    };

    const portal = identificarPortalOrigem(emailZap);
    expect(portal).toBe("zap_imoveis");

    const leads = extrairVariosLeadsViaRegex(emailZap);
    expect(leads.length).toBe(1);
    expect(leads[0].nome).toContain("Roberto");
    expect(leads[0].telefone).toBe("5511984529910");
    expect(leads[0].email).toBe("roberto.albuquerque@gmail.com");
    expect(leads[0].portalOrigem).toBe("zap_imoveis");
  });

  it("identifica corretamente o portal VivaReal e extrai telefone com DDD", () => {
    const emailViva = {
      from: "atendimento@vivareal.com.br",
      subject: "Lead Interessado - Origem Alphaville",
      text: `Cliente: Juliana Castro Mendes
WhatsApp: (11) 99871-2234
E-mail: juliana.castro@uol.com.br
Interesse: Origem Alphaville`,
    };

    const portal = identificarPortalOrigem(emailViva);
    expect(portal).toBe("vivareal");

    const leads = extrairVariosLeadsViaRegex(emailViva);
    expect(leads.length).toBe(1);
    expect(leads[0].nome).toContain("Juliana");
    expect(leads[0].telefone).toBe("5511998712234");
    expect(leads[0].portalOrigem).toBe("vivareal");
  });

  it("identifica OLX com telefone numérico sem formatação", () => {
    const emailOlx = {
      from: "contato@olx.com.br",
      subject: "Novo contato para o anúncio: Casa em Alphaville",
      text: `Nome do interessado: Marcelo Viana Pinto
Celular: 11976543210
Email: marcelo.viana@techcorp.io
Mensagem enviada: Gostaria de mais informações`,
    };

    const portal = identificarPortalOrigem(emailOlx);
    expect(portal).toBe("olx");

    const leads = extrairVariosLeadsViaRegex(emailOlx);
    expect(leads.length).toBe(1);
    expect(leads[0].nome).toContain("Marcelo");
    expect(leads[0].telefone).toBe("5511976543210");
  });

  it("identifica Imovelweb e extrai dados com sucesso", () => {
    const emailImovelweb = {
      from: "leads@imovelweb.com.br",
      subject: "Proposta recebida - Imovelweb",
      text: `Nome: Dra. Beatriz Siqueira
Telefone: (11) 99112-3344
E-mail: beatriz.siqueira@med.usp.br
Imóvel de Referência: Alphasítio`,
    };

    const portal = identificarPortalOrigem(emailImovelweb);
    expect(portal).toBe("imovelweb");

    const leads = extrairVariosLeadsViaRegex(emailImovelweb);
    expect(leads.length).toBe(1);
    expect(leads[0].nome).toContain("Beatriz");
    expect(leads[0].telefone).toBe("5511991123344");
  });
});
