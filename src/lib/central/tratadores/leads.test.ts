import { describe, expect, it, vi } from "vitest";
import { bancoFalso, type Linha } from "../bancoFalso";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => null }));

const { criarAcoesDeLeads, lerTelefone } = await import("./leads");
const { criarExecutor } = await import("../executar");

const G = "g1";
const corretor = { corretorId: "c1", grupoId: G, papel: "corretor" as const, nome: "Carol", imobiliaria: "Next Home" };
const gestor = { ...corretor, corretorId: "gestor", papel: "gestor" as const, nome: "Gil" };

function lead(l: Linha): Linha {
  return {
    grupo_id: G,
    etapa: "novo",
    etapa_alterada_em: "2026-10-01T12:00:00Z",
    arquivado_em: null,
    renda_mensal: null,
    orcamento_max: null,
    regiao_interesse: null,
    visita_agendada_em: null,
    campos_do_corretor: [],
    ...l,
  };
}

function cenario(extra: Linha[] = []) {
  const b = bancoFalso({
    corretores: [
      { id: "c1", nome: "Carol", grupo_id: G },
      { id: "c2", nome: "Ana Lima", grupo_id: G },
      { id: "gestor", nome: "Gil", grupo_id: G },
    ],
    leads: [
      lead({ id: "m1", corretor_id: "c1", nome: "Mariana Souza", telefone: "11955554444", telefone_e164: "5511955554444", etapa: "primeiro_contato" }),
      lead({ id: "a1", corretor_id: "c2", nome: "Ana Souza", telefone: "11987001234", telefone_e164: "5511987001234" }),
      ...extra.map(lead),
    ],
    lead_interacoes: [],
  });
  const acoes = criarAcoesDeLeads(() => b.cliente);
  return { ...b, cadastrar: acoes.cadastrar_lead, atualizar: acoes.atualizar_lead };
}

const linha = (t: Record<string, Linha[]>, tabela: string, id: string) => t[tabela].find((l) => l.id === id)!;

describe("telefone do cadastro", () => {
  it("só inteiro, com DDD", () => {
    expect(lerTelefone("11 98765-4321")).toEqual({ tipo: "ok", telefone: "(11) 98765-4321", e164: "5511987654321" });
    expect(lerTelefone("+55 (11) 98765-4321")).toMatchObject({ tipo: "ok", e164: "5511987654321" });
    expect(lerTelefone("final 0000")).toEqual({ tipo: "incompleto" });
    expect(lerTelefone("98765-4321")).toEqual({ tipo: "incompleto" });
    expect(lerTelefone(undefined)).toEqual({ tipo: "faltou" });
  });
});

describe("cadastrar_lead", () => {
  it("telefone incompleto não propõe: pede o número inteiro", async () => {
    const { cadastrar, escritas } = cenario();
    const r = await cadastrar.preparar(corretor, { nome: "João Pereira", telefone: "o final é 0000" });
    expect(r).toMatchObject({ tipo: "resposta", resultado: { erro: expect.stringMatching(/telefone inteiro/) } });
    expect(await cadastrar.preparar(corretor, { nome: "João Pereira" })).toMatchObject({ tipo: "resposta" });
    expect(escritas).toEqual([]);
  });

  it("propõe com o resumo e NÃO grava no preparar", async () => {
    const { cadastrar, escritas } = cenario();
    const r = await cadastrar.preparar(corretor, { nome: "João Pereira", telefone: "11 98765-4321", regiao: "Alphaville", renda: 5000 });
    expect(r).toMatchObject({
      tipo: "proposta",
      resumo: "Cadastrar João Pereira, (11) 98765-4321, Alphaville, renda R$ 5.000",
      dados: { nome: "João Pereira", telefone: "(11) 98765-4321", telefoneE164: "5511987654321", rendaMensal: 5000 },
    });
    expect(escritas).toEqual([]);
  });

  it("os argumentos da foto ({ nome, telefone, observacao }) servem", async () => {
    const { cadastrar } = cenario();
    const r = await cadastrar.preparar(corretor, { nome: "Paula Reis", telefone: "(11) 97777-6666", observacao: "quer 2 dorms no Vitta" });
    expect(r).toMatchObject({ tipo: "proposta", dados: { mensagem: "quer 2 dorms no Vitta" } });
  });

  it("telefone que já é lead dele: diz que já existe, sem proposta", async () => {
    const { cadastrar, escritas } = cenario();
    const r = await cadastrar.preparar(corretor, { nome: "Mari", telefone: "11 95555-4444" });
    expect(r).toMatchObject({ tipo: "resposta", resultado: { jaExiste: true, mensagem: expect.stringMatching(/seu cliente Mariana Souza/) } });
    expect(escritas).toEqual([]);
  });

  it("telefone que é lead de outro corretor: não duplica e diz de quem é", async () => {
    const { cadastrar, escritas } = cenario();
    // Sem o nono dígito: as variantes casam do mesmo jeito que na palavra-chave.
    const r = await cadastrar.preparar(corretor, { nome: "Ana", telefone: "11 8700-1234" });
    expect(r).toMatchObject({ tipo: "resposta", resultado: { jaExiste: true, mensagem: expect.stringMatching(/de Ana Lima/) } });
    expect(escritas).toEqual([]);
  });

  it("o mesmo telefone em OUTRO grupo é número novo (não revela cliente de outra empresa)", async () => {
    const { cadastrar } = cenario([{ id: "x1", grupo_id: "outro", corretor_id: "z", nome: "X", telefone_e164: "5511987654321" }]);
    expect(await cadastrar.preparar(corretor, { nome: "João", telefone: "11 98765-4321" })).toMatchObject({ tipo: "proposta" });
  });

  it("executar grava só com os dados, na carteira de quem pediu e no grupo dele", async () => {
    const { cadastrar, tabelas } = cenario();
    const dados = {
      nome: "João Pereira",
      telefone: "(11) 98765-4321",
      telefoneE164: "5511987654321",
      regiaoInteresse: "Alphaville",
      rendaMensal: 5000,
      orcamentoMax: null,
      dormitoriosMin: null,
      mensagem: null,
    };
    const r = await cadastrar.executar(corretor, dados);
    expect(r).toMatchObject({ ok: true, desfazer: { leadId: expect.any(String) } });
    const novo = linha(tabelas, "leads", String(r.desfazer!.leadId));
    expect(novo).toMatchObject({
      nome: "João Pereira",
      telefone: "(11) 98765-4321",
      corretor_id: "c1",
      grupo_id: G,
      origem: "painel/manual",
      origem_atribuicao: "manual",
      regiao_interesse: "Alphaville",
      renda_mensal: 5000,
      campos_do_corretor: ["nome", "regiao_interesse", "renda_mensal"],
    });
    expect(novo).not.toHaveProperty("telefone_e164");
    expect(novo).not.toHaveProperty("consentimento_lgpd");
  });

  it("gestor cadastra na carteira dele mesmo", async () => {
    const { cadastrar, tabelas } = cenario();
    const p = await cadastrar.preparar(gestor, { nome: "Rui Costa", telefone: "11 93333-2222" });
    if (p.tipo !== "proposta") throw new Error("esperava proposta");
    const r = await cadastrar.executar(gestor, p.dados);
    expect(linha(tabelas, "leads", String(r.desfazer!.leadId)).corretor_id).toBe("gestor");
  });

  it("executar confere a duplicidade de novo (o número chegou entre a proposta e o sim)", async () => {
    const { cadastrar, tabelas, escritas } = cenario();
    const p = await cadastrar.preparar(corretor, { nome: "João", telefone: "11 98765-4321" });
    if (p.tipo !== "proposta") throw new Error("esperava proposta");
    tabelas.leads.push(lead({ id: "b1", corretor_id: "c2", nome: "João P", telefone_e164: "5511987654321" }));
    const r = await cadastrar.executar(corretor, p.dados);
    expect(r).toMatchObject({ ok: false, texto: expect.stringMatching(/Ana Lima/) });
    expect(escritas.filter((e) => e.tabela === "leads")).toEqual([]);
  });

  it("desfazer arquiva o lead cadastrado, sem apagar", async () => {
    const { cadastrar, tabelas } = cenario();
    const p = await cadastrar.preparar(corretor, { nome: "João", telefone: "11 98765-4321" });
    if (p.tipo !== "proposta") throw new Error("esperava proposta");
    const r = await cadastrar.executar(corretor, p.dados);
    const leadId = String(r.desfazer!.leadId);
    expect(await cadastrar.desfazer!(corretor, r.desfazer!)).toMatchObject({ ok: true, texto: expect.stringMatching(/arquivado/) });
    expect(linha(tabelas, "leads", leadId).arquivado_em).toEqual(expect.any(String));
    // Outro corretor não desfaz o que não é dele.
    linha(tabelas, "leads", leadId).arquivado_em = null;
    expect(await cadastrar.desfazer!({ ...corretor, corretorId: "c2" }, r.desfazer!)).toMatchObject({ ok: false });
    expect(linha(tabelas, "leads", leadId).arquivado_em).toBeNull();
  });

  it("pelo executor: vira item de proposta, e nada é gravado antes do sim", async () => {
    const { cadastrar, atualizar, escritas } = cenario();
    const ex = criarExecutor(corretor, { consultas: {}, acoes: { cadastrar_lead: cadastrar, atualizar_lead: atualizar } }, 1);
    expect(await ex.executar("cadastrar_lead", { nome: "João", telefone: "11 98765-4321" })).toMatchObject({ proposto: true });
    expect(ex.itensPropostos).toHaveLength(1);
    expect(escritas).toEqual([]);
  });
});

describe("atualizar_lead", () => {
  it("propõe com o antes → depois e não grava", async () => {
    const { atualizar, escritas } = cenario();
    const r = await atualizar.preparar(corretor, { lead: "Mariana", etapa: "documentacao", renda: 6200, anotacao: "visitou o Vitta e gostou" });
    expect(r).toMatchObject({
      tipo: "proposta",
      resumo: 'Mariana Souza: etapa Mensagem enviada → Documentação; renda R$ 6.200; anotação "visitou o Vitta e gostou"',
      dados: { leadId: "m1", mudancas: { etapa: "documentacao", renda_mensal: 6200 } },
    });
    expect(escritas).toEqual([]);
  });

  it("nada a mudar não vira proposta", async () => {
    const { atualizar } = cenario();
    expect(await atualizar.preparar(corretor, { lead: "Mariana", etapa: "primeiro_contato" })).toMatchObject({ tipo: "resposta" });
  });

  it("visita marcada sem data pede a visita", async () => {
    const { atualizar } = cenario();
    expect(await atualizar.preparar(corretor, { lead: "Mariana", etapa: "visita_agendada" })).toMatchObject({
      tipo: "resposta",
      resultado: { erro: expect.stringMatching(/dia e da hora/) },
    });
  });

  it("corretor não mexe em lead de outro corretor, nem pelo preparar nem pelo executar", async () => {
    const { atualizar, tabelas, escritas } = cenario();
    expect(await atualizar.preparar(corretor, { lead: "Ana Souza", renda: 9000 })).toMatchObject({ tipo: "resposta" });
    const r = await atualizar.executar(corretor, { leadId: "a1", nome: "Ana Souza", mudancas: { renda_mensal: 9000 }, anotacao: "x" });
    expect(r.ok).toBe(false);
    expect(linha(tabelas, "leads", "a1").renda_mensal).toBeNull();
    expect(escritas).toEqual([]);
  });

  it("gestor mexe em lead de qualquer corretor do grupo e vê de quem é", async () => {
    const { atualizar, tabelas } = cenario();
    const p = await atualizar.preparar(gestor, { lead: "Ana Souza", renda: 9000 });
    expect(p).toMatchObject({ tipo: "proposta", resumo: "Ana Souza (cliente de Ana Lima): renda R$ 9.000" });
    if (p.tipo !== "proposta") throw new Error("esperava proposta");
    expect(await atualizar.executar(gestor, p.dados)).toMatchObject({ ok: true });
    expect(linha(tabelas, "leads", "a1").renda_mensal).toBe(9000);
  });

  it("executar grava só com os dados; desfazer volta campos, etapa e tira a anotação", async () => {
    const { atualizar, tabelas } = cenario();
    const p = await atualizar.preparar(corretor, { lead: "Mariana", etapa: "documentacao", renda: 6200, anotacao: "vai financiar" });
    if (p.tipo !== "proposta") throw new Error("esperava proposta");
    const r = await atualizar.executar(corretor, p.dados);
    expect(r).toMatchObject({ ok: true, texto: expect.stringMatching(/Mariana Souza atualizado: etapa Mensagem enviada → Documentação; renda R\$ 6\.200/) });
    const m = linha(tabelas, "leads", "m1");
    expect(m).toMatchObject({ etapa: "documentacao", renda_mensal: 6200, campos_do_corretor: ["renda_mensal"] });
    expect(tabelas.lead_interacoes.map((i) => i.tipo).sort()).toEqual(["etapa", "nota"]);
    expect(tabelas.lead_interacoes.find((i) => i.tipo === "nota")).toMatchObject({ conteudo: "vai financiar", corretor_id: "c1" });

    const d = await atualizar.desfazer!(corretor, r.desfazer!);
    expect(d).toMatchObject({ ok: true, texto: expect.stringMatching(/voltou ao que era/) });
    expect(linha(tabelas, "leads", "m1")).toMatchObject({
      etapa: "primeiro_contato",
      etapa_alterada_em: "2026-10-01T12:00:00Z",
      renda_mensal: null,
      campos_do_corretor: [],
    });
    expect(tabelas.lead_interacoes.find((i) => i.tipo === "nota")).toBeUndefined();
    // A volta da etapa fica na linha do tempo, como qualquer mudança.
    expect(tabelas.lead_interacoes.filter((i) => i.tipo === "etapa")).toHaveLength(2);
  });

  it("desfazer não passa por cima do que mudou depois", async () => {
    const { atualizar, tabelas } = cenario();
    const p = await atualizar.preparar(corretor, { lead: "Mariana", etapa: "documentacao", renda: 6200 });
    if (p.tipo !== "proposta") throw new Error("esperava proposta");
    const r = await atualizar.executar(corretor, p.dados);
    linha(tabelas, "leads", "m1").renda_mensal = 7000;
    const d = await atualizar.desfazer!(corretor, r.desfazer!);
    expect(d).toMatchObject({ ok: true, texto: expect.stringMatching(/Não mexi em renda/) });
    expect(linha(tabelas, "leads", "m1")).toMatchObject({ etapa: "primeiro_contato", renda_mensal: 7000 });
  });

  it("lead que mudou de dono entre a proposta e o sim não é tocado", async () => {
    const { atualizar, tabelas } = cenario();
    const p = await atualizar.preparar(corretor, { lead: "Mariana", renda: 6200 });
    if (p.tipo !== "proposta") throw new Error("esperava proposta");
    linha(tabelas, "leads", "m1").corretor_id = "c2";
    expect(await atualizar.executar(corretor, p.dados)).toMatchObject({ ok: false });
    expect(linha(tabelas, "leads", "m1").renda_mensal).toBeNull();
  });
});
