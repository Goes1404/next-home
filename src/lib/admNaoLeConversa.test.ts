import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O ADM não lê a conversa de outro corretor (0134, 30/09/2026).
 *
 * A regressão seria calada: bastaria uma migration nova recriar uma policy
 * com `eh_gestor()` em `whatsapp_mensagens` para o ADM voltar a ler o
 * WhatsApp pessoal de todo mundo, com build, tipos e telas verdes. Esta
 * guarda repassa as migrations em ordem, guarda a ÚLTIMA versão de cada
 * policy e reprova qualquer uma que ainda dê a mesa ao gestor.
 */

const PASTA = join(process.cwd(), "supabase", "migrations");

const TABELAS_DO_DONO = [
  "whatsapp_conversas",
  "whatsapp_mensagens",
  "ia_interacoes",
  "ia_correcoes",
  "corretor_whatsapp_instancias",
];

function semComentario(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

/** Policies vivas ao fim de todas as migrations: tabela → nome → corpo. */
export function policiesFinais(): Map<string, Map<string, string>> {
  const vivas = new Map<string, Map<string, string>>();
  const arquivos = readdirSync(PASTA)
    .filter((a) => a.endsWith(".sql"))
    .sort();
  const criar = /create\s+policy\s+"([^"]+)"\s+on\s+(?:public\.)?(\w+)([\s\S]*?);/gi;
  const derrubar = /drop\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"\s+on\s+(?:public\.)?(\w+)/gi;

  for (const arquivo of arquivos) {
    const sql = semComentario(readFileSync(join(PASTA, arquivo), "utf8"));
    // Ordem do arquivo: junta criações e remoções pela posição.
    const eventos: { pos: number; tipo: "criar" | "derrubar"; nome: string; tabela: string; corpo?: string }[] = [];
    for (const m of sql.matchAll(criar)) {
      eventos.push({ pos: m.index ?? 0, tipo: "criar", nome: m[1], tabela: m[2], corpo: m[3] });
    }
    for (const m of sql.matchAll(derrubar)) {
      eventos.push({ pos: m.index ?? 0, tipo: "derrubar", nome: m[1], tabela: m[2] });
    }
    eventos.sort((a, b) => a.pos - b.pos);
    for (const e of eventos) {
      const tabela = vivas.get(e.tabela) ?? new Map<string, string>();
      if (e.tipo === "criar") tabela.set(e.nome, e.corpo ?? "");
      else tabela.delete(e.nome);
      vivas.set(e.tabela, tabela);
    }
  }
  return vivas;
}

const DA_MESA_AO_GESTOR = /eh_gestor\s*\(|papel\s*=\s*'gestor'/i;

describe("o ADM não lê a conversa de outro corretor", () => {
  const vivas = policiesFinais();

  it.each(TABELAS_DO_DONO)("%s: nenhuma policy viva abre para o gestor", (tabela) => {
    const policies = vivas.get(tabela);
    expect(policies && policies.size, `nenhuma policy encontrada em ${tabela}`).toBeGreaterThan(0);
    for (const [nome, corpo] of policies!) {
      expect(DA_MESA_AO_GESTOR.test(corpo), `policy "${nome}" em ${tabela} ainda abre para o gestor`).toBe(false);
    }
  });

  it("excluir lead é só do ADM", () => {
    const deletes = [...(vivas.get("leads") ?? new Map()).entries()].filter(([, corpo]) =>
      /for\s+delete/i.test(corpo),
    );
    expect(deletes.length).toBe(1);
    const [, corpo] = deletes[0];
    expect(corpo).toMatch(/eh_gestor\s*\(/);
    expect(corpo).not.toMatch(/corretor_atual/);
  });
});

/**
 * Quem conta pela chave de serviço (`clienteParaNumerosDaEquipe`) passa por
 * cima da RLS. Esses arquivos só podem pedir id, data e contagem das
 * tabelas de conversa: nenhuma coluna que carrega texto de alguém.
 */
const COLUNAS_COM_TEXTO =
  /\b(conteudo|ultima_mensagem|memoria|memoria_do_corretor|contexto|fala_cliente|resposta_ia|resposta_certa|previa|tom_voz|nome_cliente|telefone_cliente|transcricao)\b/;

function arquivosTs(pasta: string): string[] {
  const saida: string[] = [];
  for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) saida.push(...arquivosTs(caminho));
    else if (/\.tsx?$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) saida.push(caminho);
  }
  return saida;
}

describe("contagem da equipe não carrega texto", () => {
  const usuarios = arquivosTs(join(process.cwd(), "src")).filter((f) => {
    const s = readFileSync(f, "utf8");
    return s.includes("clienteParaNumerosDaEquipe(") && !f.endsWith("numerosDaEquipe.ts");
  });

  it("há quem use (senão a guarda não guarda nada)", () => {
    expect(usuarios.length).toBeGreaterThanOrEqual(4);
  });

  it.each(usuarios.map((f) => [f.slice(process.cwd().length + 1), f]))("%s", (_rotulo, arquivo) => {
    const codigo = semComentario(readFileSync(arquivo, "utf8"));
    const tabelas = /\.from\("(whatsapp_[a-z_]+|ia_[a-z_]+|corretor_whatsapp_instancias|pessoas_do_corretor)"\)\s*\.select\(\s*"([^"]*)"/g;
    for (const m of codigo.matchAll(tabelas)) {
      expect(COLUNAS_COM_TEXTO.test(m[2]), `${m[1]} lê "${m[2]}"`).toBe(false);
    }
  });
});
