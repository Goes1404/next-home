/*
 * Simulação do disparador oficial (0255) com o banco em memória.
 *
 * O envio à Meta, a trava e o funil são falsos; o resto é o código de
 * produção (`processarFilaOficial`), lendo e gravando nas tabelas em memória.
 * O que precisa ser verdade:
 *   - só sai para quem tem consentimento de marketing no WhatsApp;
 *   - só sai com modelo aprovado, deste número e deste grupo;
 *   - o item só vira `enviado` com o `wamid`, e a mensagem entra na conversa
 *     oficial (é o que a IA lê quando o cliente responder);
 *   - 131049 volta UMA vez em 24 h; conta suspensa pausa o número e para;
 *   - o limite de pessoas por 24 h da Meta segura a fila;
 *   - fora da janela de 9h às 20h59, nada sai;
 *   - a lista do WhatsApp do corretor (canal evolution) não passa por aqui.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../../test/bancoFalso";

const estado = vi.hoisted(() => ({
  banco: null as unknown as BancoFalso,
  envios: [] as { telefone: string; nome: string; componentes: Record<string, unknown>[] }[],
  respostaDoEnvio: null as null | ((telefone: string) => unknown),
}));

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => estado.banco.cliente }));
vi.mock("@/lib/planos/cobrancaDoGrupo", () => ({ grupoSuspenso: async () => false }));
vi.mock("@/lib/whatsapp/casaDoGrupo", () => ({
  lerCasaDoGrupo: async () => ({ nomeDaCasa: "Next Home", regiao: null }),
}));
vi.mock("@/lib/whatsapp/repositorio", () => ({
  travarDisparo: async () => true,
  destravarDisparo: async () => undefined,
  avancarLeadParaPrimeiroContato: async () => undefined,
  registrarTentativaDeContato: async () => undefined,
}));
vi.mock("./envio", () => ({
  enviarModeloOficial: async (p: { telefone: string; nome: string; componentes: Record<string, unknown>[] }) => {
    estado.envios.push({ telefone: p.telefone, nome: p.nome, componentes: p.componentes });
    if (estado.respostaDoEnvio) return estado.respostaDoEnvio(p.telefone);
    return { enviado: true, wamid: `wamid.${estado.envios.length}` };
  },
}));
vi.mock("./numeros", async (original) => ({
  ...(await original<typeof import("./numeros")>()),
  tokenDoNumero: () => ({ token: "TOKEN" }),
}));

const { processarFilaOficial, MOTIVO_MODELO_INDISPONIVEL, MOTIVO_SEM_CONSENTIMENTO } = await import("./disparoOficial");

// Terça, 3/11/2026, 14h em São Paulo.
const DENTRO = () => new Date("2026-11-03T17:00:00.000Z");
// Domingo, 8/11/2026.
const DOMINGO = () => new Date("2026-11-08T17:00:00.000Z");

const G = "grupo-1";

function montar(opcoes: { modeloEstado?: string; limite?: string; consentidos?: string[]; jaEnviadas24h?: number } = {}) {
  const leads = [
    { id: "lead-carla", nome: "Carla Souza", telefone: "11988887777", corretor_id: "corretor-1", etapa: "novo", nao_contatar_em: null, arquivado_em: null, telefone_e164: "5511988887777", grupo_id: G },
    { id: "lead-joao", nome: "João Lima", telefone: "11977776666", corretor_id: "corretor-1", etapa: "novo", nao_contatar_em: null, arquivado_em: null, telefone_e164: "5511977776666", grupo_id: G },
  ];
  const consentidos = opcoes.consentidos ?? ["lead-carla"];
  const filaAntiga = Array.from({ length: opcoes.jaEnviadas24h ?? 0 }, (_, i) => ({
    id: `antigo-${i}`,
    campanha_id: "lista-velha",
    lead_id: null,
    telefone: `5511900${String(i).padStart(6, "0")}`,
    status: "enviado",
    wamid: `wamid.antigo.${i}`,
    enviado_em: "2026-11-03T10:00:00.000Z",
    agendado_para: "2026-11-03T10:00:00.000Z",
    grupo_id: G,
  }));
  estado.banco = bancoFalso({
    whatsapp_numeros_oficiais: [
      {
        id: "numero-1",
        grupo_id: G,
        waba_id: "WABA1",
        phone_number_id: "PNID1",
        estado: "ativo",
        limite_de_envio: opcoes.limite ?? "TIER_2K",
        teto_mensal: null,
        origem: "manual",
        token_cifrado: null,
      },
    ],
    whatsapp_modelos_oficiais: [
      {
        id: "modelo-1",
        grupo_id: G,
        numero_oficial_id: "numero-1",
        nome: "lancamento_dom_parque",
        idioma: "pt_BR",
        categoria: "MARKETING",
        corpo: "Oi {{nome}}! Saiu a tabela do {{imovel}}. Quer que eu te mande os detalhes?",
        exemplos: { nome: "Carla", imovel: "Dom Parque" },
        cabecalho: "nenhum",
        botoes: [
          { tipo: "interesse", texto: "Quero saber mais" },
          { tipo: "parar", texto: "Parar de receber" },
        ],
        estado: opcoes.modeloEstado ?? "aprovado",
      },
    ],
    whatsapp_campanhas: [
      {
        id: "lista-oficial",
        grupo_id: G,
        corretor_id: "corretor-1",
        canal: "oficial",
        numero_oficial_id: "numero-1",
        modelo_oficial_id: "modelo-1",
        status: "em_andamento",
        empreendimento_id: null,
        midias: [],
        criterio: { filtro: "todos" },
        empreendimento: { nome: "Dom Parque" },
      },
      { id: "lista-velha", grupo_id: G, corretor_id: "corretor-1", canal: "oficial", numero_oficial_id: "numero-1", status: "concluida" },
      { id: "lista-do-corretor", grupo_id: G, corretor_id: "corretor-1", canal: "evolution", status: "em_andamento" },
    ],
    whatsapp_campanhas_fila: [
      ...filaAntiga,
      { id: "item-carla", campanha_id: "lista-oficial", lead_id: "lead-carla", telefone: "11988887777", status: "pendente", tentativas: 0, agendado_para: "2026-11-03T12:00:00.000Z", erro_meta_codigo: null, grupo_id: G },
      { id: "item-joao", campanha_id: "lista-oficial", lead_id: "lead-joao", telefone: "11977776666", status: "pendente", tentativas: 0, agendado_para: "2026-11-03T12:00:00.000Z", erro_meta_codigo: null, grupo_id: G },
      { id: "item-evolution", campanha_id: "lista-do-corretor", lead_id: "lead-joao", telefone: "11977776666", status: "pendente", tentativas: 0, agendado_para: "2026-11-03T12:00:00.000Z", grupo_id: G },
    ],
    leads,
    marketing_preferencias: consentidos.map((id) => ({ lead_id: id, finalidade: "marketing", canal: "whatsapp", permitido: true, grupo_id: G })),
    corretores: [{ id: "corretor-1", nome: "Rafael Alves", grupo_id: G }],
    whatsapp_conversas: [],
    whatsapp_mensagens: [],
    whatsapp_oficial_conversas: [],
    whatsapp_oficial_mensagens: [],
    whatsapp_oficial_eventos: [],
    midias: [],
  });
}

const item = (id: string) => estado.banco.tabelas.whatsapp_campanhas_fila.find((l) => l.id === id)!;

describe("disparador da lista oficial", () => {
  beforeEach(() => {
    estado.envios = [];
    estado.respostaDoEnvio = null;
  });

  it("sai só para quem consentiu, com as variáveis, e entra na conversa oficial", async () => {
    montar();
    const r = await processarFilaOficial({ agora: DENTRO });

    expect(estado.envios.map((e) => e.telefone)).toEqual(["11988887777"]);
    expect(estado.envios[0].nome).toBe("lancamento_dom_parque");
    expect(estado.envios[0].componentes[0]).toEqual({
      type: "body",
      parameters: [
        { type: "text", parameter_name: "nome", text: "Carla" },
        { type: "text", parameter_name: "imovel", text: "Dom Parque" },
      ],
    });

    expect(item("item-carla")).toMatchObject({ status: "enviado", wamid: "wamid.1" });
    expect(item("item-carla").mensagem_personalizada).toBe(
      "Oi Carla! Saiu a tabela do Dom Parque. Quer que eu te mande os detalhes?",
    );
    expect(item("item-joao")).toMatchObject({ status: "erro", erro_motivo: MOTIVO_SEM_CONSENTIMENTO });
    // A lista do WhatsApp do corretor não foi tocada.
    expect(item("item-evolution").status).toBe("pendente");

    const conversa = estado.banco.tabelas.whatsapp_oficial_conversas[0];
    expect(conversa).toMatchObject({ numero_oficial_id: "numero-1", telefone: "5511988887777", lead_id: "lead-carla", corretor_id: "corretor-1" });
    expect(estado.banco.tabelas.whatsapp_oficial_mensagens[0]).toMatchObject({
      conversa_id: conversa.id,
      remetente: "bot",
      tipo: "modelo",
      wamid: "wamid.1",
      fila_id: "item-carla",
    });
    expect(r.enviados).toBe(1);
  });

  it("modelo que não está aprovado pausa a lista, e nada sai", async () => {
    montar({ modeloEstado: "pausado" });
    await processarFilaOficial({ agora: DENTRO });
    expect(estado.envios).toEqual([]);
    expect(estado.banco.tabelas.whatsapp_campanhas.find((l) => l.id === "lista-oficial")).toMatchObject({
      status: "pausada",
      pausa_automatica: MOTIVO_MODELO_INDISPONIVEL,
    });
    expect(item("item-carla").status).toBe("pendente");
  });

  it("o limite de pessoas por 24 h da Meta segura a fila", async () => {
    montar({ limite: "TIER_250", jaEnviadas24h: 250 });
    const r = await processarFilaOficial({ agora: DENTRO });
    expect(estado.envios).toEqual([]);
    expect(item("item-carla").status).toBe("pendente");
    expect(r.diagnostico.join(" ")).toMatch(/250 pessoas novas em 24 h/);
  });

  it("131049 volta uma vez, 24 h depois; na segunda, desiste", async () => {
    montar();
    estado.respostaDoEnvio = () => ({
      enviado: false,
      erro: { codigo: 131049, subcodigo: null, mensagem: "x", detalhe: null, status: 400, incerto: false },
    });
    await processarFilaOficial({ agora: DENTRO });
    const depois = item("item-carla");
    expect(depois.status).toBe("pendente");
    expect(depois.erro_meta_codigo).toBe(131049);
    expect(new Date(String(depois.agendado_para)).getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);

    // Chega a hora de novo e a Meta segura de novo.
    depois.agendado_para = "2026-11-03T12:00:00.000Z";
    await processarFilaOficial({ agora: DENTRO });
    expect(item("item-carla").status).toBe("erro");
  });

  it("conta restrita pausa o número e para a fila", async () => {
    montar({ consentidos: ["lead-carla", "lead-joao"] });
    estado.respostaDoEnvio = () => ({
      enviado: false,
      erro: { codigo: 368, subcodigo: null, mensagem: "restrita", detalhe: null, status: 400, incerto: false },
    });
    await processarFilaOficial({ agora: DENTRO });
    expect(estado.envios).toHaveLength(1);
    expect(estado.banco.tabelas.whatsapp_numeros_oficiais[0]).toMatchObject({ estado: "pausado" });
    expect(item("item-carla").status).toBe("pendente");
    expect(item("item-joao").status).toBe("pendente");
  });

  it("envio sem confirmação da Meta (incerto) não é repetido", async () => {
    montar();
    estado.respostaDoEnvio = () => ({
      enviado: false,
      erro: { codigo: null, subcodigo: null, mensagem: "timeout", detalhe: null, status: null, incerto: true },
    });
    await processarFilaOficial({ agora: DENTRO });
    expect(item("item-carla").status).toBe("erro");
  });

  it("fora da janela (domingo), nada sai", async () => {
    montar();
    await processarFilaOficial({ agora: DOMINGO });
    expect(estado.envios).toEqual([]);
  });
});
