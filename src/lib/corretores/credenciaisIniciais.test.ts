import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DOMINIO_ACESSO,
  ehEmailDeAcesso,
  emailInicial,
  senhaInicial,
} from "./credenciaisIniciais";

describe("e-mail de acesso", () => {
  it("sai do slug, que já é único no banco", () => {
    expect(emailInicial("graziele-santos")).toBe(`graziele-santos@${DOMINIO_ACESSO}`);
  });

  it("normaliza para minúsculas e apara espaço", () => {
    expect(emailInicial("  Miro-Araujo  ")).toBe(`miro-araujo@${DOMINIO_ACESSO}`);
  });

  it("passa na validação de formato da action", () => {
    // O mesmo regex de `criarAcessoCorretor`. Se o domínio perder o ponto, a
    // criação falharia para a equipe inteira, e só em produção.
    expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInicial("ramos"))).toBe(true);
  });

  it("lança sem slug, em vez de montar '@dominio'", () => {
    expect(() => emailInicial("")).toThrow();
    expect(() => emailInicial("   ")).toThrow();
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
