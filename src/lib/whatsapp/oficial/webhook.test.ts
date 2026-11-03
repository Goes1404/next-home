import { describe, expect, it } from "vitest";
import { lerWebhook } from "./webhook";

const METADATA = { display_phone_number: "5511968671127", phone_number_id: "PNID1" };

function corpo(field: string, value: unknown, wabaId = "WABA1") {
  return { object: "whatsapp_business_account", entry: [{ id: wabaId, changes: [{ field, value }] }] };
}

describe("leitura do webhook da API oficial", () => {
  it("mensagem de texto recebida, com o nome do perfil", () => {
    const { eventos, campos } = lerWebhook(
      corpo("messages", {
        messaging_product: "whatsapp",
        metadata: METADATA,
        contacts: [{ profile: { name: "Carla" }, wa_id: "5511988887777" }],
        messages: [{ from: "5511988887777", id: "wamid.A", timestamp: "1762190000", type: "text", text: { body: "Tenho interesse" } }],
      }),
    );
    expect(campos).toHaveLength(1);
    expect(eventos).toEqual([
      {
        tipo: "mensagem",
        phoneNumberId: "PNID1",
        wamid: "wamid.A",
        de: "5511988887777",
        nome: "Carla",
        quando: new Date(1762190000 * 1000),
        tipoDaMensagem: "texto",
        conteudo: "Tenho interesse",
        payloadDoBotao: null,
        respondeA: null,
      },
    ]);
  });

  it("botão de modelo: o rótulo, o payload do envio e a mensagem respondida", () => {
    const { eventos } = lerWebhook(
      corpo("messages", {
        metadata: METADATA,
        messages: [
          {
            from: "5511988887777",
            id: "wamid.B",
            timestamp: "1762190001",
            type: "button",
            context: { from: "5511968671127", id: "wamid.MODELO" },
            button: { text: "Parar de receber", payload: "PARAR_DE_RECEBER" },
          },
        ],
      }),
    );
    expect(eventos[0]).toMatchObject({
      tipo: "mensagem",
      tipoDaMensagem: "botao",
      conteudo: "Parar de receber",
      payloadDoBotao: "PARAR_DE_RECEBER",
      respondeA: "wamid.MODELO",
    });
  });

  it("foto, áudio e documento viram uma descrição legível", () => {
    const { eventos } = lerWebhook(
      corpo("messages", {
        metadata: METADATA,
        messages: [
          { from: "1", id: "w1", timestamp: "1", type: "image", image: { id: "M1" } },
          { from: "1", id: "w2", timestamp: "1", type: "audio", audio: { id: "M2" } },
          { from: "1", id: "w3", timestamp: "1", type: "document", document: { filename: "planta.pdf" } },
          { from: "1", id: "w4", timestamp: "1", type: "sticker", sticker: {} },
        ],
      }),
    );
    expect(eventos.map((e) => (e.tipo === "mensagem" ? e.conteudo : ""))).toEqual([
      "[foto]",
      "[áudio]",
      "[documento: planta.pdf]",
      "[sticker]",
    ]);
  });

  it("status com cobrança e status com erro", () => {
    const { eventos } = lerWebhook(
      corpo("messages", {
        metadata: METADATA,
        statuses: [
          {
            id: "wamid.C",
            status: "delivered",
            timestamp: "1762190002",
            recipient_id: "5511988887777",
            pricing: { billable: true, pricing_model: "PMP", category: "marketing", type: "regular" },
          },
          {
            id: "wamid.D",
            status: "failed",
            timestamp: "1762190003",
            recipient_id: "5511977776666",
            errors: [{ code: 131049, title: "This message was not delivered to maintain healthy ecosystem engagement.", error_data: { details: "limite" } }],
          },
          { id: "wamid.E", status: "deleted", timestamp: "1" },
        ],
      }),
    );
    expect(eventos).toHaveLength(2);
    expect(eventos[0]).toMatchObject({
      tipo: "status",
      wamid: "wamid.C",
      status: "delivered",
      erro: null,
      cobranca: { categoria: "marketing", cobrada: true, tipo: "regular" },
    });
    expect(eventos[1]).toMatchObject({
      tipo: "status",
      wamid: "wamid.D",
      status: "failed",
      erro: { codigo: 131049, detalhe: "limite" },
      cobranca: null,
    });
  });

  it("aprovação de modelo e qualidade do número", () => {
    const modelo = lerWebhook(
      corpo("message_template_status_update", {
        event: "REJECTED",
        message_template_id: 123456,
        message_template_name: "lancamento_dom_parque",
        message_template_language: "pt_BR",
        reason: "INVALID_FORMAT",
      }),
    );
    expect(modelo.eventos[0]).toEqual({
      tipo: "modelo",
      wabaId: "WABA1",
      metaId: "123456",
      nome: "lancamento_dom_parque",
      idioma: "pt_BR",
      evento: "REJECTED",
      motivo: "INVALID_FORMAT",
    });

    const numero = lerWebhook(
      corpo("phone_number_quality_update", { display_phone_number: "5511968671127", event: "DOWNGRADE", current_limit: "TIER_250" }),
    );
    expect(numero.eventos[0]).toEqual({
      tipo: "qualidade_do_numero",
      wabaId: "WABA1",
      numero: "5511968671127",
      evento: "DOWNGRADE",
      limite: "TIER_250",
    });
  });

  it("a pessoa parou o marketing", () => {
    const { eventos } = lerWebhook(
      corpo("user_preferences", {
        metadata: METADATA,
        user_preferences: [
          { wa_id: "5511988887777", category: "marketing_messages", value: "stop", timestamp: 1 },
          { wa_id: "5511988887777", category: "outra", value: "stop" },
        ],
      }),
    );
    expect(eventos).toEqual([{ tipo: "preferencia", phoneNumberId: "PNID1", wabaId: "WABA1", de: "5511988887777", valor: "stop" }]);
  });

  it("lixo não quebra: sem eventos", () => {
    expect(lerWebhook(null)).toEqual({ eventos: [], campos: [] });
    expect(lerWebhook({ entry: "x" })).toEqual({ eventos: [], campos: [] });
    expect(lerWebhook(corpo("messages", { messages: [{ from: "1", id: "w", type: "text" }] })).eventos).toEqual([]);
  });
});
