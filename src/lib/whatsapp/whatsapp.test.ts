import { describe, expect, it } from "vitest";
import { construirPromptSistema, type ContextoAtendimento } from "./aiAgent";
import { extrairDossieCliente } from "./dossierExtractor";
import {
  gerarMensagensCampanhaPersonalizadas,
  INTERVALO_MINIMO_SEGUNDOS,
  INTERVALO_MAXIMO_SEGUNDOS,
} from "./campaignQueue";
import { transcreverAudioWhatsapp } from "./audioTranscriber";
import { formatarAlertaCorretor, notificarCorretorLeadQuente } from "./brokerNotifier";
import { enviarMensagemWhatsapp, provedorConfigurado } from "./provider";
import type { Empreendimento } from "@/lib/types";

const IMOVEL_MOCK: Empreendimento = {
  slug: "canvas-alphaville",
  nome: "Canvas Alphaville",
  tagline: "Design contemporâneo em Alphaville",
  descricao: "Apartamentos de 82m² a 140m² com 3 suítes.",
  status: "em_construcao",
  tipo: "apartamento",
  finalidade: "lancamento",
  cidade: "Barueri",
  bairro: "Green Valley",
  endereco: "Av. Alphaville, 500",
  precoAPartir: 1450000,
  condominioValor: 950,
  iptu: 450,
  entregaPrevista: "2026-12-01",
  totalUnidades: 120,
  totalAndares: 25,
  totalTorres: 1,
  construtora: "Next Home",
  destaque: true,
  lat: -23.498,
  lng: -46.853,
  criadoEm: "2026-01-01T00:00:00Z",
  capa: { tipo: "foto", url: "/mock.jpg", alt: "Capa", largura: 800, altura: 600, blurDataUrl: null },
  galeria: [],
  plantas: [],
  videos: [],
  tours360: [],
  tipologias: [],
  lazer: [],
  corretor: {
    nome: "Carlos Silva",
    creci: "123456-F",
    whatsapp: "5511999998888",
    fotoUrl: null,
    videoUrl: null,
    fundoTipo: "foto",
    fundoFotoUrl: null,
  },
};

describe("Agente IA — prompt com RAG do catálogo", () => {
  it("injeta corretor, assistente e imóveis reais com preço formatado", () => {
    const contexto: ContextoAtendimento = {
      nomeCorretor: "Carlos Silva",
      creciCorretor: "123456-F",
      telefoneCorretor: "5511999998888",
      nomeAssistente: "Sofia",
      tomVoz: "consultivo_alto_padrao",
      catalogo: [IMOVEL_MOCK],
      historicoMensagens: [],
    };

    const prompt = construirPromptSistema(contexto);

    expect(prompt).toContain("Sofia");
    expect(prompt).toContain("Carlos Silva");
    expect(prompt).toContain("123456-F");
    expect(prompt).toContain("Canvas Alphaville");
    expect(prompt).toContain("1.450.000");
  });
});

describe("Fila de campanha — proteção anti-ban", () => {
  const leads = [
    { id: "lead-1", nome: "Dr. Roberto", telefone: "5511988881111" },
    { id: "lead-2", nome: "Fernanda", telefone: "5511988882222" },
    { id: "lead-3", nome: "Lucas", telefone: "5511988883333" },
    { id: "lead-4", nome: "Marina", telefone: "5511988884444" },
    { id: "lead-5", nome: "Paulo", telefone: "5511988885555" },
  ];

  async function filaPadrao() {
    return gerarMensagensCampanhaPersonalizadas({
      campanhaId: "camp-100",
      leads,
      mensagemBase: "Olá, {nome}! Conheça o {imovel}.",
      empreendimentoNome: "Canvas Alphaville",
    });
  }

  it("substitui as variáveis do template em cada item", async () => {
    const fila = await filaPadrao();

    expect(fila).toHaveLength(5);
    expect(fila[0].leadId).toBe("lead-1");
    expect(fila[0].mensagemPersonalizada).toContain("Dr. Roberto");
    expect(fila[0].mensagemPersonalizada).toContain("Canvas Alphaville");
    expect(fila[0].status).toBe("pendente");
  });

  it("agenda em ordem crescente, sem dois disparos se cruzarem", async () => {
    // O agendamento antigo multiplicava o índice por um atraso sorteado a
    // cada volta, o que podia colocar o 3º item ANTES do 2º — agrupando
    // disparos no mesmo instante, exatamente o que a proteção evita.
    const fila = await filaPadrao();
    const instantes = fila.map((i) => new Date(i.agendadoPara).getTime());

    for (let i = 1; i < instantes.length; i++) {
      const intervaloSegundos = (instantes[i] - instantes[i - 1]) / 1000;
      expect(intervaloSegundos).toBeGreaterThanOrEqual(INTERVALO_MINIMO_SEGUNDOS);
      expect(intervaloSegundos).toBeLessThanOrEqual(INTERVALO_MAXIMO_SEGUNDOS);
    }
  });

  it("marca personalizadoPorIA como false quando a variação por IA não roda", async () => {
    // Sem GEMINI_API_KEY no ambiente de teste, o texto sai do template puro:
    // a fila precisa admitir isso em vez de deixar o corretor achar que as
    // mensagens saíram variadas.
    const fila = await filaPadrao();
    expect(fila.every((i) => i.personalizadoPorIA === false)).toBe(true);
  });
});

describe("Dossiê do cliente", () => {
  it("cai num fallback estruturado quando não há API Key", async () => {
    const dossie = await extrairDossieCliente("Olá, tenho interesse no Canvas", "lead-999");

    expect(dossie).toHaveProperty("leadId", "lead-999");
    expect(dossie).toHaveProperty("temperaturaScore");
    expect(dossie).toHaveProperty("temperaturaLabel");
    expect(dossie).toHaveProperty("resumoExecutivo");
    expect(dossie.exigenciasEspecificas).toBeInstanceOf(Array);
  });
});

describe("Transcrição de áudio", () => {
  it("não afirma sucesso quando a transcrição falhou", async () => {
    const resAudio = await transcreverAudioWhatsapp("data:audio/ogg;base64,AAA");

    expect(resAudio.sucesso).toBe(false);
    // O texto mostrado no CRM tem que contar a mesma história do `sucesso`.
    expect(resAudio.textoTranscrito).not.toMatch(/sucesso/i);
    expect(resAudio.textoTranscrito).toMatch(/não foi possível|indisponível/i);
  });
});

describe("Alerta de lead quente ao corretor", () => {
  const params = {
    instanceName: "nexthome-carlos",
    telefoneCorretor: "5511999998888",
    nomeCorretor: "Carlos Silva",
    nomeCliente: "Dr. Roberto",
    telefoneCliente: "5511988881111",
    empreendimentoNome: "Canvas Alphaville",
    temperaturaScore: 92,
    resumoDossie: "Busca 3 suítes, orçamento 2M, pagamento à vista.",
    motivoAlerta: "visita_solicitada" as const,
  };

  it("formata a mensagem executiva com os dados do lead", () => {
    const texto = formatarAlertaCorretor(params);

    expect(texto).toContain("SOLICITAÇÃO DE VISITA AGENDADA");
    expect(texto).toContain("Dr. Roberto");
    expect(texto).toContain("Carlos Silva");
    expect(texto).toContain("Canvas Alphaville");
    expect(texto).toContain("wa.me/5511988881111");
  });

  it("reporta enviado=false quando não há provedor configurado", async () => {
    // O contrato mais importante do módulo: um alerta que não saiu NUNCA
    // pode se declarar entregue — o corretor confiaria e perderia a venda.
    expect(provedorConfigurado()).toBe(false);

    const notificacao = await notificarCorretorLeadQuente(params);

    expect(notificacao.enviado).toBe(false);
    expect(notificacao.motivo).toBe("provedor_nao_configurado");
    expect(notificacao.mensagemFormatada).toContain("Dr. Roberto");
  });
});

describe("Provedor de envio", () => {
  it("recusa envio sem provedor configurado, dizendo o motivo", async () => {
    const resultado = await enviarMensagemWhatsapp({
      instanceName: "nexthome-carlos",
      telefone: "5511988881111",
      texto: "Olá!",
    });

    expect(resultado.enviado).toBe(false);
    expect(resultado.motivo).toBe("provedor_nao_configurado");
  });

  it("valida os dados antes de tentar qualquer chamada", async () => {
    const semTelefone = await enviarMensagemWhatsapp({
      instanceName: "nexthome-carlos",
      telefone: "",
      texto: "Olá!",
    });

    expect(semTelefone.enviado).toBe(false);
    expect(semTelefone.motivo).toBe("dados_invalidos");
  });
});
