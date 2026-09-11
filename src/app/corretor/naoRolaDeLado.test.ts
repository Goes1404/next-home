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
 * A exceção legítima é o container em que a rolagem É O CONTEÚDO, não um
 * alvo escondido: uma tabela larga não tem como quebrar linha sem deixar de
 * ser tabela, e um quadro kanban não tem como ser kanban com as colunas
 * empilhadas. Nos dois casos quem usa espera rolar, e o próximo item fica
 * espiando na borda em vez de terminar exatamente na dobra. A lista abaixo é
 * declarada de propósito, para que acrescentar um caso exija escrever por que
 * — do mesmo jeito que `RESERVADOS` em `migrations.test.ts`.
 */

const ROLAGEM_DECLARADA = [
  "(painel)/admin/leads/page.tsx",
  "(painel)/admin/precos/PrecosManager.tsx",
  "(painel)/admin/anuncios/page.tsx",
  "(painel)/importar/GmailLeadsExtractor.tsx",
  // Faixa de sugestões dentro da simulação de conversa: são atalhos de teste,
  // não navegação, e a caixa imita a janela do WhatsApp de propósito.
  "(painel)/whatsapp/_componentes/PlaygroundIA.tsx",
  // Quadro do funil (09/09/2026): kanban de colunas laterais, por decisão do
  // usuário. Aqui a rolagem é o conteúdo, não navegação — a coluna mede 78vw
  // justamente para a próxima ficar espiando na borda e anunciar o gesto. As
  // etapas continuam alcançáveis sem rolar: a lista (`/corretor/leads?etapa=`)
  // e o seletor "Mover para" de cada cartão chegam às seis.
  "(painel)/funil/Quadro.tsx",
  // Faixa de fotos do imóvel no Estúdio (10/09/2026): a rolagem é o CONTEÚDO —
  // são as fotos entre as quais se escolhe a base da geração, não destinos. E
  // nenhuma delas é alcançável só por ali: o teto é de 8, todas aparecem na
  // tela do imóvel, e não escolher nenhuma é o comportamento padrão.
  "(painel)/imoveis/criar-imagem/ChatDeArte.tsx",
  // Miniaturas de fotos já escolhidas no composer: são conteúdo removível,
  // não destinos. No máximo quatro; quebrar linha roubaria a altura do campo
  // e a rolagem só aparece quando há mais de uma referência real.
  "(painel)/_componentes/ChatBase.tsx",
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

  it("só o que está declarado rola na horizontal", () => {
    const fora = encontrados
      .map((a) => path.relative(RAIZ, a).split(path.sep).join("/"))
      .filter((rel) => !ROLAGEM_DECLARADA.includes(rel))
      .sort();
    expect(
      fora,
      "Estes contêineres rolam de lado. Se for navegação, chip ou filtro, use " +
        "`flex-wrap`: rolagem lateral esconde alvo sem avisar que ele existe. " +
        "Se a rolagem for o CONTEÚDO (tabela larga, quadro kanban), acrescente o " +
        "arquivo a ROLAGEM_DECLARADA com o motivo.",
    ).toEqual([]);
  });

  it("a lista de exceções não tem entrada morta", () => {
    // Exceção declarada que deixou de existir é comentário mentindo sobre o
    // código — o mesmo cuidado que `RESERVADOS` recebeu.
    const presentes = new Set(encontrados.map((a) => path.relative(RAIZ, a).split(path.sep).join("/")));
    const orfas = ROLAGEM_DECLARADA.filter((t) => !presentes.has(t));
    expect(orfas, "Estes arquivos não rolam mais; tire-os de ROLAGEM_DECLARADA.").toEqual([]);
  });
});
