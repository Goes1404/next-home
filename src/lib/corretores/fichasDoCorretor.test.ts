import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COLUNAS_DA_FICHA, planilhaDasFichas, type FichaDoLead } from "./fichasDoCorretor";

const ficha = (extra: Partial<FichaDoLead> = {}): FichaDoLead => ({
  nome: "Ana Prado",
  telefone: "5511981918127",
  email: "ana@exemplo.com",
  etapa: "qualificado",
  origem: "painel/manual",
  empreendimento_id: null,
  imovel_interesse_id: "imovel-1",
  orcamento_min: null,
  orcamento_max: "450000",
  renda_mensal: 9000,
  regiao_interesse: "Alphaville",
  dormitorios_min: 2,
  created_at: "2026-09-01T12:00:00Z",
  visita_agendada_em: null,
  arquivado_em: null,
  ...extra,
});

describe("a planilha das fichas do corretor que sai", () => {
  it("leva só a ficha: nenhuma coluna de conversa, mensagem ou leitura da IA", () => {
    const proibidas = ["mensagem", "detalhes", "conversa", "dossie", "observac", "resumo", "nota"];
    for (const p of proibidas) expect(COLUNAS_DA_FICHA, p).not.toMatch(new RegExp(p, "i"));
    const { colunas } = planilhaDasFichas([], new Map());
    for (const c of colunas) expect(c.titulo, c.titulo).not.toMatch(/mensagem|conversa|nota|resumo/i);
  });

  it("monta uma linha por lead, em português, com o imóvel pelo nome", () => {
    const p = planilhaDasFichas([ficha()], new Map([["imovel-1", "Vitra Alphaville"]]));
    expect(p.linhas).toHaveLength(1);
    const linha = Object.fromEntries(p.colunas.map((c, i) => [c.titulo, p.linhas[0][i]]));
    expect(linha).toMatchObject({
      Nome: "Ana Prado",
      Telefone: "(11) 98191-8127",
      "E-mail": "ana@exemplo.com",
      Etapa: "Qualificado",
      "Imóvel de interesse": "Vitra Alphaville",
      "Orçamento até": 450000,
      "Renda mensal": 9000,
      Região: "Alphaville",
      "Dormitórios (mín.)": 2,
      "Cadastrado em": "01/09/2026",
    });
  });

  it("diz quando o lead está arquivado e não inventa o que falta", () => {
    const p = planilhaDasFichas(
      [ficha({ arquivado_em: "2026-10-01T10:00:00Z", email: null, imovel_interesse_id: null, renda_mensal: null })],
      new Map(),
    );
    const linha = Object.fromEntries(p.colunas.map((c, i) => [c.titulo, p.linhas[0][i]]));
    expect(linha["Situação"]).toBe("Arquivado");
    expect(linha["E-mail"]).toBeNull();
    expect(linha["Imóvel de interesse"]).toBeNull();
    expect(linha["Renda mensal"]).toBeNull();
  });
});

describe("a rota da planilha não toca em conversa", () => {
  const rota = readFileSync(
    join(process.cwd(), "src", "app", "api", "painel", "fichas-do-corretor", "route.ts"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("não lê mensagens, conversas, dossiê nem linha do tempo", () => {
    for (const t of ["whatsapp_mensagens", "whatsapp_conversas", "lead_observacoes_ia", "lead_interacoes", "ia_interacoes"]) {
      expect(rota.includes(t), t).toBe(false);
    }
  });

  it("só o gestor baixa, e só os leads que o corretor trouxe, no grupo dele", () => {
    expect(rota).toMatch(/exigirGestorNaAcao\(/);
    expect(rota).toMatch(/\.eq\("trazido_por", "corretor"\)/);
    expect(rota).toMatch(/\.eq\("grupo_id", /);
    expect(rota.indexOf("exigirGestorNaAcao(")).toBeLessThan(rota.indexOf("createServiceClient("));
  });
});

describe("a rota da planilha não entrega planilha incompleta", () => {
  const rota = readFileSync(
    join(process.cwd(), "src", "app", "api", "painel", "fichas-do-corretor", "route.ts"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("pagina com desempate por id (importação em lote empata o created_at)", () => {
    expect(rota).toMatch(/\.order\("created_at"\)\s*\.order\("id"\)\s*\.range\(/);
  });

  it("erro ao ler os imóveis devolve 500 antes de registrar a entrega", () => {
    const leitura = rota.indexOf('.from("empreendimentos")');
    const erro = rota.search(/if \(erroImoveis\)[\s\S]{0,200}status|if \(erroImoveis\)[\s\S]{0,200}500/);
    const registro = rota.indexOf('.from("admin_eventos")');
    expect(leitura).toBeGreaterThan(0);
    expect(erro).toBeGreaterThan(leitura);
    expect(registro).toBeGreaterThan(erro);
  });
});
