import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Todo botão e link do painel mostra que é clicável EM REPOUSO (09/10/2026).
 *
 * Relatado: "temos botões que os usuários não sabem que são botões". Eram
 * ~200 controles só com texto colorido ou só ícone, cuja única pista era a
 * cor mudar no hover — que não existe no celular. A régua: fundo, borda,
 * sublinhado ou seta, sempre visíveis (`botao-secundario`, `botao-icone`,
 * `link-acao`, `linha-abre` no globals.css, ou `bg-*`/`border` próprios).
 *
 * Lê só `className` escrito como texto direto; classe montada por variável
 * ou condição fica de fora (a pista costuma estar na variável). As exceções
 * estão declaradas com o motivo, e o número de cada arquivo só pode descer.
 */
const PAINEL = join(process.cwd(), "src/app/corretor/(painel)");

const TOLERADOS: Record<string, { n: number; motivo: string }> = {
  "GavetaLateral.tsx": { n: 4, motivo: "itens de menu: a própria gaveta é a pista" },
  "NavPainel.tsx": { n: 2, motivo: "itens de menu e o botão de recolher, na lateral" },
  "BalaoConsultor.tsx": { n: 1, motivo: "o mascote é o botão" },
  "layout.tsx": { n: 2, motivo: "logotipo e pular para o conteúdo" },
  "_componentes/Avisos.tsx": { n: 1, motivo: "fechar o aviso, dentro do próprio aviso" },
  "_componentes/FunilVisual.tsx": { n: 1, motivo: "texto auxiliar abaixo do funil, que já é clicável" },
  "_componentes/graficos/QuemEstaEsperando.tsx": { n: 1, motivo: "linha com seta → própria" },
  "anotacoes/AnotacoesClient.tsx": { n: 1, motivo: "sugestão de lead dentro de lista aberta" },
  "conversas/Chat.tsx": { n: 6, motivo: "faixa da memória, atalhos com ícone em moldura, selo da avaliação, lista do seletor" },
  "financeiro/FormularioVenda.tsx": { n: 1, motivo: "sugestão dentro de lista aberta" },
  "funil/Quadro.tsx": { n: 1, motivo: "alça de arrastar" },
  "imoveis/ordem/OrdemNoSite.tsx": { n: 1, motivo: "alça de arrastar" },
  "leads/TabelaLeads.tsx": { n: 1, motivo: "linha que expande (o conteúdo aparece embaixo)" },
  "leads/[id]/VendaDoLead.tsx": { n: 1, motivo: "linha com seta → própria" },
  "marketing/OficinaDeMarketing.tsx": { n: 1, motivo: "miniatura da arte com borda" },
  "pessoas/ListaPessoas.tsx": { n: 1, motivo: "ícone verde do WhatsApp na ponta da linha" },
};

const ESTADO = /^(hover|focus|focus-visible|group-hover|active|disabled|enabled|aria-[\w-]+|data-[\w[\]=-]+|md|sm|lg|xl|dark|motion-safe|motion-reduce):/;
function temPista(classes: string): boolean {
  return classes
    .split(/\s+/)
    .filter((t) => t && !ESTADO.test(t))
    .some(
      (t) =>
        /^(bg-(?!transparent)|border(-|$)|underline$|shadow|ring-|cartao|botao-|link-acao|link-nav|linha-abre)/.test(t) &&
        !/^border-(0|none|transparent)$/.test(t),
    );
}

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) arquivos(p, saida);
    else if (p.endsWith(".tsx")) saida.push(p);
  }
  return saida;
}

function semPista(caminho: string): number {
  const fonte = readFileSync(caminho, "utf8");
  const sf = ts.createSourceFile(caminho, fonte, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let n = 0;
  const visitar = (no: ts.Node) => {
    if ((ts.isJsxOpeningElement(no) || ts.isJsxSelfClosingElement(no)) && ["button", "Link", "a"].includes(no.tagName.getText(sf))) {
      for (const a of no.attributes.properties) {
        if (ts.isJsxAttribute(a) && a.name.getText(sf) === "className" && a.initializer && ts.isStringLiteral(a.initializer)) {
          const c = a.initializer.text;
          if (!temPista(c) && !/sr-only|so-para-leitor/.test(c)) n++;
        }
      }
    }
    ts.forEachChild(no, visitar);
  };
  visitar(sf);
  return n;
}

describe("botões e links do painel mostram que são clicáveis", () => {
  const contagem = Object.fromEntries(
    arquivos(PAINEL)
      .map((p) => [relative(PAINEL, p), semPista(p)] as const)
      .filter(([, n]) => n > 0),
  );

  it("nenhum arquivo passa do número declarado", () => {
    const acima = Object.entries(contagem)
      .filter(([arq, n]) => n > (TOLERADOS[arq]?.n ?? 0))
      .map(([arq, n]) => `${arq}: ${n} sem pista (tolerado ${TOLERADOS[arq]?.n ?? 0})`);
    expect(acima).toEqual([]);
  });

  it("exceção que ficou obsoleta é apagada", () => {
    const sobra = Object.entries(TOLERADOS)
      .filter(([arq, t]) => (contagem[arq] ?? 0) < t.n)
      .map(([arq, t]) => `${arq}: declarado ${t.n}, existem ${contagem[arq] ?? 0}`);
    expect(sobra).toEqual([]);
  });

  it("reconhece a pista e a falta dela", () => {
    expect(temPista("text-acento hover:underline")).toBe(false);
    expect(temPista("text-acento link-acao")).toBe(true);
    expect(temPista("text-apoio hover:bg-vidro")).toBe(false);
    expect(temPista("border-linha-forte border px-3")).toBe(true);
  });
});
