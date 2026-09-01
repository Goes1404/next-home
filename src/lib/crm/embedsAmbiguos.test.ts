import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda dos embeds ambíguos do PostgREST.
 *
 * ## O defeito, que já aconteceu DUAS vezes
 *
 * Quando existem duas chaves estrangeiras entre as mesmas tabelas, o
 * PostgREST se recusa a adivinhar qual usar e devolve `PGRST201` — a
 * consulta inteira falha, não o embed.
 *
 * 1. `corretor_destaques` (0015) criou um segundo caminho entre
 *    `empreendimentos` e `corretores`, e toda leitura de empreendimento
 *    passou a falhar: home, listagem, portfólio, página do imóvel.
 * 2. `leads.imovel_interesse_id` (0083) criou um segundo caminho entre
 *    `leads` e `empreendimentos`, e quebrou a lista de leads, o quadro do
 *    funil e a tela de leads da administração — provado contra a API real
 *    com a chave pública antes de corrigir.
 *
 * As duas vezes o build passou, os tipos passaram e os testes passaram: é
 * defeito de RUNTIME, e só aparece abrindo a tela ou batendo na API.
 *
 * Este teste lê o código-fonte e cobra a FK explícita em todo embed dessas
 * combinações. Mesma classe de `escalaDoPainel`, `viewsSeguras` e
 * `tabelasSeguras`: a regra não é sobre o resultado de uma função, é sobre
 * como a consulta foi escrita.
 */

const RAIZ = join(process.cwd(), "src");

/**
 * Só a consulta em `leads` é ambígua para `empreendimentos`.
 *
 * `midias(... empreendimentos(nome))` e `leads(... corretores(nome))` têm
 * UMA fk cada e estão certos. A primeira versão desta guarda cobrava a fk
 * em todo embed do nome e acusou os dois — régua que não sabe qual tabela
 * está sendo consultada acusa código correto, que é como este projeto já
 * perdeu tempo cinco vezes com critério que media outra coisa.
 */
const EMBUTIDA = "empreendimentos";

/** Colunas que só existem em `leads` — identificam o select mesmo fora de um `.from()`. */
const MARCAS_DE_LEADS = ["etapa", "visita_agendada_em", "tentativas_sem_resposta"];

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx)$/.test(nome) && !nome.endsWith(".test.ts") ? [caminho] : [];
  });
}

function semComentarios(caminho: string): string {
  return readFileSync(caminho, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Os textos de select do arquivo: o conteúdo de cada `.select(...)` e de
 * cada template literal com cara de select (o `SELECT_LEAD` é uma
 * constante solta, longe de qualquer `.from()`).
 */
function selectsDe(codigo: string): string[] {
  const deChamada = [...codigo.matchAll(/\.select\(\s*([`"'])([\s\S]*?)\1/g)].map((m) => m[2]);
  const deConstante = [...codigo.matchAll(/=\s*`([\s\S]*?)`/g)].map((m) => m[1]);
  return [...deChamada, ...deConstante];
}

describe("consulta em leads nomeia a FK ao embutir empreendimentos", () => {
  const todos = arquivos(RAIZ);

  it("encontra os arquivos (o teste não pode passar por estar vazio)", () => {
    expect(todos.length).toBeGreaterThan(50);
  });

  it("nenhum select de leads embute empreendimentos sem a chave", () => {
    const infratores: string[] = [];

    for (const caminho of todos) {
      for (const select of selectsDe(semComentarios(caminho))) {
        const ehDeLeads = MARCAS_DE_LEADS.some((c) => new RegExp(`\\b${c}\\b`).test(select));
        if (!ehDeLeads) continue;

        if (new RegExp(`(?<!!)\\b${EMBUTIDA}\\s*\\(`).test(select)) {
          infratores.push(caminho.slice(process.cwd().length + 1));
        }
      }
    }

    expect(
      [...new Set(infratores)],
      `Estes selects de "leads" embutem "${EMBUTIDA}" sem nomear a chave. ` +
        `Desde a 0083 há DUAS fks entre as tabelas (origem do lead e imóvel ` +
        `da conversa), então o PostgREST devolve PGRST201 e a consulta ` +
        `inteira falha em runtime — build, tipos e testes passam. ` +
        `Use "${EMBUTIDA}!leads_empreendimento_id_fkey(...)".`,
    ).toEqual([]);
  });
});
