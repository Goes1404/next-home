import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fraseDoDesfecho,
  fraseDoRestante,
  frasesDaDivisao,
  passoDepoisDaDivisao,
  precisaDoPainelDeSaida,
  traduzirErroDaSaida,
} from "./saidaDoCorretor";

describe("textos da saída do corretor", () => {
  it("conta os dois lados com concordância", () => {
    expect(frasesDaDivisao("Ana", { doCorretor: 1, daImobiliaria: 3 })).toEqual({
      daCasa: "3 leads vieram da imobiliária e ficam com ela.",
      dele: "1 lead foi trazido por Ana. Ele leva só a ficha (sem as conversas).",
    });
    expect(frasesDaDivisao("Ana", { doCorretor: 0, daImobiliaria: 1 })).toEqual({
      daCasa: "1 lead veio da imobiliária e fica com ela.",
      dele: "Ana não trouxe nenhum lead por conta própria.",
    });
  });

  it("traduz os erros da função do banco", () => {
    expect(traduzirErroDaSaida("destino_invalido")).toMatch(/corretor ativo/);
    expect(traduzirErroDaSaida("sem_permissao")).toMatch(/administra/);
    expect(traduzirErroDaSaida("Could not find the function public.devolver_leads_da_imobiliaria")).toMatch(/0200/);
    expect(traduzirErroDaSaida("timeout")).toMatch(/Tente de novo/);
  });

  it("diz quem ficou sem destino", () => {
    expect(fraseDoDesfecho(4, 0)).toBe("4 leads passaram para a equipe.");
    expect(fraseDoDesfecho(1, 1)).toBe(
      "1 lead passou para a equipe. 1 lead ficou sem destino: não há corretor ativo que atenda a região.",
    );
  });
});

describe("a divisão antes de desativar", () => {
  it("abre o painel por qualquer lead, inclusive só arquivados (a contagem da saída os inclui)", () => {
    expect(precisaDoPainelDeSaida({ doCorretor: 0, daImobiliaria: 0 })).toBe(false);
    expect(precisaDoPainelDeSaida({ doCorretor: 0, daImobiliaria: 2 })).toBe(true);
    expect(precisaDoPainelDeSaida({ doCorretor: 1, daImobiliaria: 0 })).toBe(true);
  });

  it("lead da imobiliária sem destino segura a desativação", () => {
    expect(passoDepoisDaDivisao(2, false)).toBe("escolher_restante");
    expect(passoDepoisDaDivisao(1, true)).toBe("escolher_restante");
    expect(passoDepoisDaDivisao(0, false)).toBe("desativar");
    expect(passoDepoisDaDivisao(0, true)).toBe("pronto");
    expect(fraseDoRestante("Ana", 2)).toMatch(/2 leads da imobiliária ficaram com Ana.*Escolha um corretor/);
  });
});

describe("a tela da saída", () => {
  const ler = (p: string) =>
    readFileSync(join(process.cwd(), p), "utf8")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  const contas = ler("src/app/corretor/(painel)/admin/contas/ContasManager.tsx");
  const saida = ler("src/app/corretor/(painel)/admin/contas/SaidaDoCorretor.tsx");

  it("decide pela contagem da saída, não pela da lista (que não vê arquivados)", () => {
    expect(contas).not.toMatch(/corretor\.leads\s*>\s*0/);
    expect(contas).toMatch(/precisaDoPainelDeSaida\(/);
  });

  it("quem já saiu ainda tem o caminho das fichas e dos leads da imobiliária", () => {
    expect(contas).toMatch(/jaDesativado/);
    expect(contas).toMatch(/!corretor\.ativo\s*&&[\s\S]{0,400}abrirSaida/);
  });

  it("só desativa depois de saber que nenhum lead da imobiliária ficou sem destino", () => {
    const passo = saida.indexOf("passoDepoisDaDivisao(");
    const desativa = saida.indexOf("alternarAtivoCorretor(");
    expect(passo).toBeGreaterThan(0);
    expect(desativa).toBeGreaterThan(passo);
  });
});
