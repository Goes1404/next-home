import { describe, expect, it } from "vitest";
import {
  acharNoticias,
  assuntoDoRelatorio,
  corpoDoRelatorio,
  type NumerosDaSemana,
} from "./relatorioSemanal";

/** Uma semana saudável, para cada teste mexer só no que interessa. */
const BOA: NumerosDaSemana = {
  numeroNoAr: true,
  diasForaDoAr: null,
  conversasComFalaDoCliente: 20,
  conversasAtendidasPelaIa: 18,
  medianaSegundos: 9,
  visitasPropostas: 10,
  visitasMarcadas: 5,
  campanhaEntregues: 40,
  campanhaRespostas: 6,
  imoveisPublicados: 25,
  imoveisComCadastroIncompleto: 2,
  leadsNovosNaSemana: 12,
};

describe("acharNoticias", () => {
  it("semana boa não gera nenhum achado crítico", () => {
    expect(acharNoticias(BOA).some((a) => a.gravidade === "critico")).toBe(false);
  });

  /*
   * O incidente de 28/08: três dias fora do ar sem ninguém saber. É o topo
   * de tudo porque sem número no ar nada mais acontece.
   */
  it("número fora do ar é o primeiro achado, com os dias", () => {
    const achados = acharNoticias({ ...BOA, numeroNoAr: false, diasForaDoAr: 3 });
    expect(achados[0].gravidade).toBe("critico");
    expect(achados[0].titulo).toContain("3 dias");
  });

  it("cobertura abaixo da metade é crítica", () => {
    const achados = acharNoticias({
      ...BOA,
      conversasComFalaDoCliente: 56,
      conversasAtendidasPelaIa: 12,
    });
    const cobertura = achados.find((a) => a.titulo.includes("respondeu"));
    expect(cobertura?.gravidade).toBe("critico");
    expect(cobertura?.titulo).toContain("21%");
  });

  /*
   * Com pouca conversa, uma porcentagem é ruído: 1 de 2 vira "50%" e não
   * significa nada. O piso evita relatório alarmista sobre amostra de dois.
   */
  it("não calcula cobertura com amostra pequena demais", () => {
    const achados = acharNoticias({
      ...BOA,
      conversasComFalaDoCliente: 3,
      conversasAtendidasPelaIa: 1,
    });
    expect(achados.some((a) => a.titulo.includes("respondeu"))).toBe(false);
  });

  it("campanha que entrega muito e converte quase nada vira aviso", () => {
    const achados = acharNoticias({ ...BOA, campanhaEntregues: 88, campanhaRespostas: 1 });
    const campanha = achados.find((a) => a.titulo.includes("disparos"));
    expect(campanha?.gravidade).toBe("atencao");
    expect(campanha?.detalhe).toContain("mensagem de abertura");
  });

  /*
   * Tempo de resposta bom NÃO vira linha: repetir "9 segundos" toda semana
   * é o que transforma relatório em paisagem. Só entra quando está ruim.
   */
  it("tempo de resposta só aparece quando está ruim", () => {
    expect(acharNoticias(BOA).some((a) => a.titulo.includes("primeira resposta"))).toBe(false);
    expect(
      acharNoticias({ ...BOA, medianaSegundos: 240 }).some((a) =>
        a.titulo.includes("primeira resposta"),
      ),
    ).toBe(true);
  });

  it("ordena do pior para o melhor", () => {
    const achados = acharNoticias({
      ...BOA,
      numeroNoAr: false,
      diasForaDoAr: 2,
      campanhaEntregues: 88,
      campanhaRespostas: 1,
    });
    expect(achados.map((a) => a.gravidade)).toEqual(
      [...achados.map((a) => a.gravidade)].sort(
        (x, y) => ({ critico: 0, atencao: 1, ok: 2 })[x] - ({ critico: 0, atencao: 1, ok: 2 })[y],
      ),
    );
  });
});

describe("assuntoDoRelatorio", () => {
  /*
   * Assunto genérico é o que faz o relatório não ser aberto — e relatório
   * não aberto é igual a relatório que não existe.
   */
  it("o assunto é o PIOR achado, não 'relatório semanal'", () => {
    const achados = acharNoticias({ ...BOA, numeroNoAr: false, diasForaDoAr: 3 });
    expect(assuntoDoRelatorio(achados)).toContain("fora do ar");
    expect(assuntoDoRelatorio(achados)).not.toContain("Relatório semanal");
  });

  it("semana sem problema tem assunto próprio", () => {
    expect(assuntoDoRelatorio(acharNoticias(BOA))).toContain("correu bem");
  });
});

describe("corpoDoRelatorio", () => {
  it("manda texto puro e HTML, e o link do painel nos dois", () => {
    const { texto, html } = corpoDoRelatorio({
      achados: acharNoticias(BOA),
      numeros: BOA,
      urlPainel: "https://exemplo.com/",
    });
    expect(texto).toContain("https://exemplo.com/corretor/admin");
    expect(html).toContain("https://exemplo.com/corretor/admin");
    expect(texto).toContain("Leads novos na semana: 12");
  });
});

describe("concordância — relatório com erro de português perde autoridade", () => {
  it("uma visita marcada é 'marcada', não 'marcadas'", () => {
    const achados = acharNoticias({ ...BOA, visitasPropostas: 6, visitasMarcadas: 1 });
    const visita = achados.find((a) => a.titulo.includes("oferecidas"));
    expect(visita?.titulo).toBe("6 visitas oferecidas, 1 marcada");
  });

  it("uma resposta de campanha é 'resposta'", () => {
    const achados = acharNoticias({ ...BOA, campanhaEntregues: 88, campanhaRespostas: 1 });
    expect(achados.find((a) => a.titulo.includes("disparos"))?.titulo).toContain("1 resposta (1%)");
  });

  it("um dia fora do ar é 'dia'", () => {
    const achados = acharNoticias({ ...BOA, numeroNoAr: false, diasForaDoAr: 1 });
    expect(achados[0].titulo).toContain("há 1 dia");
    expect(achados[0].titulo).not.toContain("1 dias");
  });
});
