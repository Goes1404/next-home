import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, leiturasSemGrupo, type BancoFalso, type Linha } from "../../../../test/bancoFalso";
import type { LeituraDoRetorno } from "./leituraDoRetorno";

/**
 * O retorno da ligação aplicado de ponta a ponta, com o banco em memória que
 * aplica os filtros de verdade: o que se mede é o que fica gravado na ficha,
 * no aviso e no registro do retorno, e o que o número central responde.
 */

const GRUPO = "grupo-a";
const OUTRO_GRUPO = "grupo-b";
const CENTRAL = "central-aretz";
const GJID = "120363000000000001@g.us";
const NUMERO_DO_CORRETOR = "5511988887777@s.whatsapp.net";
const NUMERO_DO_GESTOR = "5511911112222@s.whatsapp.net";
const ENVIADA_EM = "2026-10-26T15:00:00.000Z";

let banco: BancoFalso;
let uploads: Array<{ bucket: string; caminho: string; opcoes: unknown }>;
let suspenso: boolean;
let enviadas: string[];
let chamadasRpc: Array<{ nome: string; args: Record<string, unknown> }>;

const lerRetornoDaLigacao = vi.fn();
const baixarMidiaDoProvedor = vi.fn();
const transcreverAudioWhatsapp = vi.fn();
const buscarDossieAtual = vi.fn();
const salvarDossie = vi.fn();

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("@/lib/planos/cobrancaDoGrupo", () => ({ grupoSuspenso: async () => suspenso }));
vi.mock("./ler", () => ({ lerRetornoDaLigacao: (...a: unknown[]) => lerRetornoDaLigacao(...a) }));
vi.mock("@/lib/whatsapp/audioTranscriber", () => ({
  transcreverAudioWhatsapp: (...a: unknown[]) => transcreverAudioWhatsapp(...a),
}));
vi.mock("@/lib/whatsapp/repositorio", () => ({
  buscarDossieAtual: (...a: unknown[]) => buscarDossieAtual(...a),
  salvarDossie: (...a: unknown[]) => salvarDossie(...a),
}));
vi.mock("@/lib/whatsapp/provider", () => ({
  baixarMidiaDoProvedor: (...a: unknown[]) => baixarMidiaDoProvedor(...a),
  enviarMensagemWhatsappParaGrupo: async (p: { texto: string }) => {
    enviadas.push(p.texto);
    return { enviado: true, messageId: `central-${enviadas.length}` };
  },
}));

const { tratarMensagemDoGrupoDeLeads } = await import("./index");

function leitura(parcial: Partial<LeituraDoRetorno>): LeituraDoRetorno {
  return {
    resultado: "atendeu",
    etapa: null,
    visitaEm: null,
    motivoPerda: null,
    resumo: null,
    proximoPasso: null,
    fatos: {},
    ...parcial,
  };
}

function lida(parcial: Partial<LeituraDoRetorno>) {
  return { ok: true, leitura: leitura(parcial), tokensEntrada: 900, tokensSaida: 120, modelo: "modelo-teste", latenciaMs: 40 };
}

function semear(extra: Partial<Record<string, Linha[]>> = {}) {
  banco = bancoFalso({
    grupos: [
      { id: GRUPO, envio_grupo_leads_instancia: CENTRAL, envio_grupo_leads_ativo: true },
      { id: OUTRO_GRUPO, envio_grupo_leads_instancia: "outra", envio_grupo_leads_ativo: true },
    ],
    corretores: [
      { id: "joao", grupo_id: GRUPO, ativo: true, whatsapp: "11988887777", whatsapp_lid: null, whatsapp_grupo_leads_jid: GJID },
      { id: "beto", grupo_id: GRUPO, ativo: true, whatsapp: "11977776666", whatsapp_lid: null, whatsapp_grupo_leads_jid: "999@g.us" },
    ],
    leads: [
      { id: "lead-ana", grupo_id: GRUPO, nome: "Ana", etapa: "novo", corretor_id: "joao", visita_agendada_em: null, empreendimento_id: null },
      { id: "lead-paulo", grupo_id: GRUPO, nome: "Paulo", etapa: "novo", corretor_id: "joao", visita_agendada_em: null, empreendimento_id: null },
      // Mesmo id de aviso, outro grupo: nunca pode ser lido.
      { id: "lead-x", grupo_id: OUTRO_GRUPO, nome: "Xavier", etapa: "novo", corretor_id: "joao", visita_agendada_em: null, empreendimento_id: null },
    ],
    lead_envios_grupo: [
      {
        id: "env-ana",
        grupo_id: GRUPO,
        lead_id: "lead-ana",
        corretor_id: "joao",
        status: "enviado",
        provider_message_id: "aviso-ana",
        retorno_em: null,
        tentativas_ligacao: 1,
        enviado_em: "2026-10-26T12:00:00.000Z",
      },
      {
        id: "env-x",
        grupo_id: OUTRO_GRUPO,
        lead_id: "lead-x",
        corretor_id: "joao",
        status: "enviado",
        provider_message_id: "aviso-x",
        retorno_em: null,
        tentativas_ligacao: 0,
        enviado_em: "2026-10-26T11:00:00.000Z",
      },
    ],
    retornos_de_ligacao: [],
    lead_interacoes: [],
    ia_interacoes: [],
    empreendimentos: [],
    ...extra,
  });
  // A soma da tentativa é no banco (0218): o falso faz o mesmo update, com o grupo no filtro.
  banco.cliente.rpc = async (nome: string, args: { p_envio: string; p_grupo: string; p_delta: number }) => {
    chamadasRpc.push({ nome, args });
    const linha = banco.tabelas.lead_envios_grupo.find((l) => l.id === args.p_envio && l.grupo_id === args.p_grupo);
    if (!linha) return { data: null, error: null };
    linha.tentativas_ligacao = Math.max(0, Number(linha.tentativas_ligacao) + args.p_delta);
    return { data: linha.tentativas_ligacao, error: null };
  };
  banco.cliente.storage = {
    from: (bucket: string) => ({
      upload: async (caminho: string, _corpo: unknown, opcoes: unknown) => {
        uploads.push({ bucket, caminho, opcoes });
        return { error: null };
      },
    }),
  };
}

function avisoDoPaulo(): Linha {
  return {
    id: "env-paulo",
    grupo_id: GRUPO,
    lead_id: "lead-paulo",
    corretor_id: "joao",
    status: "enviado",
    provider_message_id: "aviso-paulo",
    retorno_em: null,
    tentativas_ligacao: 0,
    enviado_em: "2026-10-26T13:00:00.000Z",
  };
}

function mensagem(p: { id: string; texto?: string; citada?: string; autor?: string; audio?: boolean }) {
  const contexto = p.citada ? { contextInfo: { stanzaId: p.citada } } : {};
  const message = p.audio
    ? { audioMessage: { seconds: 12, mimetype: "audio/ogg; codecs=opus", ...contexto } }
    : { extendedTextMessage: { text: p.texto ?? "", ...contexto } };
  return {
    event: "messages.upsert",
    data: {
      key: { remoteJid: GJID, id: p.id, fromMe: false, participant: p.autor ?? NUMERO_DO_CORRETOR },
      message,
      messageTimestamp: Math.floor(Date.parse(ENVIADA_EM) / 1000),
    },
  };
}

const tratar = (payload: unknown, instanceName = CENTRAL, jidBruto = GJID) =>
  tratarMensagemDoGrupoDeLeads({ payload, instanceName, jidBruto });

const retornos = () => banco.tabelas.retornos_de_ligacao;
const interacoes = (tipo: string) => banco.tabelas.lead_interacoes.filter((l) => l.tipo === tipo);
const lead = (id: string) => banco.tabelas.leads.find((l) => l.id === id)!;
const envio = (id: string) => banco.tabelas.lead_envios_grupo.find((l) => l.id === id)!;

beforeEach(() => {
  uploads = [];
  enviadas = [];
  chamadasRpc = [];
  suspenso = false;
  lerRetornoDaLigacao.mockReset();
  baixarMidiaDoProvedor.mockReset();
  transcreverAudioWhatsapp.mockReset();
  buscarDossieAtual.mockReset().mockResolvedValue(null);
  salvarDossie.mockReset().mockResolvedValue(undefined);
  semear();
});

describe("quem entra por aqui", () => {
  it("número que não é o central de um grupo com envio ligado: não é tratada", async () => {
    expect(await tratar(mensagem({ id: "m1", texto: "falei com a Ana" }), "outro-numero")).toEqual({ tratada: false });
    expect(retornos()).toHaveLength(0);
  });

  it("grupo de WhatsApp que não é de corretor ativo do grupo: não é tratada", async () => {
    expect(await tratar(mensagem({ id: "m1", texto: "oi" }), CENTRAL, "777@g.us")).toEqual({ tratada: false });
  });

  it("mensagem do gestor no grupo do corretor: silêncio, nada gravado", async () => {
    const r = await tratar(mensagem({ id: "m1", texto: "João, liga pra Ana", autor: NUMERO_DO_GESTOR }));
    expect(r).toEqual({ tratada: true });
    expect(retornos()).toHaveLength(0);
    expect(enviadas).toHaveLength(0);
    expect(lerRetornoDaLigacao).not.toHaveBeenCalled();
  });

  it("erro no meio não escapa: tratada, e o erro fica no log", async () => {
    lerRetornoDaLigacao.mockRejectedValue(new Error("explodiu"));
    await expect(tratar(mensagem({ id: "m1", texto: "falei com a Ana" }))).resolves.toEqual({ tratada: true });
    expect(retornos()[0].status).toBe("falhou");
  });
});

describe("aplicar o retorno", () => {
  it("a mesma mensagem duas vezes: um registro só, e a segunda sai sem responder", async () => {
    lerRetornoDaLigacao.mockResolvedValue(lida({ resultado: "nao_atendeu" }));
    await tratar(mensagem({ id: "m1", texto: "liguei pra Ana, não atendeu" }));
    await tratar(mensagem({ id: "m1", texto: "liguei pra Ana, não atendeu" }));
    expect(retornos()).toHaveLength(1);
    expect(enviadas).toHaveLength(1);
    expect(lerRetornoDaLigacao).toHaveBeenCalledTimes(1);
    expect(envio("env-ana").tentativas_ligacao).toBe(2);
  });

  it("grupo suspenso: anota o texto bruto, sem IA e sem mudar a etapa", async () => {
    suspenso = true;
    await tratar(mensagem({ id: "m1", texto: "falei com a Ana, visita sábado 10h" }));
    expect(lerRetornoDaLigacao).not.toHaveBeenCalled();
    expect(interacoes("ligacao")).toHaveLength(1);
    expect(interacoes("ligacao")[0]).toMatchObject({
      lead_id: "lead-ana",
      corretor_id: "joao",
      conteudo: "falei com a Ana, visita sábado 10h",
      detalhes: { origem: "grupo_whatsapp", resultado: null, mensagem_id: "m1" },
    });
    expect(interacoes("etapa")).toHaveLength(0);
    expect(lead("lead-ana").etapa).toBe("novo");
    expect(retornos()[0]).toMatchObject({ status: "sem_leitura", lead_id: "lead-ana", confirmacao_mensagem_id: "central-1" });
    expect(enviadas).toEqual(["📝 Ana · anotado na ficha, sem leitura automática"]);
    expect(banco.tabelas.ia_interacoes).toHaveLength(0);
  });

  it("não atendeu: soma a tentativa e não mexe no retorno nem na etapa", async () => {
    lerRetornoDaLigacao.mockResolvedValue(lida({ resultado: "nao_atendeu" }));
    await tratar(mensagem({ id: "m1", texto: "Ana não atendeu" }));
    expect(envio("env-ana")).toMatchObject({ tentativas_ligacao: 2, retorno_em: null });
    expect(lead("lead-ana").etapa).toBe("novo");
    expect(enviadas).toEqual(["📞 Ana · não atendeu (2ª tentativa)"]);
    expect(retornos()[0]).toMatchObject({ status: "aplicado", resultado: "nao_atendeu", envio_id: "env-ana" });
  });

  it("atendeu com visita: retorno, visita, etapa com histórico, dossiê, custo e confirmação", async () => {
    buscarDossieAtual.mockResolvedValue({ leadId: "lead-ana", orcamentoMax: 500000, regiaoInteresse: "Centro", resumoExecutivo: "antigo", temperaturaLabel: "morno", temperaturaScore: 55 });
    lerRetornoDaLigacao.mockResolvedValue(
      lida({
        etapa: "visita_agendada",
        visitaEm: "2026-10-31T13:00:00.000Z",
        resumo: "Quer 3 quartos até 600 mil, FGTS.",
        fatos: { dormitoriosMin: 3, orcamentoMax: 600000, exigenciasEspecificas: ["usa_fgts"] },
      }),
    );
    await tratar(mensagem({ id: "m1", texto: "falei com a Ana, 3 quartos até 600 mil, FGTS, visita sábado 10h" }));

    expect(envio("env-ana").retorno_em).toEqual(expect.any(String));
    expect(envio("env-ana").tentativas_ligacao).toBe(1);
    expect(lead("lead-ana")).toMatchObject({ etapa: "visita_agendada", visita_agendada_em: "2026-10-31T13:00:00.000Z" });
    expect(interacoes("etapa")).toEqual([
      expect.objectContaining({
        conteudo: "Leads → Visita marcada",
        detalhes: { de: "novo", para: "visita_agendada", origem: "grupo_whatsapp" },
      }),
    ]);
    expect(interacoes("ligacao")[0].detalhes).toMatchObject({ origem: "grupo_whatsapp", resultado: "atendeu", mensagem_id: "m1", audio_path: null });

    // Dossiê: só o que o relato trouxe por cima do que já se sabia.
    expect(salvarDossie).toHaveBeenCalledWith(
      "lead-ana",
      expect.objectContaining({ orcamentoMax: 600000, regiaoInteresse: "Centro", dormitoriosMin: 3, resumoExecutivo: "Quer 3 quartos até 600 mil, FGTS." }),
    );

    const custo = banco.tabelas.ia_interacoes;
    expect(custo).toHaveLength(1);
    expect(custo[0]).toMatchObject({ grupo_id: GRUPO, corretor_id: "joao", origem: "retorno_ligacao", modelo: "modelo-teste", tokens_entrada: 900 });
    expect(["respondida", "visita_confirmada", "transferida"]).not.toContain(custo[0].acao);

    expect(enviadas).toEqual(["✅ Ana · visita agendada sáb 31/10 10h · 3 quartos · até R$ 600 mil · FGTS"]);
    expect(retornos()[0]).toMatchObject({ status: "aplicado", lead_id: "lead-ana", confirmacao_mensagem_id: "central-1" });
    expect(lerRetornoDaLigacao.mock.calls[0][0]).toMatchObject({
      dossieAtual: expect.stringContaining("Resumo: antigo"),
      agora: new Date(ENVIADA_EM),
    });
    expect(lerRetornoDaLigacao.mock.calls[0][0].dossieAtual).toContain("Região: Centro");
  });

  it("perdido: etapa perdido com o motivo no histórico", async () => {
    lerRetornoDaLigacao.mockResolvedValue(lida({ etapa: "perdido", motivoPerda: "comprou em outro lugar" }));
    await tratar(mensagem({ id: "m1", texto: "Ana comprou em outro lugar" }));
    expect(lead("lead-ana").etapa).toBe("perdido");
    expect(interacoes("etapa")[0].detalhes).toMatchObject({ para: "perdido", motivo_perda: "comprou em outro lugar" });
    expect(enviadas).toEqual(["🚫 Ana · perdido: comprou em outro lugar"]);
  });

  it("correção: sobrescreve a visita do retorno corrigido e grava nova linha ligacao com corrige_id", async () => {
    lerRetornoDaLigacao.mockResolvedValueOnce(lida({ etapa: "visita_agendada", visitaEm: "2026-10-31T13:00:00.000Z" }));
    await tratar(mensagem({ id: "m1", texto: "falei com a Ana, visita sábado 10h" }));
    const primeiro = retornos()[0];
    expect(primeiro.confirmacao_mensagem_id).toBe("central-1");

    lerRetornoDaLigacao.mockResolvedValueOnce(lida({ etapa: "visita_agendada", visitaEm: "2026-11-01T14:00:00.000Z" }));
    await tratar(mensagem({ id: "m2", texto: "não, a visita é domingo 11h", citada: "central-1" }));

    expect(lerRetornoDaLigacao.mock.calls[1][0].relato).toBe(
      "falei com a Ana, visita sábado 10h\nCorreção do corretor: não, a visita é domingo 11h",
    );
    expect(lead("lead-ana")).toMatchObject({ etapa: "visita_agendada", visita_agendada_em: "2026-11-01T14:00:00.000Z" });
    expect(interacoes("etapa")).toHaveLength(1);
    expect(interacoes("ligacao")).toHaveLength(2);
    expect(interacoes("ligacao")[1]).toMatchObject({ conteudo: "não, a visita é domingo 11h", detalhes: { corrige_id: primeiro.id } });
    expect(retornos()[1]).toMatchObject({ status: "aplicado", corrige_id: primeiro.id, lead_id: "lead-ana" });
  });

  it("correção que desmarca: volta a etapa e tira a visita que o retorno anterior pôs", async () => {
    lerRetornoDaLigacao.mockResolvedValueOnce(lida({ etapa: "visita_agendada", visitaEm: "2026-10-31T13:00:00.000Z" }));
    await tratar(mensagem({ id: "m1", texto: "falei com a Ana, visita sábado 10h" }));
    lerRetornoDaLigacao.mockResolvedValueOnce(lida({}));
    await tratar(mensagem({ id: "m2", texto: "errei, não marcou visita", citada: "central-1" }));
    expect(lead("lead-ana")).toMatchObject({ etapa: "novo", visita_agendada_em: null });
  });

  it("nenhum cliente aguardando e sem citação: silêncio, e a conversa não fica guardada", async () => {
    envio("env-ana").retorno_em = "2026-10-26T13:00:00.000Z";
    await tratar(mensagem({ id: "m1", texto: "falei com o cliente" }));
    expect(enviadas).toEqual([]);
    expect(retornos()[0]).toMatchObject({ status: "ignorada", texto: null });
    expect(lerRetornoDaLigacao).not.toHaveBeenCalled();
  });

  it("em cima do aviso de um cliente que passou para outro corretor: não anota", async () => {
    lead("lead-ana").corretor_id = "beto";
    await tratar(mensagem({ id: "m1", texto: "falei com ela", citada: "aviso-ana" }));
    expect(enviadas).toEqual(["Ana agora está com outro corretor, então não anotei este retorno."]);
    expect(interacoes("ligacao")).toHaveLength(0);
  });

  it("dois aguardando sem nome no relato: pergunta, e o número em cima da pergunta aplica no escolhido", async () => {
    banco.tabelas.lead_envios_grupo.push(avisoDoPaulo());
    await tratar(mensagem({ id: "m1", texto: "não atendeu" }));
    expect(enviadas).toEqual(["Esse retorno é sobre: 1) Ana 2) Paulo? Responda em cima desta mensagem com o número."]);
    expect(retornos()[0]).toMatchObject({ status: "aguardando_escolha", opcoes: ["lead-ana", "lead-paulo"], confirmacao_mensagem_id: "central-1" });

    lerRetornoDaLigacao.mockResolvedValue(lida({ resultado: "nao_atendeu" }));
    await tratar(mensagem({ id: "m2", texto: "2", citada: "central-1" }));
    expect(lerRetornoDaLigacao.mock.calls[0][0].relato).toBe("não atendeu");
    expect(envio("env-paulo").tentativas_ligacao).toBe(1);
    expect(envio("env-ana").tentativas_ligacao).toBe(1);
    expect(retornos()[0]).toMatchObject({ status: "aplicado", lead_id: "lead-paulo", confirmacao_mensagem_id: "central-2" });
    expect(retornos()[1]).toMatchObject({ status: "aplicado", lead_id: "lead-paulo", leitura: { escolha: 1 } });
    expect(enviadas[1]).toBe("📞 Paulo · não atendeu (1ª tentativa)");
  });

  it("toda leitura com a chave de serviço recorta pelo grupo", async () => {
    banco.tabelas.lead_envios_grupo.push(avisoDoPaulo());
    lerRetornoDaLigacao.mockResolvedValue(lida({ resultado: "atendeu" }));
    await tratar(mensagem({ id: "m1", texto: "falei com o Paulo" }));
    for (const tabela of ["lead_envios_grupo", "leads", "retornos_de_ligacao", "corretores", "empreendimentos"]) {
      expect(leiturasSemGrupo(banco, tabela), tabela).toEqual([]);
    }
    expect(interacoes("ligacao")[0].lead_id).toBe("lead-paulo");
  });
});

describe("áudio", () => {
  it("guarda o áudio, transcreve e aplica o texto transcrito", async () => {
    baixarMidiaDoProvedor.mockResolvedValue({ ok: true, base64: "T2dnUw==", mimeType: "audio/ogg; codecs=opus" });
    transcreverAudioWhatsapp.mockResolvedValue({ sucesso: true, textoTranscrito: "Ana não atendeu", parcial: false });
    lerRetornoDaLigacao.mockResolvedValue(lida({ resultado: "nao_atendeu" }));
    await tratar(mensagem({ id: "a1", audio: true }));

    expect(baixarMidiaDoProvedor.mock.calls[0][0]).toMatchObject({
      instanceName: CENTRAL,
      messageId: "a1",
      mensagemCompleta: { key: expect.objectContaining({ id: "a1" }), message: expect.objectContaining({ audioMessage: expect.any(Object) }) },
    });
    expect(transcreverAudioWhatsapp.mock.calls[0][0]).toMatchObject({ segundos: 12 });
    expect(uploads).toEqual([{ bucket: "retornos-de-ligacao", caminho: `${GRUPO}/a1.ogg`, opcoes: expect.objectContaining({ contentType: "audio/ogg" }) }]);
    expect(retornos()[0]).toMatchObject({ texto: "Ana não atendeu", audio_path: `${GRUPO}/a1.ogg`, status: "aplicado" });
    expect(interacoes("ligacao")[0]).toMatchObject({ conteudo: "Ana não atendeu", detalhes: { audio_path: `${GRUPO}/a1.ogg` } });
  });

  it("não deu para transcrever: pede de novo e não anota nada", async () => {
    baixarMidiaDoProvedor.mockResolvedValue({ ok: true, base64: "T2dnUw==", mimeType: "audio/ogg" });
    transcreverAudioWhatsapp.mockResolvedValue({ sucesso: false, textoTranscrito: "", parcial: false, motivo: "nao_entendido" });
    await tratar(mensagem({ id: "a1", audio: true }));
    expect(enviadas).toEqual(["Não consegui entender o áudio, pode mandar de novo?"]);
    expect(retornos()[0].status).toBe("falhou");
    expect(interacoes("ligacao")).toHaveLength(0);
    expect(lerRetornoDaLigacao).not.toHaveBeenCalled();
  });

  it("grupo suspenso: guarda o áudio sem transcrever e anota como áudio", async () => {
    suspenso = true;
    baixarMidiaDoProvedor.mockResolvedValue({ ok: true, base64: "T2dnUw==", mimeType: "audio/ogg" });
    await tratar(mensagem({ id: "a1", audio: true }));
    expect(transcreverAudioWhatsapp).not.toHaveBeenCalled();
    expect(interacoes("ligacao")[0]).toMatchObject({ detalhes: { audio_path: `${GRUPO}/a1.ogg`, resultado: null } });
    expect(retornos()[0].status).toBe("sem_leitura");
  });
});

describe("confirmação completa, erros e correção em cadeia", () => {
  it("mudança de etapa sem visita nem perda aparece na confirmação", async () => {
    lerRetornoDaLigacao.mockResolvedValue(lida({ etapa: "em_conversa" }));
    await tratar(mensagem({ id: "m1", texto: "falei com a Ana, vai pensar" }));
    expect(lead("lead-ana").etapa).toBe("em_conversa");
    expect(enviadas).toEqual(["✅ Ana · → Em conversa"]);
  });

  it("o lead que o dossiê avançou sozinho para qualificado: a confirmação diz onde ele ficou", async () => {
    salvarDossie.mockImplementation(async () => {
      lead("lead-ana").etapa = "qualificado";
    });
    lerRetornoDaLigacao.mockResolvedValue(lida({ fatos: { dormitoriosMin: 2 } }));
    await tratar(mensagem({ id: "m1", texto: "falei com a Ana, 2 quartos" }));
    expect(enviadas).toEqual(["✅ Ana · → Qualificado · 2 quartos"]);
  });

  it("a soma da tentativa vai ao banco com o grupo", async () => {
    lerRetornoDaLigacao.mockResolvedValue(lida({ resultado: "nao_atendeu" }));
    await tratar(mensagem({ id: "m1", texto: "Ana não atendeu" }));
    expect(chamadasRpc).toEqual([
      { nome: "somar_tentativa_de_ligacao", args: { p_envio: "env-ana", p_grupo: GRUPO, p_delta: 1 } },
    ]);
  });

  it("erro inesperado antes de anotar: pede para mandar de novo e guarda o erro na linha", async () => {
    buscarDossieAtual.mockRejectedValue(new Error("banco fora"));
    await expect(tratar(mensagem({ id: "m1", texto: "falei com a Ana" }))).resolves.toEqual({ tratada: true });
    expect(enviadas).toEqual(["Não consegui anotar este retorno agora, pode mandar de novo?"]);
    expect(retornos()[0]).toMatchObject({ status: "falhou", leitura: { erro: "banco fora" } });
    expect(interacoes("ligacao")).toHaveLength(0);
  });

  it("erro depois de anotar na ficha: avisa sem pedir de novo (duplicaria) e guarda o erro", async () => {
    lerRetornoDaLigacao.mockResolvedValue(lida({ fatos: { dormitoriosMin: 2 } }));
    salvarDossie.mockRejectedValue(new Error("dossiê fora"));
    await tratar(mensagem({ id: "m1", texto: "falei com a Ana, 2 quartos" }));
    expect(enviadas).toEqual(["📝 Ana · anotei a ligação, mas não consegui atualizar o resto. Confira a ficha."]);
    expect(interacoes("ligacao")).toHaveLength(1);
    expect(retornos()[0]).toMatchObject({ status: "falhou", leitura: { erro: "dossiê fora" } });
  });

  it("número fora da lista em cima da pergunta: repete a mesma pergunta, sem nova pendência", async () => {
    banco.tabelas.lead_envios_grupo.push(avisoDoPaulo());
    await tratar(mensagem({ id: "m1", texto: "não atendeu" }));
    await tratar(mensagem({ id: "m2", texto: "3", citada: "central-1" }));
    expect(enviadas).toEqual([
      "Esse retorno é sobre: 1) Ana 2) Paulo? Responda em cima desta mensagem com o número.",
      "Esse retorno é sobre: 1) Ana 2) Paulo? Responda em cima desta mensagem com o número.",
    ]);
    expect(retornos().filter((r) => r.status === "aguardando_escolha")).toHaveLength(1);
    expect(retornos()[0].confirmacao_mensagem_id).toBe("central-2");
    expect(retornos()[1]).toMatchObject({ status: "falhou", leitura: { pergunta_repetida: retornos()[0].id } });

    lerRetornoDaLigacao.mockResolvedValue(lida({ resultado: "nao_atendeu" }));
    await tratar(mensagem({ id: "m3", texto: "1", citada: "central-2" }));
    expect(lerRetornoDaLigacao.mock.calls[0][0].relato).toBe("não atendeu");
    expect(interacoes("ligacao")[0]).toMatchObject({ lead_id: "lead-ana", conteudo: "não atendeu" });
  });

  it("correção em cadeia: não atendeu → atendeu → não atendeu deixa as contas certas e o relato inteiro", async () => {
    lerRetornoDaLigacao.mockResolvedValueOnce(lida({ resultado: "nao_atendeu" }));
    await tratar(mensagem({ id: "m1", texto: "Ana não atendeu" }));
    expect(envio("env-ana")).toMatchObject({ tentativas_ligacao: 2, retorno_em: null });

    lerRetornoDaLigacao.mockResolvedValueOnce(lida({ resultado: "atendeu" }));
    await tratar(mensagem({ id: "m2", texto: "errei, ela atendeu", citada: "central-1" }));
    expect(envio("env-ana").tentativas_ligacao).toBe(1);
    expect(envio("env-ana").retorno_em).toEqual(expect.any(String));

    // Cita a confirmação ORIGINAL de novo: vale sobre o último da cadeia.
    lerRetornoDaLigacao.mockResolvedValueOnce(lida({ resultado: "nao_atendeu" }));
    await tratar(mensagem({ id: "m3", texto: "não, não atendeu mesmo", citada: "central-1" }));
    expect(envio("env-ana")).toMatchObject({ tentativas_ligacao: 2, retorno_em: null });
    expect(lerRetornoDaLigacao.mock.calls[2][0].relato).toBe(
      "Ana não atendeu\nCorreção do corretor: errei, ela atendeu\nCorreção do corretor: não, não atendeu mesmo",
    );
    expect(retornos()[2].corrige_id).toBe(retornos()[1].id);
    expect(retornos()[1].corrige_id).toBe(retornos()[0].id);
  });

  it("confirmação antiga, fora dos últimos 200 retornos, ainda é reconhecida", async () => {
    envio("env-ana").retorno_em = "2026-10-20T10:00:00.000Z";
    banco.tabelas.lead_envios_grupo.push(avisoDoPaulo());
    for (let i = 0; i < 200; i++) {
      banco.tabelas.retornos_de_ligacao.push({
        id: `recente-${i}`,
        grupo_id: GRUPO,
        corretor_id: "joao",
        lead_id: "lead-paulo",
        mensagem_id: `rm-${i}`,
        confirmacao_mensagem_id: `rc-${i}`,
        status: "aplicado",
        texto: "x",
        leitura: null,
        corrige_id: null,
        opcoes: [],
      });
    }
    banco.tabelas.retornos_de_ligacao.push({
      id: "antigo",
      grupo_id: GRUPO,
      corretor_id: "joao",
      lead_id: "lead-ana",
      mensagem_id: "m-antiga",
      confirmacao_mensagem_id: "conf-antiga",
      status: "aplicado",
      texto: "falei com a Ana",
      leitura: null,
      corrige_id: null,
      opcoes: [],
    });
    lerRetornoDaLigacao.mockResolvedValue(lida({ resultado: "atendeu" }));
    await tratar(mensagem({ id: "m1", texto: "na verdade ela quer 3 quartos", citada: "conf-antiga" }));
    expect(lerRetornoDaLigacao.mock.calls[0][0].relato).toBe(
      "falei com a Ana\nCorreção do corretor: na verdade ela quer 3 quartos",
    );
    expect(interacoes("ligacao")[0].lead_id).toBe("lead-ana");
  });

  it("áudio não entendido: o caminho do arquivo guardado fica na linha (para a exclusão achar)", async () => {
    baixarMidiaDoProvedor.mockResolvedValue({ ok: true, base64: "T2dnUw==", mimeType: "audio/ogg" });
    transcreverAudioWhatsapp.mockResolvedValue({ sucesso: false, textoTranscrito: "", parcial: false });
    await tratar(mensagem({ id: "a1", audio: true }));
    expect(uploads).toHaveLength(1);
    expect(retornos()[0]).toMatchObject({ status: "falhou", audio_path: `${GRUPO}/a1.ogg` });
  });

  it("cliente apagado antes da escolha: diz que não achou, sem falar de outro corretor", async () => {
    banco.tabelas.lead_envios_grupo.push(avisoDoPaulo());
    await tratar(mensagem({ id: "m1", texto: "não atendeu" }));
    banco.tabelas.leads = banco.tabelas.leads.filter((l) => l.id !== "lead-paulo");
    await tratar(mensagem({ id: "m2", texto: "2", citada: "central-1" }));
    expect(enviadas[1]).toBe("Não achei esse cliente no CRM.");
    expect(interacoes("ligacao")).toHaveLength(0);
  });
});

describe("conversa no grupo não vira ligação", () => {
  const naoERelato = (custo: Record<string, unknown> | null = null) => ({ ok: true, leitura: "nao_e_relato", custo });

  /** Nada na ficha, no aviso nem no dossiê: a Ana continua exatamente como estava. */
  function nadaGravadoNaAna() {
    expect(banco.tabelas.lead_interacoes).toHaveLength(0);
    expect(lead("lead-ana")).toMatchObject({ etapa: "novo", visita_agendada_em: null });
    expect(envio("env-ana")).toMatchObject({ tentativas_ligacao: 1, retorno_em: null });
    expect(salvarDossie).not.toHaveBeenCalled();
    expect(chamadasRpc).toEqual([]);
  }

  for (const texto of ["bom dia", "ok", "👍"]) {
    it(`"${texto}" com um cliente aguardando: nada gravado, silêncio`, async () => {
      lerRetornoDaLigacao.mockResolvedValue(naoERelato());
      await tratar(mensagem({ id: "m1", texto }));
      nadaGravadoNaAna();
      expect(enviadas).toEqual([]);
      expect(retornos()[0]).toMatchObject({ status: "ignorada", texto: null });
    });
  }

  it("resposta ao gestor (cita a mensagem dele) com um cliente aguardando: nada gravado, silêncio", async () => {
    lerRetornoDaLigacao.mockResolvedValue(
      naoERelato({ modelo: "modelo-teste", latenciaMs: 30, tokensEntrada: 500, tokensSaida: 10 }),
    );
    await tratar(mensagem({ id: "m1", texto: "pode deixar, chefe, vou ligar agora", citada: "msg-do-gestor" }));
    nadaGravadoNaAna();
    expect(enviadas).toEqual([]);
    expect(retornos()[0]).toMatchObject({ status: "ignorada", texto: null });
    // A leitura custou: entra no medidor mesmo sem virar ligação.
    expect(banco.tabelas.ia_interacoes).toHaveLength(1);
  });

  it("\"ok\" em cima do aviso: nada gravado, e pede para contar de novo", async () => {
    lerRetornoDaLigacao.mockResolvedValue(naoERelato());
    await tratar(mensagem({ id: "m1", texto: "ok", citada: "aviso-ana" }));
    nadaGravadoNaAna();
    expect(enviadas).toEqual(["Não entendi como foi a ligação com Ana. Pode contar de novo?"]);
    expect(retornos()[0]).toMatchObject({ status: "ignorada", texto: null });
  });

  it("\"👍\" em cima da confirmação: não refaz a ligação, e pede para contar de novo", async () => {
    lerRetornoDaLigacao.mockResolvedValueOnce(lida({ resultado: "nao_atendeu" }));
    await tratar(mensagem({ id: "m1", texto: "liguei pra Ana, não atendeu" }));
    lerRetornoDaLigacao.mockResolvedValueOnce(naoERelato());
    await tratar(mensagem({ id: "m2", texto: "👍", citada: "central-1" }));
    expect(interacoes("ligacao")).toHaveLength(1);
    expect(envio("env-ana")).toMatchObject({ tentativas_ligacao: 2, retorno_em: null });
    expect(enviadas[1]).toBe("Não entendi como foi a ligação com Ana. Pode contar de novo?");
    expect(retornos()[1]).toMatchObject({ status: "ignorada", texto: null });
  });

  it("grupo suspenso e \"ok\": ignorado, sem anotar nem responder", async () => {
    suspenso = true;
    await tratar(mensagem({ id: "m1", texto: "ok" }));
    nadaGravadoNaAna();
    expect(enviadas).toEqual([]);
    expect(retornos()[0]).toMatchObject({ status: "ignorada", texto: null });
  });

  it("IA fora e \"bom dia\": ignorado; IA fora e um relato de verdade: anotado sem leitura", async () => {
    lerRetornoDaLigacao.mockResolvedValue({ ok: false });
    await tratar(mensagem({ id: "m1", texto: "bom dia" }));
    nadaGravadoNaAna();
    expect(enviadas).toEqual([]);
    expect(retornos()[0]).toMatchObject({ status: "ignorada", texto: null });

    await tratar(mensagem({ id: "m2", texto: "liguei pra Ana, caixa postal" }));
    expect(interacoes("ligacao")).toHaveLength(1);
    expect(retornos()[1]).toMatchObject({ status: "sem_leitura", lead_id: "lead-ana" });
  });
});

describe("relato novo sobre a pergunta, cadeia com elo sem leitura e visita devolvida", () => {
  it("texto livre em cima da pergunta é relato novo, com a própria pergunta; o antigo continua pendente", async () => {
    banco.tabelas.lead_envios_grupo.push(avisoDoPaulo());
    await tratar(mensagem({ id: "m1", texto: "não atendeu" }));
    await tratar(mensagem({ id: "m2", texto: "falei com o cliente, vai pensar", citada: "central-1" }));
    expect(enviadas).toHaveLength(2);
    expect(retornos()[0]).toMatchObject({ status: "aguardando_escolha", confirmacao_mensagem_id: "central-1", texto: "não atendeu" });
    expect(retornos()[1]).toMatchObject({
      status: "aguardando_escolha",
      confirmacao_mensagem_id: "central-2",
      opcoes: ["lead-ana", "lead-paulo"],
    });

    lerRetornoDaLigacao.mockResolvedValue(lida({}));
    await tratar(mensagem({ id: "m3", texto: "1", citada: "central-2" }));
    expect(lerRetornoDaLigacao.mock.calls[0][0].relato).toBe("falei com o cliente, vai pensar");
    expect(interacoes("ligacao")[0]).toMatchObject({ lead_id: "lead-ana", conteudo: "falei com o cliente, vai pensar" });
    expect(retornos()[0].status).toBe("aguardando_escolha");
  });

  it("cadeia que termina numa correção sem leitura: a próxima correção desfaz o que o último elo aplicado gravou", async () => {
    lerRetornoDaLigacao.mockResolvedValueOnce(lida({ etapa: "visita_agendada", visitaEm: "2026-10-31T13:00:00.000Z" }));
    await tratar(mensagem({ id: "m1", texto: "falei com a Ana, visita sábado 10h" }));

    suspenso = true;
    await tratar(mensagem({ id: "m2", texto: "visita é sábado mesmo", citada: "central-1" }));
    expect(retornos()[1]).toMatchObject({ status: "sem_leitura", corrige_id: retornos()[0].id });

    suspenso = false;
    lerRetornoDaLigacao.mockResolvedValueOnce(lida({}));
    await tratar(mensagem({ id: "m3", texto: "errei, não marcou visita", citada: "central-2" }));
    expect(lead("lead-ana")).toMatchObject({ etapa: "novo", visita_agendada_em: null });
    expect(retornos()[2].corrige_id).toBe(retornos()[1].id);
    expect(enviadas[2]).toBe("✅ Ana · visita desmarcada · → Leads");
  });

  it("correção que devolve a visita de antes diz a data", async () => {
    Object.assign(lead("lead-ana"), { etapa: "visita_agendada", visita_agendada_em: "2026-10-30T13:00:00.000Z" });
    lerRetornoDaLigacao.mockResolvedValueOnce(lida({ etapa: "visita_agendada", visitaEm: "2026-10-31T13:00:00.000Z" }));
    await tratar(mensagem({ id: "m1", texto: "Ana passou a visita para sábado 10h" }));
    lerRetornoDaLigacao.mockResolvedValueOnce(lida({}));
    await tratar(mensagem({ id: "m2", texto: "não, continua sexta", citada: "central-1" }));
    expect(lead("lead-ana").visita_agendada_em).toBe("2026-10-30T13:00:00.000Z");
    expect(enviadas[1]).toBe("✅ Ana · visita volta para sex 30/10 10h");
  });
});
