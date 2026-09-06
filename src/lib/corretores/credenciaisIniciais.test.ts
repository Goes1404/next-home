import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  candidatosDeEmail,
  DOMINIO_ACESSO,
  ehEmailDeAcesso,
  emailInicial,
  normalizarParaEmail,
  senhaInicial,
} from "./credenciaisIniciais";

describe("e-mail de acesso", () => {
  it("monta a partir da parte local escolhida", () => {
    expect(emailInicial("graziele")).toBe(`graziele@${DOMINIO_ACESSO}`);
  });

  it("normaliza para minúsculas e apara espaço", () => {
    expect(emailInicial("  Miro  ")).toBe(`miro@${DOMINIO_ACESSO}`);
  });

  it("passa na validação de formato da action", () => {
    // O mesmo regex de `criarAcessoCorretor`. Se o domínio perder o ponto, a
    // criação falharia para a equipe inteira, e só em produção.
    expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInicial("ramos"))).toBe(true);
  });

  it("lança com parte local vazia, em vez de montar '@dominio'", () => {
    expect(() => emailInicial("")).toThrow();
    expect(() => emailInicial("   ")).toThrow();
  });
});

describe("candidatos de e-mail", () => {
  it("o primeiro é só o primeiro nome", () => {
    expect(candidatosDeEmail("Carolini Ivina Maia", "carolini-ivina-maia")[0]).toBe("carolini");
    expect(candidatosDeEmail("Renan Azael", "renan-azael")[0]).toBe("renan");
  });

  it("degrada do mais curto para o mais específico", () => {
    expect(candidatosDeEmail("Carolini Ivina Maia", "carolini-ivina-maia")).toEqual([
      "carolini",
      "carolini-ivina",
      "carolini-ivina-maia",
    ]);
  });

  it("não repete quando o nome é uma palavra só", () => {
    // "Ramos" geraria os três candidatos iguais; sem o dedupe, o laço de
    // escolha tentaria o mesmo endereço três vezes e nunca acharia um livre.
    expect(candidatosDeEmail("Ramos", "ramos")).toEqual(["ramos"]);
  });

  it("tira acento e pontuação do nome", () => {
    expect(candidatosDeEmail("Antônio JOSÉ", "antonio-jose")[0]).toBe("antonio");
    expect(candidatosDeEmail("Cristal - Bruna", "cristal-bruna")[0]).toBe("cristal");
  });

  it("o último candidato é sempre o slug, que é UNIQUE no banco", () => {
    const c = candidatosDeEmail("Eduardo Cezar", "eduardo-cezar");
    expect(c[c.length - 1]).toBe("eduardo-cezar");
  });

  it("cada candidato produz um e-mail válido", () => {
    for (const local of candidatosDeEmail("Graziele Santos", "graziele-santos")) {
      expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInicial(local))).toBe(true);
    }
  });
});

describe("senha inicial", () => {
  it("é o prefixo mais os 4 últimos dígitos", () => {
    expect(senhaInicial("5511975594931")).toBe("nexthome4931");
  });

  it("ignora a pontuação do número digitado à mão", () => {
    expect(senhaInicial("+55 (11) 99024-4407")).toBe("nexthome4407");
  });

  it("tem pelo menos 8 caracteres", () => {
    /*
     * Os 4 dígitos sozinhos seriam recusados pelo Auth (mínimo 6) e não
     * passariam na troca de senha do painel (mínimo 8). O prefixo existe
     * para isso; se alguém encurtá-lo, o lote inteiro falha em produção.
     */
    expect(senhaInicial("5511963310790").length).toBeGreaterThanOrEqual(8);
  });

  it("lança quando não há dígitos suficientes", () => {
    // Falhar aqui é melhor que falhar no meio do lote, com parte criada.
    expect(() => senhaInicial("123")).toThrow();
    expect(() => senhaInicial("")).toThrow();
  });
});

describe("reconhecer endereço de acesso", () => {
  it("reconhece o domínio de acesso", () => {
    expect(ehEmailDeAcesso(`ramos@${DOMINIO_ACESSO}`)).toBe(true);
    expect(ehEmailDeAcesso(`  RAMOS@${DOMINIO_ACESSO.toUpperCase()}  `)).toBe(true);
  });

  it("não confunde com e-mail de verdade", () => {
    expect(ehEmailDeAcesso("alguem@gmail.com")).toBe(false);
    // Sufixo parecido não conta: o casamento é do domínio inteiro.
    expect(ehEmailDeAcesso("alguem@naoehnexthome.com")).toBe(false);
  });
});

/*
 * `email.ts` é `server-only` e não dá para importar aqui, então a guarda lê o
 * código-fonte — mesma classe de `escalaDoPainel` e `receitas`.
 *
 * A regressão falharia CALADA e é a pior deste conjunto: `nexthome.com` é
 * domínio de TERCEIRO (resolve para 72.20.123.54). Sem a recusa, no dia em
 * que alguém religar os crons de e-mail, o aviso de queda do número e o
 * relatório semanal do gestor sairiam para um estranho — com contagem de
 * lead e retrato da operação dentro. Nada na tela indicaria isso.
 */
describe("e-mail nunca sai para um endereço de acesso", () => {
  const fonte = readFileSync(join(process.cwd(), "src", "lib", "email.ts"), "utf8");

  it("enviarEmail consulta ehEmailDeAcesso", () => {
    expect(
      fonte.includes("ehEmailDeAcesso"),
      "A recusa do domínio de acesso sumiu de email.ts. O domínio é de terceiro: " +
        "sem ela, o aviso de queda e o relatório semanal vão para um estranho.",
    ).toBe(true);
  });

  it("a recusa acontece ANTES do fetch para o provedor", () => {
    const guarda = fonte.indexOf("ehEmailDeAcesso(email.para)");
    const envio = fonte.indexOf("ENDERECO_API, {");
    expect(guarda, "A checagem não é feita sobre o destinatário.").toBeGreaterThan(-1);
    expect(
      guarda < envio,
      "A recusa passou para depois do envio — o e-mail já teria saído.",
    ).toBe(true);
  });
});

/*
 * O aviso da tela de Contas e a action do lote recortam a MESMA população.
 * Enquanto contavam diferente, o botão prometia 7 e criava 6 — e a diferença
 * só apareceria depois do clique, sem erro nenhum, porque quem sobrou é
 * exatamente quem está desativado de propósito.
 */
describe("o botão promete o mesmo número que cria", () => {
  const tela = readFileSync(
    join(process.cwd(), "src", "app", "corretor", "(painel)", "admin", "contas", "ContasManager.tsx"),
    "utf8",
  );
  const action = readFileSync(
    join(process.cwd(), "src", "app", "corretor", "(painel)", "admin", "acoes.ts"),
    "utf8",
  );

  it("a tela conta só corretor ativo sem login", () => {
    expect(
      /const semAcesso = corretores\.filter\(\(c\) => c\.ativo && !c\.temLogin\)/.test(tela),
      "O aviso voltou a contar corretor inativo. Ele promete um número que o " +
        "lote não cria, e a diferença não aparece como erro.",
    ).toBe(true);
  });

  it("a action recorta pela mesma condição", () => {
    const lote = action.slice(action.indexOf("export async function criarAcessosQueFaltam"));
    expect(lote.includes('.eq("ativo", true)')).toBe(true);
    expect(lote.includes('.is("user_id", null)')).toBe(true);
  });
});

/*
 * O slug e o e-mail de acesso saem do MESMO nome. Enquanto `acoes.ts` tinha
 * a própria cópia da normalização, bastava alguém mexer numa para o corretor
 * "Antônio" receber slug `antonio` e e-mail `antnio` — e a divergência só
 * apareceria no primeiro nome com acento a entrar na equipe.
 */
describe("uma normalização só para slug e e-mail", () => {
  const action = readFileSync(
    join(process.cwd(), "src", "app", "corretor", "(painel)", "admin", "acoes.ts"),
    "utf8",
  );

  it("slugificar delega para normalizarParaEmail", () => {
    const corpo = action.slice(
      action.indexOf("function slugificar"),
      action.indexOf("async function slugDisponivel"),
    );
    expect(
      corpo.includes("normalizarParaEmail"),
      "`slugificar` voltou a ter cópia própria da normalização. Slug e e-mail " +
        "passam a discordar em nome com acento, e só no primeiro que entrar.",
    ).toBe(true);
    expect(
      corpo.includes("normalize(\"NFD\")"),
      "A cópia da regra voltou para dentro de `slugificar`.",
    ).toBe(false);
  });

  it("a normalização compartilhada produz o slug esperado", () => {
    expect(normalizarParaEmail("Carolini Ivina Maia")).toBe("carolini-ivina-maia");
    expect(normalizarParaEmail("Cristal - Bruna")).toBe("cristal-bruna");
    expect(normalizarParaEmail("Antônio José")).toBe("antonio-jose");
  });
});
