import { describe, expect, it, vi } from "vitest";
import { gerarXlsx } from "@/lib/imoveis/xlsxEscrita";
import { bancoFalso, type Linha } from "../bancoFalso";
import type { ContextoDoCentral } from "../executar";
import type { ReferenciaDaMidia } from "../midia";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => null }));

// A fábrica, sem `../executar`: o índice dos tratadores carregaria todas as frentes.
const { criarTratadoresDeDocumentos, itemDaFoto } = await import("./documentos");

const G = "g1";
const AGORA = new Date("2026-10-30T15:00:00Z"); // 12h em São Paulo, sexta
const corretor: ContextoDoCentral = { corretorId: "c1", grupoId: G, papel: "corretor", nome: "Carol", imobiliaria: "Next Home" };
const gestor: ContextoDoCentral = { ...corretor, corretorId: "gestor", papel: "gestor", nome: "Gil" };

const REF: ReferenciaDaMidia = {
  id: "3EB0FOTO",
  remoteJid: "5511987654321@s.whatsapp.net",
  tipo: "imageMessage",
  conteudo: { url: "https://mmg.whatsapp.net/x", mediaKey: "chave", mimetype: "image/jpeg" },
};
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 7)]).toString("base64");

function lead(l: Linha): Linha {
  return { grupo_id: G, etapa: "novo", arquivado_em: null, ...l };
}

function cenario() {
  const b = bancoFalso({
    leads: [
      lead({ id: "j1", corretor_id: "c1", nome: "João Pereira", telefone: "11955554444", telefone_e164: "5511955554444" }),
      lead({ id: "a1", corretor_id: "c2", nome: "Ana Souza", telefone: "11987001234", telefone_e164: "5511987001234" }),
    ],
    lead_documentos: [
      { id: "d1", grupo_id: G, lead_id: "j1", item: "RG ou CNH", caminho: "j1/link/rg.jpg", nome_arquivo: "rg.jpg", mime: "image/jpeg", created_at: "2026-10-20T10:00:00Z", alerta: null, fase: "financiamento", situacao: "recebido", motivo_recusa: null, origem: "link" },
    ],
    lead_documentos_lista: [{ lead_id: "j1", fase: "financiamento", itens: ["RG ou CNH", "Comprovante de residência", "3 últimos holerites ou comprovante de renda"], perfil: "clt" }],
    links_do_cliente: [],
    anotacoes: [],
  });
  const baixar = vi.fn(async () => ({ ok: true as const, base64: JPEG, mimeType: "audio/ogg" }));
  const anexar = vi.fn(async () => ({ ok: true as const, documentoId: "doc-novo", caminho: "j1/central/x.jpg" }));
  const removerAnexo = vi.fn(async () => ({ ok: true }));
  const podeMandar = vi.fn(async () => ({ ok: true as const }));
  const mandarLink = vi.fn(async () => ({ ok: true as const, texto: "Oi, João! ..." }));
  const t = criarTratadoresDeDocumentos({
    supabase: () => b.cliente,
    relogio: () => AGORA,
    baixar,
    anexar,
    removerAnexo,
    podeMandar,
    mandarLink,
  });
  return {
    ...b,
    docs: t.acoes.documentos_do_lead,
    lembrete: t.acoes.lembrete,
    planilha: t.acoes.importar_planilha,
    baixar,
    anexar,
    removerAnexo,
    podeMandar,
    mandarLink,
  };
}

const comFoto = (ctx: ContextoDoCentral, dica: string): ContextoDoCentral => ({ ...ctx, midia: { tipo: "foto", referencia: REF, dica } });

describe("documentos_do_lead: ver", () => {
  it("mostra o que já chegou e o que falta, como a ficha, sem gravar nada", async () => {
    const { docs, escritas } = cenario();
    const r = await docs.preparar(corretor, { lead: "João", o_que: "ver" });
    expect(r.tipo).toBe("resposta");
    const resultado = (r as { resultado: { cliente: string; fases: { documentos: unknown[]; faltam: string[]; link: string }[] } }).resultado;
    expect(resultado.cliente).toBe("João Pereira");
    expect(resultado.fases[0].documentos).toContainEqual({ documento: "RG ou CNH", situacao: "chegou, esperando conferência" });
    expect(resultado.fases[0].faltam).toEqual(["Comprovante de residência", "3 últimos holerites ou comprovante de renda"]);
    expect(resultado.fases[0].link).toBe("sem link de documentos");
    expect(JSON.stringify(resultado)).not.toContain("j1/link/rg.jpg");
    expect(escritas).toEqual([]);
  });

  it("corretor não alcança lead de outro; o gestor lê", async () => {
    const { docs } = cenario();
    expect(await docs.preparar(corretor, { lead: "Ana Souza", o_que: "ver" })).toMatchObject({
      tipo: "resposta",
      resultado: { erro: expect.stringMatching(/Não achei/) },
    });
    expect(await docs.preparar(gestor, { lead: "Ana Souza", o_que: "ver" })).toMatchObject({
      tipo: "resposta",
      resultado: { cliente: "Ana Souza", semLista: true },
    });
  });
});

describe("documentos_do_lead: mandar_link", () => {
  it("vira proposta (nada sai antes do sim) e, no sim, sai pelo número do corretor", async () => {
    const { docs, escritas, podeMandar, mandarLink } = cenario();
    const r = await docs.preparar(corretor, { lead: "João", o_que: "mandar_link" });
    expect(r).toMatchObject({
      tipo: "proposta",
      resumo: "Mandar a João Pereira, pelo seu WhatsApp, o link para enviar os documentos do financiamento",
      dados: { o_que: "mandar_link", leadId: "j1", fase: "financiamento" },
    });
    expect(podeMandar).toHaveBeenCalledWith(expect.anything(), { grupoId: G, corretorId: "c1", leadId: "j1" }, AGORA);
    expect(mandarLink).not.toHaveBeenCalled();
    expect(escritas).toEqual([]);

    const feito = await docs.executar(corretor, (r as { dados: Record<string, unknown> }).dados);
    expect(feito).toEqual({ ok: true, texto: "Mandei a João Pereira, pelo seu WhatsApp, o link de documentos." });
    expect(mandarLink).toHaveBeenCalledWith(expect.anything(), { grupoId: G, corretorId: "c1", leadId: "j1", fase: "financiamento" }, AGORA);
  });

  it("o gestor não manda ao cliente de outro corretor; sem canal, diz por quê", async () => {
    const { docs, podeMandar } = cenario();
    expect(await docs.preparar(gestor, { lead: "Ana Souza", o_que: "mandar_link" })).toMatchObject({
      resultado: { erro: expect.stringMatching(/não é cliente seu/) },
    });
    expect(podeMandar).not.toHaveBeenCalled();

    podeMandar.mockResolvedValueOnce({ ok: false, erro: "Seu WhatsApp está desconectado do sistema." } as never);
    expect(await docs.preparar(corretor, { lead: "João", o_que: "mandar_link" })).toMatchObject({
      resultado: { erro: "Seu WhatsApp está desconectado do sistema." },
    });
  });
});

describe("documentos_do_lead: anexar", () => {
  it("sem foto, ou sem dizer de quem é: pergunta, nada grava", async () => {
    const { docs, escritas } = cenario();
    expect(await docs.preparar(corretor, { lead: "João", o_que: "anexar" })).toMatchObject({ resultado: { erro: expect.stringMatching(/foto do documento/) } });
    expect(await docs.preparar(comFoto(corretor, ""), { o_que: "anexar" })).toEqual({
      tipo: "resposta",
      resultado: { pergunta: "De qual cliente é esse documento?" },
    });
    expect(escritas).toEqual([]);
  });

  it("propõe o item da lista do lead; a foto vai só pela referência; grava só no sim", async () => {
    const { docs, escritas, baixar, anexar, removerAnexo } = cenario();
    const r = await docs.preparar(comFoto(corretor, "rg do joão"), { lead: "João", o_que: "anexar" });
    expect(r).toMatchObject({
      tipo: "proposta",
      resumo: 'Guardar a foto como "RG ou CNH" na Documentação de João Pereira (financiamento), para você conferir na ficha',
      dados: { o_que: "anexar", leadId: "j1", fase: "financiamento", item: "RG ou CNH", _midia: REF },
    });
    expect(JSON.stringify(r)).not.toContain(JPEG);
    expect(baixar).not.toHaveBeenCalled();
    expect(anexar).not.toHaveBeenCalled();
    expect(escritas).toEqual([]);

    const feito = await docs.executar(corretor, (r as { dados: Record<string, unknown> }).dados);
    expect(feito).toMatchObject({ ok: true, desfazer: { o_que: "anexar", documentoId: "doc-novo" } });
    expect(baixar).toHaveBeenCalledWith(REF);
    expect(anexar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ grupoId: G, corretorId: "c1", leadId: "j1", fase: "financiamento", item: "RG ou CNH", mimeType: "image/jpeg" }),
    );

    expect(await docs.desfazer!(corretor, { o_que: "anexar", documentoId: "doc-novo", nome: "João Pereira" })).toMatchObject({ ok: true });
    expect(removerAnexo).toHaveBeenCalledWith(expect.anything(), { grupoId: G, corretorId: "c1", documentoId: "doc-novo" });
  });

  it("sem dizer qual documento é: pergunta, com o que falta na lista", async () => {
    const { docs } = cenario();
    expect(await docs.preparar(comFoto(corretor, "é do joão"), { lead: "João", o_que: "anexar" })).toMatchObject({
      resultado: { pergunta: expect.stringMatching(/Qual documento de João Pereira.*Comprovante de residência/) },
    });
  });

  it("documento de cliente de outro corretor não é anexado (nem pelo gestor)", async () => {
    const { docs } = cenario();
    expect(await docs.preparar(comFoto(gestor, "rg"), { lead: "Ana Souza", o_que: "anexar" })).toMatchObject({
      resultado: { erro: expect.stringMatching(/não é cliente seu/) },
    });
    expect(await docs.preparar(comFoto(corretor, "rg"), { lead: "Ana Souza", o_que: "anexar" })).toMatchObject({
      resultado: { erro: expect.stringMatching(/Não achei/) },
    });
  });

  it("documento nunca vira lead: o anexo não cadastra ninguém", async () => {
    const { docs, tabelas } = cenario();
    const r = await docs.preparar(comFoto(corretor, "RG do Carlos Silva, cliente João, tel 11 99999-0000"), { lead: "João", o_que: "anexar" });
    await docs.executar(corretor, (r as { dados: Record<string, unknown> }).dados);
    expect(tabelas.leads).toHaveLength(2);
  });

  it("qual documento é, pela fala", () => {
    const doc = {
      fases: {
        financiamento: { itens: ["RG ou CNH", "CPF (se não estiver no RG/CNH)", "Extrato do FGTS", "3 últimos holerites ou comprovante de renda"] },
        contrato: { itens: [] },
      },
    } as never;
    expect(itemDaFoto("o RG dele", doc)).toEqual({ fase: "financiamento", item: "RG ou CNH" });
    expect(itemDaFoto("CPF", doc)).toEqual({ fase: "financiamento", item: "CPF (se não estiver no RG/CNH)" });
    expect(itemDaFoto("extrato do fgts", doc)).toEqual({ fase: "financiamento", item: "Extrato do FGTS" });
    expect(itemDaFoto("contracheque", doc)).toEqual({ fase: "financiamento", item: "3 últimos holerites ou comprovante de renda" });
    // Fora da lista dele: o nome do painel (fica avulso na ficha).
    expect(itemDaFoto("comprovante de residência", doc)).toEqual({ fase: "financiamento", item: "Comprovante de residência" });
    expect(itemDaFoto("contrato assinado", doc)).toEqual({ fase: "contrato", item: "Contrato de compra e venda assinado" });
    expect(itemDaFoto("olha isso", doc)).toBeNull();
  });
});

describe("lembrete", () => {
  it("sem hora, pergunta; nunca inventa o horário", async () => {
    const { lembrete, escritas } = cenario();
    expect(await lembrete.preparar(corretor, { quando: "amanhã", texto: "ligar pro João" })).toMatchObject({
      resultado: { pergunta: expect.stringMatching(/^Que horas, sábado/) },
    });
    expect(await lembrete.preparar(corretor, { texto: "ligar pro João" })).toMatchObject({ resultado: { pergunta: expect.stringMatching(/Para quando/) } });
    expect(await lembrete.preparar(corretor, { quando: "hoje às 9h", texto: "x" })).toMatchObject({ resultado: { erro: expect.stringMatching(/já passou/) } });
    expect(escritas).toEqual([]);
  });

  it("grava no instante certo de São Paulo, no lembrete do painel, e o desfazer apaga", async () => {
    const { lembrete, escritas, tabelas } = cenario();
    const r = await lembrete.preparar(corretor, { quando: "amanhã às 10h", texto: "ligar pro João", lead: "João" });
    expect(r).toMatchObject({
      tipo: "proposta",
      resumo: "Lembrar você sábado 31/10 às 10h: ligar pro João (cliente João Pereira)",
      dados: { texto: "ligar pro João", quando: "2026-10-31T13:00:00.000Z", leadId: "j1" },
    });
    expect(escritas).toEqual([]);

    const feito = await lembrete.executar(corretor, (r as { dados: Record<string, unknown> }).dados);
    expect(feito).toMatchObject({ ok: true, desfazer: { o_que: "lembrete" } });
    expect(tabelas.anotacoes[0]).toMatchObject({
      grupo_id: G,
      corretor_id: "c1",
      destinatario_id: "c1",
      lead_id: "j1",
      texto: "ligar pro João",
      lembrete_em: "2026-10-31T13:00:00.000Z",
      lembrete_whatsapp: true,
    });

    const desfeito = await lembrete.desfazer!(corretor, (feito as { desfazer: Record<string, unknown> }).desfazer);
    expect(desfeito).toEqual({ ok: true, texto: "Lembrete apagado." });
    expect(tabelas.anotacoes).toEqual([]);
  });

  it("lembrete de cliente que não é dele: não acha", async () => {
    const { lembrete } = cenario();
    expect(await lembrete.preparar(corretor, { quando: "amanhã às 10h", texto: "ligar", lead: "Ana Souza" })).toMatchObject({
      resultado: { erro: expect.stringMatching(/Não achei/) },
    });
  });
});

describe("importar_planilha", () => {
  const CSV = [
    "Nome;Telefone;Email",
    "Bruno Lima;11 98888-1111;bruno@x.com",
    "Carla Dias;(11) 97777-2222;",
    "Carla de novo;11977772222;",
    "Ana da outra carteira;11 98700-1234;",
    "Sem DDD;+55 98191-8127;",
  ].join("\n");
  const planilha = (ctx: ContextoDoCentral, base64: string, formato: "csv" | "xlsx" = "csv", nome = "clientes.csv"): ContextoDoCentral => ({
    ...ctx,
    midia: { tipo: "planilha", nome, formato, base64 },
  });

  it("sem planilha no pedido: pede o arquivo", async () => {
    const { planilha: acao } = cenario();
    expect(await acao.preparar(corretor, {})).toMatchObject({ tipo: "resposta", resultado: { mensagem: expect.stringMatching(/Mande a planilha/) } });
  });

  it("conta novos, os que já existiam no grupo (de qualquer corretor) e os de telefone inválido; nada grava antes do sim", async () => {
    const { planilha: acao, escritas } = cenario();
    const r = await acao.preparar(planilha(corretor, Buffer.from(CSV).toString("base64")), {});
    expect(r).toMatchObject({ tipo: "proposta", dados: { arquivo: "clientes.csv", novos: 2, existentes: 1, invalidos: 1 } });
    const resumo = (r as { resumo: string }).resumo;
    expect(resumo).toMatch(/2 clientes entram na sua carteira/);
    expect(resumo).toMatch(/1 já existia e 1 tem telefone inválido/);
    expect(resumo).toMatch(/autorização para tratar/);
    expect((r as unknown as { dados: { _linhas: unknown[] } }).dados._linhas).toEqual([
      { nome: "Bruno Lima", telefone: "5511988881111", email: "bruno@x.com", mensagem: null, imovelInteresse: null },
      { nome: "Carla Dias", telefone: "5511977772222", email: null, mensagem: null, imovelInteresse: null },
    ]);
    expect(escritas).toEqual([]);
  });

  it("o sim cadastra na carteira de quem mandou; o desfazer arquiva os dessa importação", async () => {
    const { planilha: acao, tabelas } = cenario();
    const r = await acao.preparar(planilha(corretor, Buffer.from(CSV).toString("base64")), {});
    const feito = await acao.executar(corretor, (r as { dados: Record<string, unknown> }).dados);
    expect(feito).toMatchObject({ ok: true, texto: "Pronto: 2 clientes cadastrados na sua carteira." });
    const novos = tabelas.leads.filter((l) => l.origem === "painel/importacao");
    expect(novos).toHaveLength(2);
    expect(novos[0]).toMatchObject({ nome: "Bruno Lima", telefone: "(11) 98888-1111", corretor_id: "c1", grupo_id: G, origem_atribuicao: "manual" });

    const ids = (feito as unknown as { desfazer: { leadIds: string[] } }).desfazer.leadIds;
    expect(ids).toHaveLength(2);
    expect(await acao.desfazer!(corretor, { o_que: "importar", leadIds: ids })).toEqual({
      ok: true,
      texto: "Importação desfeita: 2 clientes voltaram arquivados.",
    });
    expect(novos.every((l) => l.arquivado_em)).toBe(true);
    expect(tabelas.leads.find((l) => l.id === "j1")!.arquivado_em).toBeNull();
  });

  it("Excel (.xlsx) pelo mesmo leitor do painel", async () => {
    const { planilha: acao } = cenario();
    const xlsx = gerarXlsx({
      aba: "Leads",
      colunas: [
        { titulo: "Nome", largura: 20 },
        { titulo: "Celular", largura: 20 },
      ],
      linhas: [
        ["Diego Ramos", "11 96666-3333"],
        ["João de novo", "11 95555-4444"],
      ],
    });
    const r = await acao.preparar(planilha(corretor, xlsx.toString("base64"), "xlsx", "leads.xlsx"), {});
    expect(r).toMatchObject({ tipo: "proposta", dados: { novos: 1, existentes: 1, invalidos: 0 } });
  });

  it("só gente que já existe: nada a propor", async () => {
    const { planilha: acao } = cenario();
    const csv = Buffer.from("nome,telefone\nJoão,11 95555-4444\n").toString("base64");
    expect(await acao.preparar(planilha(corretor, csv), {})).toMatchObject({
      tipo: "resposta",
      resultado: { mensagem: expect.stringMatching(/nenhum cliente novo/) },
    });
  });
});
