import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TRATADORES } from "./executar";
import { FERRAMENTAS, ONDA_ATUAL, declaracoesPara, textoDaAjuda } from "./ferramentas";

describe("catálogo do número central", () => {
  it("as 33 capacidades da spec estão declaradas, cada uma com a sua onda", () => {
    const capacidades = new Set(FERRAMENTAS.map((f) => f.capacidade));
    expect([...capacidades].sort((a, b) => a - b)).toEqual(Array.from({ length: 33 }, (_, i) => i + 1));
    for (const f of FERRAMENTAS) expect([0, 1, 2, 3]).toContain(f.onda);
  });

  it("nomes únicos e no formato que a API aceita", () => {
    const nomes = FERRAMENTAS.map((f) => f.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
    for (const n of nomes) expect(n).toMatch(/^[a-z_]{3,64}$/);
  });

  it("o corretor não recebe as ferramentas do gestor", () => {
    const doCorretor = declaracoesPara("corretor").map((d) => d.nome);
    expect(doCorretor).not.toContain("relatorio_da_equipe");
    expect(doCorretor).not.toContain("lancar_no_caixa");
    expect(declaracoesPara("gestor").length).toBe(FERRAMENTAS.length);
  });

  // Os tratadores da onda 1 já entram em TRATADORES (`tratadores/index.ts`);
  // quem barra é a `onda` de cada ferramenta contra ONDA_ATUAL (`criarExecutor`).
  it(`na onda ${ONDA_ATUAL} nenhuma ação com tratador está ligada (nada grava no CRM)`, () => {
    for (const nome of Object.keys(TRATADORES.acoes)) {
      const f = FERRAMENTAS.find((x) => x.nome === nome);
      expect(f && f.onda > ONDA_ATUAL, `ação ${nome} ainda não pode estar ligada`).toBe(true);
    }
  });

  it("a ajuda mostra o que já funciona e o que vem depois", () => {
    expect(textoDaAjuda(0)).toMatch(/O que você sabe fazer/);
    expect(textoDaAjuda(0)).toMatch(/próximas semanas/);
  });

  it("o central não escreve em tabela do CRM", () => {
    // Recursivo: os tratadores das ondas (`tratadores/`) também. Ação da onda 1
    // grava pelas funções de domínio que já existem (cadastro, visita, ficha),
    // nunca direto nas tabelas do CRM daqui.
    const dir = "src/lib/central";
    const fontes = (readdirSync(dir, { recursive: true }) as string[]).filter(
      (a) => a.endsWith(".ts") && !a.endsWith(".test.ts") && !a.endsWith("bancoFalso.ts"),
    );
    const proibidas = /from\("(leads|visitas|whatsapp_conversas|whatsapp_mensagens|lead_tarefas|anotacoes|vendas)"\)[\s\S]{0,80}?\.(insert|update|upsert|delete)\(/;
    for (const a of fontes) expect(readFileSync(join(dir, a), "utf8"), a).not.toMatch(proibidas);
  });
});
