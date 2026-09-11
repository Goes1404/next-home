import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { faltaNaLista, garantirNaLista } from "./listaDeConversas";
import type { ConversaResumo } from "./ConversasClient";

const c = (id: string, quando: string): ConversaResumo => ({
  id,
  telefone: "5511999999999",
  nome: id,
  botAtivo: true,
  liberada: true,
  pausadoAte: null,
  memoria: null,
  memoriaDoCorretor: false,
  ultimaMensagem: "oi",
  ultimaInteracaoEm: quando,
  temLead: true,
  naoLidas: 0,
});

const LISTA = [c("a", "2026-09-10T12:00:00Z"), c("b", "2026-09-09T12:00:00Z")];

describe("faltaNaLista", () => {
  it("diz que falta quando o deep link aponta para fora da página", () => {
    /*
     * O defeito que isto existe para impedir: a lista carrega as 100
     * conversas mais recentes e existem 140. Tocar numa das 40 mais antigas
     * pela lista de Pessoas mandava `?c=<id>`, a conversa não estava na
     * lista, e no celular o painel é `hidden md:flex` — a tela simplesmente
     * NÃO MUDAVA. Falha calada: nem erro, nem tela vazia, nada.
     */
    expect(faltaNaLista(LISTA, "z")).toBe(true);
  });

  it("não falta quando já está na lista", () => {
    expect(faltaNaLista(LISTA, "b")).toBe(false);
  });

  it("sem deep link não falta nada — não gasta consulta à toa", () => {
    expect(faltaNaLista(LISTA, null)).toBe(false);
    expect(faltaNaLista(LISTA, "")).toBe(false);
  });
});

describe("garantirNaLista", () => {
  it("insere a conversa que faltava NA ORDEM, não no fim", () => {
    // A lista é ordenada por última interação; jogar no fim faria a conversa
    // aberta aparecer no lugar errado enquanto a pessoa a lê.
    const extra = c("meio", "2026-09-09T18:00:00Z");
    expect(garantirNaLista(LISTA, extra).map((x) => x.id)).toEqual(["a", "meio", "b"]);
  });

  it("a mais recente vai para o topo", () => {
    const extra = c("nova", "2026-09-11T12:00:00Z");
    expect(garantirNaLista(LISTA, extra).map((x) => x.id)).toEqual(["nova", "a", "b"]);
  });

  it("a mais antiga vai para o fim", () => {
    const extra = c("velha", "2026-01-01T12:00:00Z");
    expect(garantirNaLista(LISTA, extra).map((x) => x.id)).toEqual(["a", "b", "velha"]);
  });

  it("NÃO duplica quando a conversa já estava lá", () => {
    expect(garantirNaLista(LISTA, c("b", "2026-09-09T12:00:00Z")).map((x) => x.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("sem extra devolve a lista como está", () => {
    expect(garantirNaLista(LISTA, null)).toEqual(LISTA);
  });

  it("conversa sem data de interação não some — vai para o fim", () => {
    // `as unknown` porque o tipo diz `string`: o cast existe justamente para
    // provar que a ordenação não quebra se o banco devolver nulo um dia.
    const semData = { ...c("orfa", ""), ultimaInteracaoEm: null } as unknown as ConversaResumo;
    expect(garantirNaLista(LISTA, semData).map((x) => x.id)).toEqual(["a", "b", "orfa"]);
  });
});

/**
 * Guarda de código-fonte: a tela precisa CHAMAR o resgate.
 *
 * O módulo puro pode estar perfeito e a tela não usá-lo — foi exatamente
 * assim que o defeito existiu: `lerMensagens` sabia paginar, a lista sabia
 * ordenar, e ninguém buscava a conversa que faltava. A regressão falha
 * calada: no celular a tela só não muda.
 */
describe("a página de conversas resgata o deep link", () => {
  const fonte = readFileSync(
    join(process.cwd(), "src", "app", "corretor", "(painel)", "conversas", "page.tsx"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("pergunta se a conversa do `?c=` falta, e busca quando falta", () => {
    expect(fonte).toContain("faltaNaLista(");
    expect(fonte).toContain("garantirNaLista(");
  });

  it("manda para a tela a lista JÁ com o resgate, não a original", () => {
    // `conversas={lista}` é o bug: a busca aconteceria e o resultado seria
    // descartado — pior que não buscar, porque parece consertado.
    expect(fonte).toContain("conversas={listaFinal}");
    expect(fonte).not.toContain("conversas={lista}");
  });

  it("a busca de resgate filtra pelo corretor, não confia só na RLS", () => {
    // Segunda linha de defesa: a policy da 0031 abriu whatsapp_* para o
    // gestor, e consulta sem filtro passa a receber linha de outro dono.
    const resgate = fonte.slice(fonte.indexOf("faltaNaLista("));
    expect(resgate.slice(0, resgate.indexOf("maybeSingle"))).toContain("corretor_id");
  });
});
