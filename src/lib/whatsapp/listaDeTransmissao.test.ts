import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  aplicarContexto,
  classificarFalhaDeEnvio,
  contextoDaLista,
  dormitoriosEmPalavras,
  falhaContaParaDisjuntor,
  motivoParaNaoEnviar,
  previsaoDeTermino,
  resolverHorarios,
  retornoDasListas,
  variaveisSemValor,
} from "./listaDeTransmissao";
import { aplicarTemplate } from "./campaignQueue";
import { precoAPartirDe } from "@/lib/format";

const raiz = path.join(__dirname, "..", "..", "..");
const ler = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8");

const lead = (extra: Partial<NonNullable<Parameters<typeof motivoParaNaoEnviar>[0]>> = {}) => ({
  nao_contatar_em: null,
  arquivado_em: null,
  etapa: "primeiro_contato",
  corretor_id: "c1",
  ...extra,
});
const campanha = { corretor_id: "c1", criterio: { filtro: "parados_15d" } };

describe("conferência antes de cada envio (Fase 0)", () => {
  it("deixa passar o lead que continua igual", () => {
    expect(motivoParaNaoEnviar(lead(), campanha)).toBeNull();
  });

  it("barra quem pediu para sair, arquivado, perdido, transferido e excluído", () => {
    expect(motivoParaNaoEnviar(lead({ nao_contatar_em: "2026-10-03" }), campanha)).toMatch(/não receber/);
    expect(motivoParaNaoEnviar(lead({ arquivado_em: "2026-10-03" }), campanha)).toMatch(/arquivado/);
    expect(motivoParaNaoEnviar(lead({ etapa: "perdido" }), campanha)).toMatch(/perdido/);
    expect(motivoParaNaoEnviar(lead({ corretor_id: "c2" }), campanha)).toMatch(/outro corretor/);
    expect(motivoParaNaoEnviar(null, campanha)).toMatch(/excluído/);
  });

  it("quem comprou só recebe a lista de compradores", () => {
    expect(motivoParaNaoEnviar(lead({ etapa: "fechado" }), campanha)).toMatch(/comprou/);
    expect(
      motivoParaNaoEnviar(lead({ etapa: "fechado" }), { corretor_id: "c1", criterio: { filtro: "compradores" } }),
    ).toBeNull();
  });
});

describe("falhas de envio (Fase 0)", () => {
  it("número sem WhatsApp e telefone inválido não contam para o bloqueio", () => {
    expect(classificarFalhaDeEnvio({ motivo: "erro_provedor", detalhe: 'HTTP 400: {"exists": false}' })).toBe("inexistente");
    expect(classificarFalhaDeEnvio({ motivo: "dados_invalidos" })).toBe("dados");
    expect(falhaContaParaDisjuntor("inexistente")).toBe(false);
    expect(falhaContaParaDisjuntor("dados")).toBe(false);
  });

  it("tempo esgotado e 2xx sem comprovante são incertos: não tentam de novo", () => {
    expect(classificarFalhaDeEnvio({ motivo: "erro_provedor", detalhe: "This operation was aborted" })).toBe("incerto");
    expect(classificarFalhaDeEnvio({ motivo: "sem_confirmacao" })).toBe("incerto");
    expect(classificarFalhaDeEnvio({ motivo: "erro_provedor", detalhe: "HTTP 500" })).toBe("provedor");
  });
});

describe("variáveis da mensagem (Fase 2)", () => {
  const imovel = {
    nome: "Dom Parque",
    bairro: "Jardim Tupanci",
    cidade: "Barueri",
    precoAPartir: 480000,
    tipologias: [{ dormitorios: 2 }, { dormitorios: 3 }, { dormitorios: 3 }],
  } as Parameters<typeof contextoDaLista>[0]["imovel"];
  const ctx = contextoDaLista({ imovel, linkDoImovel: "https://x/empreendimentos/dom", corretorNome: "Bruna Cristal" });

  it("resolve imóvel, bairro, preço, dormitórios, link e corretor", () => {
    const texto = aplicarContexto("{imovel} em {bairro}, {a_partir_de}, {dormitorios}. {link} — {corretor}", ctx);
    // `Intl` separa "R$" do número com espaço que não quebra: o teste
    // compara contra o mesmo formatador que o site usa.
    expect(texto).toBe(
      `Dom Parque em Jardim Tupanci, ${precoAPartirDe(480000)}, 2 e 3 dormitórios. https://x/empreendimentos/dom — Bruna`,
    );
  });

  it("{nome} continua sendo de cada pessoa, e {horarios} fica para o envio", () => {
    const texto = aplicarTemplate({ mensagemBase: "Oi {nome}, tenho {horarios} no {imovel}", nomeLead: "Ana Paula", contexto: ctx, empreendimentoNome: "Dom Parque" });
    expect(texto).toBe("Oi Ana Paula, tenho {horarios} no Dom Parque");
    expect(resolverHorarios(texto, ["Sábado, 04/10 às 10h", "Segunda, 06/10 às 15h"])).toBe(
      "Oi Ana Paula, tenho sábado, 04/10 às 10h ou segunda, 06/10 às 15h no Dom Parque",
    );
  });

  it("avisa o que vai sair vazio antes de a lista nascer", () => {
    expect(variaveisSemValor("Oi {nome}, no {bairro} tem {horarios}", {}, { temAgenda: false })).toEqual([
      "bairro",
      "horarios",
    ]);
    expect(variaveisSemValor("Oi {nome} no {bairro}", ctx, { temAgenda: true })).toEqual([]);
    // Variável com erro de digitação também conta: o cliente leria "{bairo}".
    expect(variaveisSemValor("no {bairo}", ctx, { temAgenda: true })).toEqual(["bairo"]);
  });

  it("dormitórios em palavras", () => {
    expect(dormitoriosEmPalavras([3])).toBe("3 dormitórios");
    expect(dormitoriosEmPalavras([1])).toBe("1 dormitório");
    expect(dormitoriosEmPalavras([2, 1, 3])).toBe("1, 2 e 3 dormitórios");
    expect(dormitoriosEmPalavras([])).toBeNull();
  });
});

describe("previsão de término (Fase 1)", () => {
  // 10h de uma segunda em São Paulo = 13h UTC.
  const agora = new Date("2026-10-05T13:00:00Z");
  const expediente = { inicioHora: 9, fimHora: 21 };

  it("termina hoje quando cabe no saldo e no expediente", () => {
    const p = previsaoDeTermino({ pendentes: 10, saldoHoje: 30, agora, expediente });
    expect(p.terminaHoje).toBe(true);
    expect(p.continuaAmanha).toBe(0);
    // 10 mensagens × a média do sorteio de 90–120s (09/10/2026).
    expect(p.terminaEm!.getTime() - agora.getTime()).toBe(10 * 105 * 1000);
  });

  it("o que passa do saldo continua no próximo dia", () => {
    const p = previsaoDeTermino({ pendentes: 40, saldoHoje: 15, agora, expediente });
    expect(p.continuaAmanha).toBe(25);
    expect(p.terminaHoje).toBe(false);
  });

  it("depois do expediente nada sai hoje", () => {
    const tarde = new Date("2026-10-05T23:30:00Z"); // 20h30 em SP
    const p = previsaoDeTermino({ pendentes: 5, saldoHoje: 30, agora: tarde, expediente: { inicioHora: 9, fimHora: 20 } });
    expect(p.terminaEm).toBeNull();
    expect(p.continuaAmanha).toBe(5);
  });
});

describe("o retorno de cada lista no Início (Fase 3)", () => {
  const agora = new Date("2026-10-20T12:00:00Z");
  const base = { campanhaId: "l1", titulo: "Dom Parque", respostaEm: null as string | null };

  it("conta quem respondeu na semana e sugere segunda tentativa só depois de 7 dias", () => {
    const r = retornoDasListas(
      [
        { ...base, leadId: "a", status: "respondido", enviadoEm: "2026-10-18T12:00:00Z", respostaEm: "2026-10-18T13:00:00Z" },
        { ...base, leadId: "b", status: "enviado", enviadoEm: "2026-10-10T12:00:00Z" },
        { ...base, leadId: "c", status: "enviado", enviadoEm: "2026-10-18T12:00:00Z" },
        { ...base, leadId: "d", status: "enviado", enviadoEm: "2026-10-01T12:00:00Z" },
      ],
      agora,
    );
    expect(r).toEqual([{ campanhaId: "l1", titulo: "Dom Parque", responderam: 1, semResposta: ["b"] }]);
  });
});

describe("guardas de código (Fase 4)", () => {
  it("só o assistente e a lista viva criam lista ou fila", () => {
    const permitidos = new Set([
      "src/app/corretor/(painel)/campanhas/acoes.ts",
      "src/lib/whatsapp/listasVivas.ts",
    ]);
    const achados: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
        const rel = `${dir}/${nome.name}`;
        if (nome.isDirectory()) varrer(rel);
        else if (/\.(ts|tsx)$/.test(nome.name) && !/\.test\./.test(nome.name)) {
          const fonte = fs.readFileSync(path.join(raiz, rel), "utf8");
          if (/from\("whatsapp_campanhas(_fila)?"\)\s*\.insert\(/.test(fonte)) achados.push(rel);
        }
      }
    };
    varrer("src");
    expect(achados.filter((a) => !permitidos.has(a))).toEqual([]);
  });

  it("liberar a fila nunca devolve à fila quem deu erro", () => {
    const acoes = ler("src/app/corretor/(painel)/campanhas/acoes.ts");
    const ini = acoes.indexOf("export async function liberarEnvioAgora");
    const corpo = acoes.slice(ini, acoes.indexOf("\nexport ", ini + 10));
    expect(corpo).not.toMatch(/\.eq\("status",\s*"erro"\)/);
    expect(corpo).not.toContain("ignorar_janela: true");
    expect(corpo).toContain("janela_liberada_ate");
  });

  it("o disparador confere o lead ANTES de gastar a cota", () => {
    const fonte = ler("src/lib/whatsapp/campaignDispatcher.ts");
    const conferencia = fonte.indexOf("motivoParaNaoEnviar(lead");
    const cota = fonte.indexOf("reservarCotaCampanha(instancia.id");
    expect(conferencia).toBeGreaterThan(0);
    expect(cota).toBeGreaterThan(conferencia);
  });

  it("a foto da lista só sai se existir no catálogo do imóvel dela", () => {
    const fonte = ler("src/lib/whatsapp/campaignDispatcher.ts");
    expect(fonte).toContain("await midiasDoCatalogo(");
    expect(fonte).not.toMatch(/enviarMidiasDaLista\(\{[^}]*midias: \(aindaAtiva\.midias/);
  });

  it("quem pede para sair sai das listas pendentes", () => {
    const fonte = ler("src/lib/whatsapp/repositorio.ts");
    const ini = fonte.indexOf("export async function registrarRecusaDoCliente");
    const corpo = fonte.slice(ini, fonte.indexOf("\nexport ", ini + 10));
    expect(corpo).toMatch(/from\("whatsapp_campanhas_fila"\)\s*\.delete\(\)/);
  });

  it("o público é só da carteira do próprio corretor", () => {
    const fonte = ler("src/lib/whatsapp/publicoDaLista.ts");
    expect(fonte).toMatch(/\.eq\("corretor_id", corretorId\)\s*\.is\("arquivado_em", null\)/);
    expect(ler("src/app/corretor/(painel)/campanhas/acoes.ts")).not.toContain("getMeusLeads");
  });
});
