import { describe, expect, it } from "vitest";
import { construirPromptSistema, type ContextoAtendimento } from "./aiAgent";
import { formatarExemplosFewShot, type ExemploConvertido } from "./aprendizadoContinuo";
import { classificarTamanho, dividirEmMensagens } from "./chunking";
import { extrairDossieCliente } from "./dossierExtractor";
import {
  gerarMensagensCampanhaPersonalizadas,
  montarFilaCampanha,
  variarMensagemComIA,
  INTERVALO_MINIMO_SEGUNDOS,
  INTERVALO_MAXIMO_SEGUNDOS,
} from "./campaignQueue";
import { transcreverAudioWhatsapp, transcricaoTemConteudo } from "./audioTranscriber";
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
  it("injeta corretor, assistente, imóveis reais — e o PISO, só o piso", () => {
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

    /*
     * MUDOU EM 01/09/2026 (v28). A regra era "o preço não entra no prompt —
     * o que o modelo não vê, ele não repete", e ela custava caro: sem
     * nenhum número para dar, a Sofia não tinha jogada contra quem insiste
     * em valor, e `avancou` ficou 0 em todas as personas do eval de
     * conversa, da v25 à v27.
     *
     * Agora o PISO entra, e só ele. O que o modelo continua sem ver — e
     * portanto não repete — é valor de unidade, entrada, parcela e
     * desconto. `semValores.ts` segue como segunda linha, validando
     * qualquer cifra da saída contra os pisos do próprio catálogo.
     *
     * Este teste guardava a regra ANTIGA. Reescrevê-lo é o passo que este
     * projeto já esqueceu cinco vezes ao mudar regra de negócio: o critério
     * que media a regra velha passa a reprovar o comportamento certo.
     */
    expect(prompt).toContain("A partir de:");
    expect(prompt).toMatch(/R\$\s?1\.450\.000/);

    // O piso é o ÚNICO número de dinheiro do imóvel no prompt: a ficha não
    // ganhou condomínio, IPTU nem preço de tipologia junto.
    expect(prompt).not.toContain("Preço a partir");

    // Em compensação, ele precisa ter o que permite responder de verdade:
    // o slug (para pedir mídia) e o link da página do imóvel.
    expect(prompt).toContain("slug: canvas-alphaville");
    expect(prompt).toContain("/empreendimentos/canvas-alphaville");
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

    // A regra 21 endureceu: antes proibia só "vou avisar o corretor". O
    // corretor viu em produção a IA dizendo que ELE entraria na conversa —
    // o que transforma toda resposta dela em provisória e faz o cliente
    // esperar "o de verdade" em vez de responder.
    expect(prompt).toMatch(/NUNCA diga ao cliente que vai falar com Carlos Silva/i);
    expect(prompt).toMatch(/vai entrar/i);
    expect(prompt).toMatch(/informações iniciais/i);
    // Mas honestidade na pergunta DIRETA continua — negar é mentir ao cliente.
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

  it("mensagem média vira pequenas", () => {
    // Média pela régua NOVA (120-240 chars), que veio da medição das 93
    // mensagens reais da corretora — média de 47, só 1 acima de 200.
    const texto =
      "O Canvas fica no Green Valley, a cinco minutos do shopping. " +
      "São 3 suítes com varanda gourmet. Posso te mandar as plantas agora?";
    expect(classificarTamanho(texto)).toBe("media");

    const partes = dividirEmMensagens(texto);

    // O que importa não é o NÚMERO de balões — é a promessa: nenhum pedaço
    // pode continuar grande, e nada do texto pode se perder no caminho.
    expect(partes.length).toBeGreaterThan(1);
    for (const parte of partes) expect(classificarTamanho(parte)).toBe("pequena");
    expect(partes.join(" ").replace(/\s+/g, " ")).toBe(texto.replace(/\s+/g, " "));
  });

  it("quebra mensagem longa em duas partes, sem perder nem repetir texto", () => {
    const texto = Array.from({ length: 8 })
      .map((_, i) => `Este é o parágrafo número ${i + 1} sobre o empreendimento Canvas Alphaville.`)
      .join(" ");
    expect(classificarTamanho(texto)).toBe("longa");

    const partes = dividirEmMensagens(texto);

    expect(partes.length).toBeGreaterThan(1);
    expect(partes.every((p) => p.length > 0)).toBe(true);
    // Longa vira médias: nenhum balão pode sair ainda longo.
    for (const parte of partes) expect(classificarTamanho(parte)).not.toBe("longa");
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

  /*
   * Caminho de PRODUÇÃO da fila. A variante com IA
   * (`gerarMensagensCampanhaPersonalizadas`) ficou só para o preview do
   * painel: uma chamada de rede por lead na criação da campanha estourava o
   * tempo da server action antes de a fila chegar a ser gravada.
   */
  async function filaPadrao() {
    return montarFilaCampanha({
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

  it("devolve o texto intacto quando a variação por IA não acontece", async () => {
    // A variação passou a rodar no ENVIO, item a item. Se ela falhar, o
    // disparo tem que sair mesmo assim — com o texto do template e admitindo
    // que a proteção de variação não aconteceu naquele item.
    const original = "Olá, Marina! Conheça o Canvas Alphaville.";
    const resultado = await variarMensagemComIA({ texto: original, nomeLead: "Marina" });

    expect(resultado.texto).toBe(original);
    expect(resultado.personalizadoPorIA).toBe(false);
  });

  it("o preview do painel aplica as mesmas proteções da fila real", async () => {
    const preview = await gerarMensagensCampanhaPersonalizadas({
      campanhaId: "preview",
      leads: leads.slice(0, 3),
      mensagemBase: "Olá, {nome}! Conheça o {imovel}.",
      empreendimentoNome: "Canvas Alphaville",
    });

    expect(preview).toHaveLength(3);
    expect(preview[0].mensagemPersonalizada).toContain("Dr. Roberto");

    const instantes = preview.map((i) => new Date(i.agendadoPara).getTime());
    for (let i = 1; i < instantes.length; i++) {
      expect(instantes[i]).toBeGreaterThan(instantes[i - 1]);
    }
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

describe("Transcrição de áudio: conteúdo de verdade", () => {
  it("ponto solto do Whisper não é fala do cliente", () => {
    // O Whisper não recusa como o Gemini: para áudio sem fala ele devolve
    // "." com HTTP 200. Sem esta guarda o ponto entrava no histórico e a
    // IA respondia a ele.
    expect(transcricaoTemConteudo(".")).toBe(false);
    expect(transcricaoTemConteudo(" ")).toBe(false);
    expect(transcricaoTemConteudo("...")).toBe(false);
    expect(transcricaoTemConteudo("")).toBe(false);
  });

  it("fala curta de verdade passa", () => {
    expect(transcricaoTemConteudo("oi")).toBe(true);
    expect(transcricaoTemConteudo("Quero visitar sábado de manhã.")).toBe(true);
  });
});

describe("marcador de corte não vaza para o cliente", () => {
  /*
   * Visto no eval da v25 (`insiste-no-desconto`, turno 10): a IA embrulhou
   * a resposta inteira em `---` e o cliente recebeu os traços na tela. A
   * divisão devolvia UM pedaço limpo, e a condição antiga (`> 1`)
   * descartava essa limpeza e mandava o texto cru.
   */
  it("tira os traços quando a IA embrulha a resposta inteira", () => {
    expect(dividirEmMensagens("--- Para ajudar, qual região você prefere? ---")).toEqual([
      "Para ajudar, qual região você prefere?",
    ]);
  });

  it("tira os traços quando eles só abrem", () => {
    expect(dividirEmMensagens("--- Oi, tudo bem?")).toEqual(["Oi, tudo bem?"]);
  });

  it("texto sem marcador nenhum continua inteiro", () => {
    expect(dividirEmMensagens("Oi, tudo bem?")).toEqual(["Oi, tudo bem?"]);
  });

  it("o corte marcado no meio continua virando dois balões", () => {
    expect(dividirEmMensagens("Primeira ideia.\n---\nSegunda ideia.")).toEqual([
      "Primeira ideia.",
      "Segunda ideia.",
    ]);
  });
});
