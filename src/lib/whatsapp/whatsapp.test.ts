import { describe, expect, it } from "vitest";
import { construirPromptSistema, type ContextoAtendimento } from "./aiAgent";
import { formatarExemplosFewShot, type ExemploConvertido } from "./aprendizadoContinuo";
import { classificarTamanho, dividirEmMensagens } from "./chunking";
import { extrairDossieCliente, resumirMudancasDossie } from "./dossierExtractor";
import type { DossieClienteIA } from "./types";
import {
  gerarMensagensCampanhaPersonalizadas,
  INTERVALO_MINIMO_SEGUNDOS,
  INTERVALO_MAXIMO_SEGUNDOS,
} from "./campaignQueue";
import { transcreverAudioWhatsapp } from "./audioTranscriber";
import {
  formatarAlertaCorretor,
  formatarAtualizacaoDossie,
  notificarCorretorLeadQuente,
} from "./brokerNotifier";
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

  it("instrui técnicas de venda consultiva, não só atendimento", () => {
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

    expect(prompt).toMatch(/SPIN/i);
    expect(prompt).toMatch(/objeção/i);
    expect(prompt).toMatch(/fechamento/i);
  });

  it("injeta os exemplos few-shot de conversas que converteram, quando existem", () => {
    const contexto: ContextoAtendimento = {
      nomeCorretor: "Carlos Silva",
      creciCorretor: "123456-F",
      telefoneCorretor: "5511999998888",
      nomeAssistente: "Sofia",
      tomVoz: "consultivo_alto_padrao",
      catalogo: [IMOVEL_MOCK],
      historicoMensagens: [],
      exemplosFewShot: 'Exemplo real 1 (este lead avançou até a etapa "fechado"):\nCliente: Quero agendar visita\nVocê: Perfeito!',
    };

    const prompt = construirPromptSistema(contexto);

    expect(prompt).toContain("EXEMPLOS REAIS DE CONVERSAS QUE CONVERTERAM");
    expect(prompt).toContain("Quero agendar visita");
  });

  it("instrui a não anunciar transferência para humano nem se identificar como IA por conta própria", () => {
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

    expect(prompt).toMatch(/nunca diga.*vou avisar o corretor/i);
    expect(prompt).toMatch(/direta e explícita/i);
    expect(prompt).not.toMatch(/entrará em contato/i);
  });

  it("não menciona exemplos few-shot quando não há histórico de conversão", () => {
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

    expect(prompt).not.toContain("EXEMPLOS REAIS DE CONVERSAS QUE CONVERTERAM");
  });
});

describe("Quebra de mensagens (chunking)", () => {
  it("mantém mensagem pequena como um único balão", () => {
    const texto = "Olá! Temos 3 opções em Alphaville a partir de R$ 1,4 milhão.";
    expect(classificarTamanho(texto)).toBe("pequena");
    expect(dividirEmMensagens(texto)).toEqual([texto]);
  });

  it("quebra mensagem média em duas partes menores", () => {
    const texto =
      "Temos o Canvas Alphaville, com apartamentos de 3 suítes a partir de R$ 1,45 milhão. " +
      "O empreendimento fica no Green Valley, a cinco minutos do shopping e das melhores escolas da região. " +
      "Posso te mandar as plantas e o book completo agora mesmo?";
    expect(classificarTamanho(texto)).toBe("media");

    const partes = dividirEmMensagens(texto);
    expect(partes.length).toBe(2);
    expect(partes.join(" ").replace(/\s+/g, " ")).toBe(texto.replace(/\s+/g, " "));
  });

  it("quebra mensagem longa em duas partes, sem perder nem repetir texto", () => {
    const texto = Array.from({ length: 8 })
      .map((_, i) => `Este é o parágrafo número ${i + 1} sobre o empreendimento Canvas Alphaville.`)
      .join(" ");
    expect(classificarTamanho(texto)).toBe("longa");

    const partes = dividirEmMensagens(texto);
    expect(partes.length).toBe(2);
    expect(partes.every((p) => p.length > 0)).toBe(true);
  });

  it("nunca corta uma palavra ao meio", () => {
    const texto =
      "Este apartamento possui trezentos e vinte metros quadrados de área privativa, quatro suítes espaçosas, " +
      "varanda gourmet integrada e duas vagas de garagem cobertas, além de vista livre para o parque.";

    const partes = dividirEmMensagens(texto);
    for (const parte of partes) {
      expect(parte.startsWith(" ")).toBe(false);
      expect(parte.endsWith(" ")).toBe(false);
    }
  });

  it("respeita o corte explícito marcado pela IA com '---'", () => {
    const texto = "Primeira ideia curta.\n---\nSegunda ideia curta.\n---\nTerceira ideia curta.";
    expect(dividirEmMensagens(texto)).toEqual([
      "Primeira ideia curta.",
      "Segunda ideia curta.",
      "Terceira ideia curta.",
    ]);
  });

  it("respeita parágrafo duplo como corte explícito", () => {
    const texto = "Primeira ideia.\n\nSegunda ideia.";
    expect(dividirEmMensagens(texto)).toEqual(["Primeira ideia.", "Segunda ideia."]);
  });

  it("devolve lista vazia para texto vazio, em vez de mandar balão em branco", () => {
    expect(dividirEmMensagens("")).toEqual([]);
    expect(dividirEmMensagens("   ")).toEqual([]);
  });
});

describe("Aprendizado contínuo — exemplos few-shot", () => {
  it("formata conversas convertidas como exemplos numerados com a etapa alcançada", () => {
    const exemplos: ExemploConvertido[] = [
      {
        etapa: "visita_agendada",
        mensagens: [
          { remetente: "cliente", texto: "Quero ver o apartamento pessoalmente" },
          { remetente: "bot", texto: "Ótimo! Que tal sábado às 10h?" },
        ],
      },
    ];

    const formatado = formatarExemplosFewShot(exemplos);

    expect(formatado).toContain('Exemplo real 1 (este lead avançou até a etapa "visita_agendada")');
    expect(formatado).toContain("Cliente: Quero ver o apartamento pessoalmente");
    expect(formatado).toContain("Você: Ótimo! Que tal sábado às 10h?");
  });

  it("devolve string vazia quando não há nenhum exemplo", () => {
    expect(formatarExemplosFewShot([])).toBe("");
  });

  it("descarta a saudação inicial e mantém só a cauda relevante da conversa", () => {
    const mensagens = Array.from({ length: 14 }).map((_, i) => ({
      remetente: (i % 2 === 0 ? "cliente" : "bot") as "cliente" | "bot",
      texto: `mensagem-${i}`,
    }));

    const formatado = formatarExemplosFewShot([{ etapa: "fechado", mensagens }]);

    expect(formatado).not.toContain("mensagem-0");
    expect(formatado).toContain("mensagem-13");
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
    //
    // A asserção é de ordem, não de intervalo exato: itens que caem fora do
    // horário comercial são empurrados para a próxima janela, então a
    // distância entre dois vizinhos pode ser de horas. Cravar o intervalo
    // faria este teste passar de dia e quebrar de madrugada.
    const fila = await filaPadrao();
    const instantes = fila.map((i) => new Date(i.agendadoPara).getTime());

    for (let i = 1; i < instantes.length; i++) {
      expect(instantes[i]).toBeGreaterThan(instantes[i - 1]);
    }
  });

  it("respeita o intervalo humanizado entre disparos da mesma janela", async () => {
    const fila = await filaPadrao();
    const instantes = fila.map((i) => new Date(i.agendadoPara).getTime());

    for (let i = 1; i < instantes.length; i++) {
      const intervaloSegundos = (instantes[i] - instantes[i - 1]) / 1000;
      // Só compara vizinhos que ficaram na mesma janela; quem foi adiado
      // para o próximo dia útil naturalmente tem distância maior.
      if (intervaloSegundos <= INTERVALO_MAXIMO_SEGUNDOS) {
        expect(intervaloSegundos).toBeGreaterThanOrEqual(INTERVALO_MINIMO_SEGUNDOS);
      }
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

const DOSSIE_BASE: DossieClienteIA = {
  id: "dossie-1",
  leadId: "lead-1",
  orcamentoMin: null,
  orcamentoMax: null,
  formaPagamento: null,
  perfilFamiliar: null,
  urgenciaMudanca: null,
  exigenciasEspecificas: [],
  objecoesIdentificadas: [],
  temperaturaScore: 50,
  temperaturaLabel: "morno",
  resumoExecutivo: "Lead em atendimento inicial.",
  proximoPassoSugerido: null,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
};

describe("Feedback contínuo ao corretor — diff de dossiê", () => {
  it("aponta a primeira leitura de temperatura quando não havia dossiê anterior", () => {
    const resumo = resumirMudancasDossie(null, DOSSIE_BASE);
    expect(resumo).toContain("morno");
  });

  it("não aponta nada quando nada relevante mudou entre duas leituras iguais", () => {
    const resumo = resumirMudancasDossie(DOSSIE_BASE, { ...DOSSIE_BASE });
    expect(resumo).toBeNull();
  });

  it("aponta subida de temperatura", () => {
    const novo: DossieClienteIA = { ...DOSSIE_BASE, temperaturaScore: 80, temperaturaLabel: "quente" };
    const resumo = resumirMudancasDossie(DOSSIE_BASE, novo);
    expect(resumo).toContain("morno");
    expect(resumo).toContain("quente");
  });

  it("aponta orçamento identificado pela primeira vez", () => {
    const novo: DossieClienteIA = { ...DOSSIE_BASE, orcamentoMin: 1_200_000, orcamentoMax: 1_500_000 };
    const resumo = resumirMudancasDossie(DOSSIE_BASE, novo);
    expect(resumo).toContain("1.200.000");
    expect(resumo).toContain("1.500.000");
  });

  it("não repete o orçamento se ele já era conhecido antes", () => {
    const anterior: DossieClienteIA = { ...DOSSIE_BASE, orcamentoMin: 1_000_000 };
    const novo: DossieClienteIA = { ...DOSSIE_BASE, orcamentoMin: 1_000_000, temperaturaScore: 50 };
    expect(resumirMudancasDossie(anterior, novo)).toBeNull();
  });

  it("aponta só a objeção nova, não as que já eram conhecidas", () => {
    const anterior: DossieClienteIA = { ...DOSSIE_BASE, objecoesIdentificadas: ["preco"] };
    const novo: DossieClienteIA = {
      ...DOSSIE_BASE,
      objecoesIdentificadas: ["preco", "prazo_entrega"],
    };
    const resumo = resumirMudancasDossie(anterior, novo);
    expect(resumo).toContain("prazo entrega");
    expect(resumo).not.toContain("Nova(s) objeção(ões): preco");
  });
});

describe("Nota de acompanhamento ao corretor", () => {
  it("formata a atualização sem soar como alerta urgente", () => {
    const texto = formatarAtualizacaoDossie({
      nomeCliente: "Fernanda",
      telefoneCliente: "5511988882222",
      resumoMudancas: "💰 Orçamento identificado: R$ 1.200.000",
    });

    expect(texto).toContain("Fernanda");
    expect(texto).toContain("Orçamento identificado");
    expect(texto).not.toMatch(/URGENTE|SOLICITAÇÃO DE VISITA/i);
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
