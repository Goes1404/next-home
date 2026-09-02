import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Navegação e filtro NÃO rolam de lado neste painel.
 *
 * A regra já foi decidida três vezes aqui, e voltou a se perder duas: a barra
 * de seleção em lote quebra linha (e tem teste), mas as abas, os chips de
 * segmento e as abas do editor de imóvel continuaram rolando. Medido em
 * 360px, com o CSS de produção: ficavam **117px de abas fora da tela** em
 * WhatsApp e **327px** em Administração — mais da metade dos destinos daquela
 * seção, atrás de um gesto que a fileira não anuncia.
 *
 * O custo de quebrar é 44px de altura no primeiro caso e 88px no segundo, uma
 * vez, no topo da tela. Alvo escondido atrás de um gesto invisível é quase
 * tão ruim quanto alvo cortado — e pior, porque parece que a lista acabou.
 *
 * TABELA é a exceção legítima: uma tabela larga não tem como quebrar linha
 * sem deixar de ser tabela, e ali a rolagem é esperada por quem usa. A lista
 * abaixo é declarada de propósito, para que acrescentar um caso exija
 * escrever por que — do mesmo jeito que `RESERVADOS` em `migrations.test.ts`.
 */

const TABELAS_LARGAS = [
  "(painel)/admin/leads/page.tsx",
  "(painel)/admin/precos/PrecosManager.tsx",
  "(painel)/admin/anuncios/page.tsx",
  "(painel)/importar/GmailLeadsExtractor.tsx",
  // Faixa de sugestões dentro da simulação de conversa: são atalhos de teste,
  // não navegação, e a caixa imita a janela do WhatsApp de propósito.
  "(painel)/whatsapp/_componentes/PlaygroundIA.tsx",
];

const RAIZ = path.join(process.cwd(), "src/app/corretor");

function arquivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return arquivos(p);
    return /\.tsx$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("navegação e filtro não rolam de lado", () => {
  const encontrados = arquivos(RAIZ).filter((arq) =>
    /overflow-x-(auto|scroll)/.test(semComentarios(fs.readFileSync(arq, "utf8"))),
  );

  it("acha os arquivos do painel", () => {
    expect(arquivos(RAIZ).length).toBeGreaterThan(20);
  });

  it("só tabela larga rola na horizontal", () => {
    const fora = encontrados
      .map((a) => path.relative(RAIZ, a))
      .filter((rel) => !TABELAS_LARGAS.includes(rel))
      .sort();
    expect(
      fora,
      "Estes contêineres rolam de lado. Se for navegação, chip ou filtro, use " +
        "`flex-wrap`: rolagem lateral esconde alvo sem avisar que ele existe. " +
        "Se for tabela larga, acrescente o arquivo a TABELAS_LARGAS com o motivo.",
    ).toEqual([]);
  });

  it("a lista de exceções não tem entrada morta", () => {
    // Exceção declarada que deixou de existir é comentário mentindo sobre o
    // código — o mesmo cuidado que `RESERVADOS` recebeu.
    const presentes = new Set(encontrados.map((a) => path.relative(RAIZ, a)));
    const orfas = TABELAS_LARGAS.filter((t) => !presentes.has(t));
    expect(orfas, "Estes arquivos não rolam mais; tire-os de TABELAS_LARGAS.").toEqual([]);
  });
});
