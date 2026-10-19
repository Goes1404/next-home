import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ehEmailDeAcesso, normalizarParaEmail } from "./credenciaisIniciais";

/*
 * Até a fase 2A (19/10/2026) este arquivo testava a FÁBRICA de credencial:
 * `emailInicial`, `candidatosDeEmail` e `senhaInicial` (`nome@nexthome.com`
 * com senha `nexthome` + 4 dígitos do WhatsApp). Esses testes saíram junto
 * com as funções — o corretor agora recebe convite no e-mail real e cria a
 * própria senha. O que impede a fábrica de voltar é a guarda
 * "nenhum arquivo cria e-mail @nexthome.com nem senha derivada", em
 * `src/app/corretor/(painel)/admin/convite.test.ts`.
 */

describe("reconhecer endereço de acesso", () => {
  it("reconhece o domínio de acesso", () => {
    expect(ehEmailDeAcesso("ramos" + "@" + "nexthome.com")).toBe(true);
    expect(ehEmailDeAcesso("  RAMOS" + "@" + "NEXTHOME.COM  ")).toBe(true);
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
 * O aviso da tela de Contas conta só corretor ATIVO sem login. Enquanto
 * existia o lote de acessos (até a fase 2A), a tela e a action tinham de
 * recortar a mesma população — o botão chegou a prometer 7 e criar 6. O lote
 * saiu (cada convite leva o e-mail real da pessoa, que só o gestor sabe);
 * fica a contagem da tela, e a garantia de que o lote não voltou.
 */
describe("o aviso de quem está sem acesso", () => {
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
      "O aviso voltou a contar corretor inativo: quem está desativado não tem " +
        "acesso porque não deve ter, e isso não é pendência.",
    ).toBe(true);
  });

  it("o lote de credenciais não voltou", () => {
    expect(action).not.toMatch(/criarAcessosQueFaltam/);
    expect(tela).not.toMatch(/criarAcessosQueFaltam|CartaoLote/);
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
