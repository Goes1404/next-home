/*
 * Login sem cadastro de corretor (29/10/2026): o painel mostra "Conta ainda
 * não vinculada" no lugar das telas, e o menu da conta (onde mora o "Sair")
 * só existe com corretor. Sem um "Sair" no próprio cartão, a pessoa ficava
 * presa na tela, sem como entrar com outro login.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("conta sem vínculo", () => {
  it("o cartão tem o botão de sair", () => {
    const codigo = readFileSync("src/app/corretor/(painel)/layout.tsx", "utf8");
    const cartao = codigo.slice(codigo.indexOf("function ContaSemVinculo("));
    expect(cartao).toMatch(/<form action=\{sair\}/);
  });

  it("administrador da plataforma sem corretor vai para /plataforma, não para o cartão", () => {
    const codigo = readFileSync("src/app/corretor/(painel)/layout.tsx", "utf8");
    expect(codigo).toMatch(
      /if \(!corretor\) \{[\s\S]{0,200}rpc\("eh_admin_da_plataforma"\)[\s\S]{0,80}redirect\("\/plataforma"\)/,
    );
  });
});
