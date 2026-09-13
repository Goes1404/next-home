import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  mensagemDeAnuncio,
  reconhecerConviteDeEntrada,
  reconhecerMensagemDeAnuncio,
  resolverCampanha,
} from "./porteiro";

const IMOVEIS = [
  {
    id: "1",
    slug: "more-na-aldeia-de-barueri-mac238",
    nome: "More na Aldeia de Barueri",
    nomesAlternativos: ["Manacá", "Manacá Barueri"],
  },
  { id: "2", slug: "terra-alta-ta141", nome: "Terra Alta", nomesAlternativos: [] },
  { id: "3", slug: "vitra-alphaville-vt110", nome: "Vitra Alphaville", nomesAlternativos: null },
];

describe("resolverCampanha — o pedaço da URL vira imóvel", () => {
  it("casa por apelido, que é como a campanha vai se chamar", () => {
    expect(resolverCampanha("manaca", IMOVEIS)?.id).toBe("1");
    expect(resolverCampanha("Manac%C3%A1", IMOVEIS)?.id).toBe("1");
  });

  it("casa por slug e por nome, com hífen ou espaço", () => {
    expect(resolverCampanha("terra-alta-ta141", IMOVEIS)?.id).toBe("2");
    expect(resolverCampanha("terra_alta ta141", IMOVEIS)?.id).toBe("2");
    expect(resolverCampanha("vitra-alphaville", IMOVEIS)?.id).toBe("3");
  });

  it("NÃO faz fuzzy: link com typo falha visível, não acerta quase", () => {
    expect(resolverCampanha("manacaa", IMOVEIS)).toBeNull();
    expect(resolverCampanha("terra", IMOVEIS)).toBeNull();
    expect(resolverCampanha("", IMOVEIS)).toBeNull();
  });
});

describe("mensagem de anúncio — ida e volta", () => {
  it("a mensagem gerada é reconhecida de volta pelo webhook", () => {
    const msg = mensagemDeAnuncio("More na Aldeia de Barueri");
    expect(reconhecerMensagemDeAnuncio(msg)).toBe("more na aldeia de barueri");
  });

  it("sobrevive ao que o WhatsApp faz com o texto: caixa e acento", () => {
    expect(reconhecerMensagemDeAnuncio("olá! gostaria de mais informações do MANACÁ.")).toBe(
      "manaca",
    );
    expect(reconhecerMensagemDeAnuncio("Ola gostaria de mais informacoes do Terra Alta")).toBe(
      "terra alta",
    );
  });

  it("fala pessoal NÃO é reconhecida — a trava protege o número do corretor", () => {
    for (const texto of [
      "oi, tudo bem?",
      "Olá! Gostaria de saber se você vai no aniversário",
      "gostaria de mais informações", // sem imóvel
      null,
      "",
    ]) {
      expect(reconhecerMensagemDeAnuncio(texto), String(texto)).toBeNull();
    }
  });

  it("texto longo não passa — mensagem pronta de anúncio é curta", () => {
    const longa = `Olá! Gostaria de mais informações do imóvel ${"que vi ontem ".repeat(12)}`;
    expect(reconhecerMensagemDeAnuncio(longa)).toBeNull();
  });
});

describe("convite de entrada — o que autoriza cadastrar quem ainda não é lead", () => {
  const FRASES = "vim pelo anuncio, vi no instagram, quero mais informacoes";

  it("a mensagem pronta do nosso link é convite, e diz qual imóvel", () => {
    const convite = reconhecerConviteDeEntrada({
      texto: mensagemDeAnuncio("More na Aldeia de Barueri"),
      palavrasEntradaCliente: FRASES,
    });
    expect(convite).toEqual({ via: "mensagem_do_anuncio", imovel: "more na aldeia de barueri" });
  });

  /*
   * O caso que o dono do produto descreveu: a pessoa não cola o texto que
   * pré-preenchemos, ela escreve a frase do anúncio com as palavras dela.
   */
  it("a frase que o CORRETOR cadastrou é convite, mesmo sem o nosso texto", () => {
    const convite = reconhecerConviteDeEntrada({
      texto: "vim pelo anúncio do Manacá Barueri",
      palavrasEntradaCliente: FRASES,
    });
    expect(convite).toEqual({ via: "frase_de_entrada", imovel: null });
  });

  it("a mensagem do anúncio vale mesmo sem frase cadastrada — o texto é nosso", () => {
    expect(
      reconhecerConviteDeEntrada({
        texto: mensagemDeAnuncio("Terra Alta"),
        palavrasEntradaCliente: null,
      })?.via,
    ).toBe("mensagem_do_anuncio");
  });

  /*
   * A metade que protege o número PESSOAL do corretor: sem convite, quem
   * escreve não vira cadastro, não vira conversa e não é gravado (0111).
   */
  it("fala que não é convite NÃO autoriza cadastro", () => {
    for (const texto of [
      "oi, tudo bem?",
      "mãe, chego às 8",
      "bom dia! você viu o jogo ontem?",
      "",
      null,
      undefined,
    ]) {
      expect(
        reconhecerConviteDeEntrada({ texto, palavrasEntradaCliente: FRASES }),
        String(texto),
      ).toBeNull();
    }
  });

  it("sem frase cadastrada, conversa comum continua fora", () => {
    expect(
      reconhecerConviteDeEntrada({ texto: "oi, tudo bem?", palavrasEntradaCliente: null }),
    ).toBeNull();
  });
});

describe("a porta do webhook: o convite é lido ANTES do porteiro encerrar", () => {
  /*
   * Esta guarda lê o CÓDIGO porque a regressão falha calada: o webhook
   * continua respondendo 200, o build passa, os testes passam — e o clique
   * que o anúncio pagou volta a ser descartado sem rastro.
   *
   * Foi exatamente o que aconteceu: `reconhecerMensagemDeAnuncio` existia,
   * tinha teste e ERA chamada, mas 115 linhas DEPOIS do `return` que a 0111
   * pôs no caminho. Ordem errada, nada vermelho.
   */
  const FONTE = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/webhooks/whatsapp/route.ts"),
    "utf8",
  );

  it("reconhece o convite antes de encerrar por número sem lead", () => {
    const reconhece = FONTE.indexOf("reconhecerConviteDeEntrada({");
    const encerra = FONTE.indexOf('ignored: "numero_sem_lead_cadastrado"');
    expect(reconhece, "o reconhecimento do convite sumiu do webhook").toBeGreaterThan(0);
    expect(encerra, "o porteiro da 0111 sumiu do webhook").toBeGreaterThan(0);
    expect(reconhece, "o convite precisa ser lido ANTES do porteiro encerrar").toBeLessThan(
      encerra,
    );
  });

  it("o convite chega ao porteiro — sem isso o lead nunca é cadastrado", () => {
    const inicio = FONTE.indexOf("await obterOuCriarConversa({");
    expect(inicio, "a chamada do porteiro sumiu").toBeGreaterThan(0);
    const chamada = FONTE.slice(inicio, FONTE.indexOf("});", inicio));
    expect(chamada).toContain("convite");
  });

  /*
   * A metade que protege o número PESSOAL. Sem o convite, a 0111 continua
   * inteira: conversa da família não vira cadastro nem gravação.
   */
  it("sem convite, o porteiro continua encerrando", () => {
    expect(FONTE).toMatch(/if \(!conversa\) \{\s*\n\s*return NextResponse\.json\(\{ ok: true, ignored: "numero_sem_lead_cadastrado" \}\)/);
  });
});
