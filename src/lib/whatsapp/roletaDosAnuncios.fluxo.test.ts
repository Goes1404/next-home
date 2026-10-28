import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";

/**
 * A roleta dos anúncios de ponta a ponta (spec 5.1.5), com o banco em memória
 * e o WhatsApp falso: o que se mede é o que o cliente recebe, em que ordem, de
 * quem a ficha fica e quem é avisado.
 */

const G = "grupo-a";
const DONO = "ana-dona";
const TELEFONE = "5511999990000";

type Evento =
  | { tipo: "whatsapp"; instancia: string; texto: string }
  | { tipo: "rpc"; nome: string; args: Record<string, unknown>; donoNaHora?: unknown }
  | { tipo: "aviso"; corretorId: string; texto: string };

let banco: BancoFalso;
let eventos: Evento[];
/** Quem a roleta escolhe, na ordem, pulando os excluídos. */
let fila: string[];
/** Instâncias cujo envio falha. */
let instanciasQueFalham: Set<string>;
/** Primeiros contatos que cada corretor já fez hoje e na semana (0222). */
let primeirosContatosFeitos: Record<string, number>;
const CONECTADO_HA_MESES = "2026-01-01T12:00:00Z";

const gravarMensagem = vi.fn();
const obterOuCriarConversa = vi.fn();
const registrarInteracao = vi.fn();

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("@/lib/whatsapp/provider", () => ({
  enviarMensagemWhatsapp: async (p: { instanceName: string; telefone: string; texto: string }) => {
    eventos.push({ tipo: "whatsapp", instancia: p.instanceName, texto: p.texto });
    return instanciasQueFalham.has(p.instanceName)
      ? { enviado: false, motivo: "erro_http" }
      : { enviado: true, messageId: `msg-${eventos.length}` };
  },
}));
vi.mock("@/lib/whatsapp/repositorio", () => ({
  gravarMensagem: (...a: unknown[]) => gravarMensagem(...a),
  obterOuCriarConversa: (...a: unknown[]) => obterOuCriarConversa(...a),
}));
vi.mock("@/lib/crm/avisoAoCorretor", () => ({
  avisarCorretor: async (_s: unknown, corretorId: string, texto: string) => {
    eventos.push({ tipo: "aviso", corretorId, texto });
    return true;
  },
}));
vi.mock("@/lib/crm/interacoes", () => ({ registrarInteracao: (...a: unknown[]) => registrarInteracao(...a) }));
vi.mock("@/lib/marcaDoCrm/ler", () => ({ lerMarcaDoCrm: async () => ({ nome: "Aretz" }) }));
vi.mock("@/lib/marcaDoCrm/marca", () => ({ linkDoPainel: (_g: string, caminho: string) => `https://painel${caminho}` }));

const { repassarPelaRoleta } = await import("./roletaDosAnuncios");

function semear(modo: "mensagem" | "grupo", textoBoasVindas: string | null = null) {
  banco = bancoFalso({
    roleta_anuncios: [
      {
        corretor_id: DONO,
        ligada: true,
        modo_aviso: modo,
        texto_passagem: null,
        texto_abertura: null,
        texto_boas_vindas: textoBoasVindas,
      },
    ],
    leads: [
      {
        id: "lead-1",
        grupo_id: G,
        nome: "Carlos Lima",
        corretor_id: DONO,
        origem_atribuicao: "meta",
        empreendimento: { nome: "Residencial Aurora" },
      },
    ],
    corretores: [
      { id: "beto", grupo_id: G, nome: "Beto Souza" },
      { id: "caio", grupo_id: G, nome: "Caio Reis" },
    ],
    corretor_whatsapp_instancias: [
      { corretor_id: "beto", instance_name: "inst-beto", status_conexao: "conectado", conectado_em: CONECTADO_HA_MESES },
      { corretor_id: "caio", instance_name: "inst-caio", status_conexao: "conectado", conectado_em: CONECTADO_HA_MESES },
    ],
    whatsapp_conversas: [{ id: "conv-nova", bot_ativo: true }],
    lead_interacoes: [],
  });
  banco.cliente.rpc = async (nome: string, args: Record<string, unknown>) => {
    if (nome === "primeiros_contatos_do_corretor") {
      return { data: primeirosContatosFeitos[args.p_corretor as string] ?? 0, error: null };
    }
    if (nome === "proximo_da_roleta") {
      eventos.push({ tipo: "rpc", nome, args });
      const excluidos = (args.p_excluir as string[]) ?? [];
      return { data: fila.find((c) => !excluidos.includes(c)) ?? null, error: null };
    }
    // O aviso do grupo é decidido com a ficha no estado em que está agora.
    eventos.push({ tipo: "rpc", nome, args, donoNaHora: lead().corretor_id });
    return { data: null, error: null };
  };
}

const lead = () => banco.tabelas.leads.find((l) => l.id === "lead-1")!;
const whatsapps = () => eventos.filter((e): e is Extract<Evento, { tipo: "whatsapp" }> => e.tipo === "whatsapp");
const avisos = () => eventos.filter((e): e is Extract<Evento, { tipo: "aviso" }> => e.tipo === "aviso");
const enfileirados = () => eventos.filter((e) => e.tipo === "rpc" && e.nome === "enfileirar_aviso_do_lead");

const repassar = (extra: Partial<Parameters<typeof repassarPelaRoleta>[0]> = {}) =>
  repassarPelaRoleta({
    leadId: "lead-1",
    corretorId: DONO,
    instanceNameDoDono: "inst-dona",
    conversaDoDonoId: "conv-dona",
    telefoneCliente: TELEFONE,
    nomeCliente: "Carlos",
    ...extra,
  });

beforeEach(() => {
  eventos = [];
  fila = ["beto", "caio"];
  instanciasQueFalham = new Set();
  primeirosContatosFeitos = {};
  gravarMensagem.mockReset().mockResolvedValue(undefined);
  obterOuCriarConversa.mockReset().mockResolvedValue({ id: "conv-nova" });
  registrarInteracao.mockReset().mockResolvedValue(undefined);
});

describe("roleta no modo mensagem", () => {
  it("passagem do dono antes da abertura de quem recebe; a ficha muda de dono e o aviso do grupo vai para ele", async () => {
    semear("mensagem");
    expect(await repassar({ modo: "mensagem" })).toBe("beto");

    expect(whatsapps().map((w) => w.instancia)).toEqual(["inst-dona", "inst-beto"]);
    expect(whatsapps()[0].texto).toContain("Quem vai te atender é Beto");
    expect(whatsapps()[1].texto).toBe(
      "Oi, Carlos! Aqui é Beto, da Aretz. Vi que você chamou pelo nosso anúncio sobre o Residencial Aurora. Posso te ajudar?",
    );

    expect(lead()).toMatchObject({ corretor_id: "beto", origem_atribuicao: "roleta", anuncio_pago_por: DONO });
    expect(enfileirados()).toEqual([
      { tipo: "rpc", nome: "enfileirar_aviso_do_lead", args: { p_lead: "lead-1" }, donoNaHora: "beto" },
    ]);
    expect(avisos()).toHaveLength(1);
    expect(avisos()[0]).toMatchObject({ corretorId: "beto" });
    expect(avisos()[0].texto).toContain("Já mandei a primeira mensagem do seu número");

    // A conversa nova, no painel de quem recebeu, nasce com a IA desligada.
    expect(banco.tabelas.whatsapp_conversas[0].bot_ativo).toBe(false);
    expect(gravarMensagem).toHaveBeenCalledWith(expect.objectContaining({ conversaId: "conv-nova", conteudo: whatsapps()[1].texto }));
    expect(banco.tabelas.lead_interacoes).toEqual([
      expect.objectContaining({ tipo: "repasse", detalhes: { origem_anterior: "meta", de: DONO, para: "beto" } }),
    ]);
  });

  it("a abertura do primeiro escolhido falha: o seguinte recebe o lead", async () => {
    semear("mensagem");
    instanciasQueFalham.add("inst-beto");
    expect(await repassar({ modo: "mensagem" })).toBe("caio");

    const chamadas = eventos.filter((e) => e.tipo === "rpc" && e.nome === "proximo_da_roleta");
    expect(chamadas.map((c) => (c as { args: Record<string, unknown> }).args.p_excluir)).toEqual([["beto"], ["beto"]]);
    // Caio: passagem antes da abertura.
    const deCaio = whatsapps().slice(-2);
    expect(deCaio.map((w) => w.instancia)).toEqual(["inst-dona", "inst-caio"]);
    expect(deCaio[0].texto).toContain("Caio");
    expect(lead().corretor_id).toBe("caio");
    expect(avisos().map((a) => a.corretorId)).toEqual(["caio"]);
    expect(enfileirados()).toHaveLength(1);
    // Só a passagem e a abertura de Caio, depois das duas tentativas com Beto.
    expect(whatsapps().every((w) => !w.texto.includes("Recebemos sua mensagem"))).toBe(true);
  });

  it("o escolhido já fez os 10 primeiros contatos do dia: é pulado sem abrir conversa, e o seguinte recebe", async () => {
    semear("mensagem");
    primeirosContatosFeitos = { beto: 10 };
    expect(await repassar({ modo: "mensagem" })).toBe("caio");
    expect(whatsapps().some((w) => w.instancia === "inst-beto")).toBe(false);
    expect(lead().corretor_id).toBe("caio");
  });

  it("a ficha não muda de dono (update sem linha): ninguém é avisado e devolve null", async () => {
    semear("mensagem");
    const from = banco.cliente.from;
    banco.cliente.from = ((tabela: string) => {
      const q = from(tabela);
      if (tabela !== "leads") return q;
      const update = q.update;
      q.update = ((valores: Record<string, unknown>) => {
        if (!("corretor_id" in valores)) return update(valores);
        // Outro processo mexeu na ficha: o update roda, mas não afeta linha nenhuma.
        const vazio = { data: [], error: null };
        const encadeado: Record<string, unknown> = { then: (r: (v: unknown) => unknown) => Promise.resolve(vazio).then(r) };
        encadeado.eq = () => encadeado;
        encadeado.select = () => encadeado;
        return encadeado;
      }) as typeof q.update;
      return q;
    }) as typeof banco.cliente.from;

    expect(await repassar({ modo: "mensagem" })).toBeNull();
    expect(lead().corretor_id).toBe(DONO);
    expect(avisos()).toEqual([]);
    expect(enfileirados()).toEqual([]);
    expect(banco.tabelas.lead_interacoes).toEqual([]);
    expect(registrarInteracao).not.toHaveBeenCalled();
  });

  it("ninguém disponível: o lead fica com o dono e nada sai para o cliente", async () => {
    semear("mensagem");
    fila = [];
    expect(await repassar({ modo: "mensagem" })).toBeNull();
    expect(whatsapps()).toEqual([]);
    expect(gravarMensagem).not.toHaveBeenCalled();
    expect(lead().corretor_id).toBe(DONO);
    expect(avisos()).toEqual([]);
  });
});

describe("roleta no modo grupo", () => {
  it("nenhuma mensagem ao cliente; a ficha muda de dono, o aviso do grupo é enfileirado e o escolhido é avisado para ligar", async () => {
    semear("grupo");
    expect(await repassar({ modo: "grupo" })).toBe("beto");
    expect(whatsapps()).toEqual([]);
    expect(gravarMensagem).not.toHaveBeenCalled();
    expect(obterOuCriarConversa).not.toHaveBeenCalled();
    expect(lead()).toMatchObject({ corretor_id: "beto", origem_atribuicao: "roleta" });
    expect(eventos.find((e) => e.tipo === "rpc" && e.nome === "proximo_da_roleta")).toMatchObject({ args: { p_modo: "grupo" } });
    expect(enfileirados()).toEqual([
      { tipo: "rpc", nome: "enfileirar_aviso_do_lead", args: { p_lead: "lead-1" }, donoNaHora: "beto" },
    ]);
    expect(avisos()).toHaveLength(1);
    expect(avisos()[0]).toMatchObject({ corretorId: "beto" });
    expect(avisos()[0].texto).toContain("Ligue para o cliente");
    // O WhatsApp de quem recebe nem é consultado.
    expect(banco.consultas.some((c) => c.tabela === "corretor_whatsapp_instancias")).toBe(false);
  });

  it("ninguém disponível no modo grupo: o lead fica com o dono e nada sai pela roleta", async () => {
    semear("grupo", "Oi, {cliente}! {corretor} vai te ligar.");
    fila = [];
    expect(await repassar({ modo: "grupo" })).toBeNull();
    expect(whatsapps()).toEqual([]);
    expect(lead().corretor_id).toBe(DONO);
  });

  it("com boas-vindas escrita, o número do anúncio manda o texto depois de a ficha trocar", async () => {
    semear("grupo", "Oi, {cliente}! Aqui é da {imobiliaria}. {corretor} vai te ligar sobre o {imovel}.");
    expect(await repassar({ modo: "grupo" })).toBe("beto");
    expect(whatsapps()).toEqual([
      { tipo: "whatsapp", instancia: "inst-dona", texto: "Oi, Carlos! Aqui é da Aretz. Beto vai te ligar sobre o Residencial Aurora." },
    ]);
    expect(gravarMensagem).toHaveBeenCalledWith(
      expect.objectContaining({ conversaId: "conv-dona", remetente: "bot", conteudo: whatsapps()[0].texto }),
    );
    expect(lead().corretor_id).toBe("beto");
  });

  it("boas-vindas que não sai não desfaz o repasse", async () => {
    semear("grupo", "Oi! {corretor} vai te ligar.");
    instanciasQueFalham.add("inst-dona");
    expect(await repassar({ modo: "grupo" })).toBe("beto");
    expect(gravarMensagem).not.toHaveBeenCalled();
    expect(avisos().map((a) => a.corretorId)).toEqual(["beto"]);
  });
});
