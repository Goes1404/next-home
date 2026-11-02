// Gera o SQL que importa lojas prospectadas para `prospeccao_leads` (0253).
//
//   npx tsx scripts/prospeccao/sqlDasLojas.ts scripts/prospeccao/lojas-abordadas-2026-11-02.json > lojas.sql
//
// Só gera texto; quem aplica é a pessoa (SQL Editor ou MCP do Supabase), com
// `on conflict (slug) do nothing`: rodar de novo não duplica nem sobrescreve.
// A mensagem gravada é a padrão, com o link novo da amostra (rastreada).
import { readFileSync } from "node:fs";
import { linkDaAmostra, mensagemPadrao } from "../../src/lib/prospeccao/abordagem";

type Loja = Record<string, unknown> & { nome: string; slug: string; gancho?: string | null };

const COLUNAS = [
  "nome", "segmento", "modelo", "cidade", "bairro", "endereco", "telefone", "whatsapp", "instagram", "site",
  "nota_google", "avaliacoes", "horario", "lacunas", "gancho", "slug", "amostra", "mensagem", "etapa", "enviado_em", "origem", "rodada",
] as const;
const JSONB = new Set(["horario", "lacunas", "amostra"]);

function literal(coluna: string, valor: unknown): string {
  if (valor === null || valor === undefined) return "null";
  if (JSONB.has(coluna)) return `'${JSON.stringify(valor).replace(/'/g, "''")}'::jsonb`;
  if (typeof valor === "number") return String(valor);
  return `'${String(valor).replace(/'/g, "''")}'`;
}

const arquivo = process.argv[2];
if (!arquivo) throw new Error("Informe o arquivo JSON das lojas.");
const lojas = JSON.parse(readFileSync(arquivo, "utf8")) as Loja[];

const linhas = lojas.map((l) => {
  const comMensagem = { ...l, mensagem: mensagemPadrao({ nome: l.nome, gancho: l.gancho ?? null, link: linkDaAmostra(l.slug), vendedor: "Eduardo" }) };
  return `  (${COLUNAS.map((c) => literal(c, (comMensagem as Record<string, unknown>)[c])).join(", ")})`;
});

console.log(`insert into public.prospeccao_leads (${COLUNAS.join(", ")})\nvalues\n${linhas.join(",\n")}\non conflict (slug) do nothing;`);
