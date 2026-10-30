import { describe, expect, it } from "vitest";
import {
  basicDoGrupoOlxConfere,
  chaveDoBasic,
  configDoPortal,
  gerarTokenDoPortal,
  lerGenerico,
  lerGrupoOlx,
  lerLeadDoPortal,
  segredoConfere,
  tokenComFormato,
  tokenDaRequisicao,
} from "./formatos";

/**
 * Formatos do webhook dos portais (29/10/2026). O exemplo do Grupo OLX é o
 * da documentação oficial (developers.grupozap.com/webhooks/integration_leads.html).
 */

const EXEMPLO_GRUPO_OLX = {
  leadOrigin: "Grupo OLX",
  timestamp: "2017-10-23T15:50:30.619Z",
  originLeadId: "59ee0fc6e4b043e1b2a6d863",
  originListingId: "87027856",
  clientListingId: "a40171",
  name: "Nome Consumidor",
  email: "nome.consumidor@email.com",
  ddd: "11",
  phone: "999999999",
  phoneNumber: "11999999999",
  message: "Olá, tenho interesse neste imóvel. Aguardo o contato. Obrigado.",
  temperature: "Alta",
  transactionType: "SELL",
  extraData: {
    leadCerto: true,
    izi: "Visualize o histórico de mensagem do cliente com IZI: https://…",
    feedback: "Sua opinião é muito importante para nós.",
    leadType: "CONTACT_CHAT",
  },
};

describe("Grupo OLX (Canal Pro)", () => {
  it("lê o exemplo oficial: telefone, código do anunciante e id do portal", () => {
    const r = lerGrupoOlx(EXEMPLO_GRUPO_OLX, "grupo_olx");
    if ("erro" in r) throw new Error(r.erro);
    expect(r.idExterno).toBe("59ee0fc6e4b043e1b2a6d863");
    expect(r.lead).toMatchObject({
      nome: "Nome Consumidor",
      telefone: "5511999999999",
      email: "nome.consumidor@email.com",
      codigoReferencia: "a40171",
      portalOrigem: "grupo_olx",
    });
    // O contexto útil entra; a propaganda do extraData (izi, feedback) não.
    expect(r.lead.mensagemOriginal).toContain("Olá, tenho interesse");
    expect(r.lead.mensagemOriginal).toContain("interesse alta");
    expect(r.lead.mensagemOriginal).toContain("compra");
    expect(r.lead.mensagemOriginal).toContain("mandou mensagem pelo chat");
    expect(r.lead.mensagemOriginal).not.toContain("IZI");
    expect(r.lead.mensagemOriginal).not.toContain("opinião");
  });

  it("sem phoneNumber, monta pelo ddd + phone", () => {
    const semCompleto: Record<string, unknown> = { ...EXEMPLO_GRUPO_OLX };
    delete semCompleto.phoneNumber;
    const r = lerGrupoOlx(semCompleto, "zap_imoveis");
    expect("erro" in r ? r.erro : r.lead.telefone).toBe("5511999999999");
    expect("erro" in r ? null : r.lead.portalOrigem).toBe("zap_imoveis");
  });

  it("lead sem telefone válido é recusado (não vira ficha sem contato)", () => {
    expect(lerGrupoOlx({ ...EXEMPLO_GRUPO_OLX, phoneNumber: "123", phone: "", ddd: "" }, "grupo_olx")).toEqual({
      erro: "sem telefone válido",
    });
    expect(lerGrupoOlx("texto", "grupo_olx")).toEqual({ erro: "corpo não é um objeto JSON" });
    expect(lerGrupoOlx([EXEMPLO_GRUPO_OLX], "grupo_olx")).toEqual({ erro: "corpo não é um objeto JSON" });
  });

  it("simulação do MCMV e aluguel ficam escritos na mensagem", () => {
    const r = lerGrupoOlx({ ...EXEMPLO_GRUPO_OLX, leadOrigin: "MCMV_OLX", transactionType: "RENT" }, "grupo_olx");
    if ("erro" in r) throw new Error(r.erro);
    expect(r.lead.mensagemOriginal).toContain("Minha Casa Minha Vida");
    expect(r.lead.mensagemOriginal).toContain("aluguel");
  });

  it("sem nome, o lead nasce com um nome neutro (não o telefone)", () => {
    const r = lerGrupoOlx({ ...EXEMPLO_GRUPO_OLX, name: "  " }, "grupo_olx");
    expect("erro" in r ? null : r.lead.nome).toBe("Cliente do portal");
  });
});

describe("formato genérico do CRM", () => {
  it("lê os campos em português e o portal declarado", () => {
    const r = lerGenerico({
      nome: "Maria Silva",
      telefone: "(11) 98888-7777",
      email: "maria@exemplo.com",
      mensagem: "Quero visitar",
      codigo_imovel: "A123",
      imovel: "Residencial Parque",
      portal: "Imovelweb",
      id_externo: "lead-1",
    });
    if ("erro" in r) throw new Error(r.erro);
    expect(r.idExterno).toBe("lead-1");
    expect(r.lead).toMatchObject({
      nome: "Maria Silva",
      telefone: "5511988887777",
      codigoReferencia: "A123",
      imovelInteresse: "Residencial Parque",
      portalOrigem: "imovelweb",
      mensagemOriginal: "Quero visitar",
    });
  });

  it("aceita os nomes em inglês; portal desconhecido vira 'email_outro'", () => {
    const r = lerGenerico({ name: "John", phone: "+55 21 99999-0000", listing_code: "X1", portal: "outro" });
    if ("erro" in r) throw new Error(r.erro);
    expect(r.lead).toMatchObject({ nome: "John", telefone: "5521999990000", codigoReferencia: "X1", portalOrigem: "email_outro" });
  });

  it("só o telefone é obrigatório", () => {
    expect(lerGenerico({ nome: "Sem fone" })).toEqual({ erro: "sem telefone válido" });
  });
});

describe("credencial", () => {
  it("token sorteado tem 48 hex e passa no formato; o resto não", () => {
    const t = gerarTokenDoPortal();
    expect(t).toMatch(/^[0-9a-f]{48}$/);
    expect(gerarTokenDoPortal()).not.toBe(t);
    expect(tokenComFormato(t)).toBe(true);
    for (const ruim of [null, "", "abc", t.toUpperCase(), `${t}0`, "' or 1=1 --"]) expect(tokenComFormato(ruim)).toBe(false);
  });

  it("o token vem do cabeçalho ou da URL", () => {
    expect(tokenDaRequisicao(new URL("https://x/api?token=aa"), new Headers())).toBe("aa");
    expect(tokenDaRequisicao(new URL("https://x/api?token=aa"), new Headers({ "x-webhook-token": "bb" }))).toBe("bb");
    expect(tokenDaRequisicao(new URL("https://x/api"), new Headers())).toBeNull();
  });

  it("a chave do Basic é a parte depois dos dois-pontos (exemplo da documentação)", () => {
    expect(chaveDoBasic("Basic dml2YXJlYWw6NTk0RjgwM0IzODBBNDEzOTZFRDYzRENBMzk1MDM1NDI=")).toBe(
      "594F803B380A41396ED63DCA39503542",
    );
    expect(chaveDoBasic("Bearer x")).toBeNull();
    expect(chaveDoBasic(null)).toBeNull();
  });

  it("com GRUPO_OLX_SECRET_KEY definida, a chave do Basic é exigida", () => {
    const basic = `Basic ${Buffer.from("vivareal:segredo-certo").toString("base64")}`;
    expect(basicDoGrupoOlxConfere(basic, "segredo-certo")).toBe(true);
    expect(basicDoGrupoOlxConfere(basic, "outro")).toBe(false);
    expect(basicDoGrupoOlxConfere(null, "segredo-certo")).toBe(false);
    // Antes da homologação (sem a variável), vale só o token do grupo.
    expect(basicDoGrupoOlxConfere(null, undefined)).toBe(true);
    expect(segredoConfere("a", "ab")).toBe(false);
  });

  it("slug desconhecido (inclusive nome de propriedade de objeto) não é portal", () => {
    expect(configDoPortal("grupo-olx")?.integracao).toBe("grupo_olx");
    expect(configDoPortal("zap")?.portalOrigem).toBe("zap_imoveis");
    expect(configDoPortal("generico")?.integracao).toBe("generico");
    for (const slug of ["imovelweb", "constructor", "__proto__", "toString", ""]) expect(configDoPortal(slug)).toBeNull();
  });

  it("o formato segue o slug da URL", () => {
    const olx = lerLeadDoPortal(configDoPortal("olx")!, EXEMPLO_GRUPO_OLX);
    expect("erro" in olx ? null : olx.lead.portalOrigem).toBe("olx");
    // Na URL genérica, o código do Grupo OLX (`clientListingId`) não é lido:
    // cada URL fala um formato só.
    const generico = lerLeadDoPortal(configDoPortal("generico")!, EXEMPLO_GRUPO_OLX);
    expect("erro" in generico ? null : generico.lead.codigoReferencia).toBeNull();
    expect("erro" in generico ? null : generico.lead.portalOrigem).toBe("email_outro");
  });
});
