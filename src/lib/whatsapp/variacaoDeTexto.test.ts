import { describe, expect, it } from "vitest";
import {
  ajustarSaudacaoAoHorario,
  emPorcentagem,
  estiloDaVariacao,
  fatosDaLista,
  fatosQueOTextoCita,
  LIMITE_DE_SEMELHANCA,
  maiorSemelhanca,
  mascararNomes,
  palavrasSemOsFatos,
  problemaDaVariacao,
  promptDeVariacao,
  saudacaoDoHorario,
  semelhancaEntreTextos,
  versoesDiferentes,
} from "./variacaoDeTexto";
import { trocarNome } from "./listaDeTransmissao";
import { primeiroNomeUtil } from "@/lib/leads/nomeExibido";

/*
 * O texto real da lista do Dom Parque (outubro/2026) e o que a régua precisa
 * separar: variações que um corretor escreveria de novo à mão, e cópias com
 * duas ou três palavras trocadas, que é o que a IA antiga devolvia.
 */
const FATOS = ["Dom Parque", "Jardim Tupanci", "Barueri", "Next Home"];
const ORIGINAL =
  "Olá, Ana! Tudo bem? Lembrei do seu interesse e acabou de sair uma condição nova no Dom Parque, em Jardim Tupanci. Quer que eu te mande os detalhes?";

const BOAS = [
  "Oi Ana, tudo certo? Saiu uma condição nova no Dom Parque, lá no Jardim Tupanci, e pensei em você. Posso te mandar como ficou?",
  "Ana, boa tarde! Lembrei de você porque o Dom Parque, no Jardim Tupanci, abriu uma condição diferente. Te envio os detalhes?",
  "Olá, Ana! Tenho novidade no Dom Parque (Jardim Tupanci): entrou uma condição que talvez te interesse. Quer que eu explique?",
  "Oi, Ana! Passando rapidinho: o Dom Parque, no Jardim Tupanci, está com condição nova. Faz sentido eu te mandar?",
  "Ana, tudo bem por aí? Acabou de entrar uma condição no Dom Parque, em Jardim Tupanci. Se quiser, te passo tudo por aqui.",
  "E aí, Ana, como vai? Lembra do Dom Parque, no Jardim Tupanci? Saiu condição nova lá. Posso te contar?",
  "Novidade no Dom Parque, Ana! A condição mudou lá no Jardim Tupanci. Quer saber como ficou?",
  "Pensei em você agora, Ana. O Dom Parque, lá no Jardim Tupanci, abriu condição nova. Quer que eu envie?",
];

const COPIAS = [
  "Olá Ana! Tudo bem? Lembrei do seu interesse e acabou de sair uma condição nova no Dom Parque, em Jardim Tupanci. Quer que eu te envie os detalhes?",
  "Oi Ana! Tudo bem? Lembrei do seu interesse e acabou de surgir uma condição nova no Dom Parque, em Jardim Tupanci. Quer que eu te mande os detalhes?",
  "Olá, Ana! Tudo bem? Lembrei do seu interesse: acabou de sair uma nova condição no Dom Parque, em Jardim Tupanci. Posso te mandar os detalhes?",
  "Olá Ana, tudo bem? Lembrei do seu interesse e saiu uma condição nova no Dom Parque, em Jardim Tupanci. Quer que eu mande os detalhes?",
];

const comNome = (texto: string) => ({ texto, nomes: ["Ana"] });

describe("semelhança entre mensagens", () => {
  it("cópia com palavras trocadas passa do limite", () => {
    for (const copia of COPIAS) {
      expect(semelhancaEntreTextos(comNome(copia), comNome(ORIGINAL), FATOS), copia).toBeGreaterThanOrEqual(
        LIMITE_DE_SEMELHANCA,
      );
    }
  });

  it("variação de verdade fica abaixo do limite, contra o original e entre si", () => {
    for (const boa of BOAS) {
      expect(semelhancaEntreTextos(comNome(boa), comNome(ORIGINAL), FATOS), boa).toBeLessThan(LIMITE_DE_SEMELHANCA);
    }
    for (let i = 0; i < BOAS.length; i++) {
      for (let j = i + 1; j < BOAS.length; j++) {
        expect(semelhancaEntreTextos(comNome(BOAS[i]), comNome(BOAS[j]), FATOS)).toBeLessThan(LIMITE_DE_SEMELHANCA);
      }
    }
  });

  it("pega o molde com sinônimos, que as trincas sozinhas deixavam passar", () => {
    const a = { texto: "Oi Ana, tudo bem? Saiu condição nova no Dom Parque. Quer os detalhes?", nomes: ["Ana"] };
    const b = { texto: "Olá João, tudo certo? Entrou condição nova no Dom Parque. Quer os detalhes?", nomes: ["João"] };
    expect(semelhancaEntreTextos(a, b, FATOS)).toBeGreaterThanOrEqual(LIMITE_DE_SEMELHANCA);
  });

  it("o nome de cada pessoa e os fatos do imóvel não contam", () => {
    const a = { texto: "Oi Ana, o Dom Parque no Jardim Tupanci tem novidade.", nomes: ["Ana"] };
    const b = { texto: "Oi Bruno, o Dom Parque no Jardim Tupanci tem novidade.", nomes: ["Bruno"] };
    expect(semelhancaEntreTextos(a, b, FATOS)).toBe(1);
    expect(palavrasSemOsFatos("Oi Ana, o Dom Parque no Jardim Tupanci", [...FATOS, "Ana"])).toEqual(["oi", "o", "no"]);
  });

  it("acento, caixa, pontuação e link não mudam a conta", () => {
    const a = { texto: "Condição NOVA no Dom Parque! Veja: https://x.com/a" };
    const b = { texto: "condicao nova no dom parque veja https://y.com/b" };
    expect(semelhancaEntreTextos(a, b)).toBe(1);
  });

  it("aponta qual mensagem anterior é a mais parecida", () => {
    const anteriores = [comNome(BOAS[0]), comNome(COPIAS[1]), comNome(BOAS[3])];
    const r = maiorSemelhanca(ORIGINAL, ["Ana"], anteriores, FATOS);
    expect(r.indice).toBe(1);
    expect(r.semelhanca).toBeGreaterThanOrEqual(LIMITE_DE_SEMELHANCA);
    expect(maiorSemelhanca(ORIGINAL, [], [], FATOS)).toEqual({ semelhanca: 0, indice: -1 });
  });

  it("mostra a semelhança como porcentagem", () => {
    expect(emPorcentagem(0.624)).toBe("62%");
    expect(emPorcentagem(1.2)).toBe("100%");
  });
});

describe("fatos que a reescrita não pode mudar", () => {
  it("junta imóvel, bairro, cidade, corretor e casa, sem repetir", () => {
    const fatos = fatosDaLista({
      contexto: { imovel: "Dom Parque", bairro: "Jardim Tupanci", cidade: "Barueri", corretor: "Bruna", link: "https://x" },
      imovelNome: "Dom Parque",
      corretorNome: "Cristal - Bruna",
      nomeDaCasa: "Next Home",
    });
    expect(fatos).toEqual(["Dom Parque", "Jardim Tupanci", "Barueri", "Bruna", "Next Home", "Cristal"]);
  });

  it("só cobra o que o original cita, sem acento nem caixa", () => {
    expect(fatosQueOTextoCita("Novidade no DOM PARQUE, em barueri", FATOS)).toEqual(["Dom Parque", "Barueri"]);
  });
});

describe("conferência da reescrita", () => {
  const conferir = (variacao: string, original = ORIGINAL, nome: string | null = "Ana") =>
    problemaDaVariacao({ original, variacao, fatos: FATOS, nome });

  it("aceita uma variação boa", () => {
    for (const boa of BOAS) expect(conferir(boa), boa).toBeNull();
  });

  it("recusa quando some o imóvel ou o bairro", () => {
    expect(conferir("Oi Ana, tudo certo? Saiu condição nova lá no Jardim Tupanci. Posso te mandar?")).toMatch(/Dom Parque/);
  });

  it("recusa quando some o nome da pessoa", () => {
    expect(conferir("Oi, tudo certo? Saiu condição nova no Dom Parque, no Jardim Tupanci. Posso te mandar?")).toMatch(/Ana/);
  });

  it("recusa número inventado e valor que o original não tinha", () => {
    expect(conferir("Oi Ana! O Dom Parque, no Jardim Tupanci, tem condição nova com 2 dormitórios. Quer ver?")).toMatch(
      /número 2/,
    );
    const comNumero = "Oi Ana! O Dom Parque tem 2 opções novas no Jardim Tupanci. Quer que eu te mande?";
    expect(
      conferir("Oi Ana, tudo certo? O Dom Parque, no Jardim Tupanci, tem 2 opções por R$ 2 mil. Quer ver?", comNumero),
    ).toMatch(/valor/);
  });

  it("recusa link inventado e link perdido", () => {
    const comLink = "Oi Ana! Saiu condição nova no Dom Parque, no Jardim Tupanci: https://nh.com/dom. Quer ver?";
    expect(conferir("Oi Ana! Saiu condição nova no Dom Parque, no Jardim Tupanci. Quer ver?", comLink)).toMatch(/link/);
    expect(
      conferir("Oi Ana, tudo certo? O Dom Parque, lá no Jardim Tupanci, abriu uma condição nova: https://outro.com. Quer que eu explique?"),
    ).toMatch(/inventou um link/);
  });

  it("recusa marcador perdido ou inventado", () => {
    const comHorarios = "Oi Ana! Tenho {horarios} para te mostrar o Dom Parque, no Jardim Tupanci. Algum serve?";
    expect(conferir("Oi Ana! Quer conhecer o Dom Parque, no Jardim Tupanci, essa semana? Algum horário serve?", comHorarios)).toMatch(
      /marcadores/,
    );
    expect(conferir("Oi {nome}! Saiu condição nova no Dom Parque, no Jardim Tupanci. Quer ver, Ana?")).toMatch(/marcador/);
  });

  it("recusa frase de mensagem automática, a não ser que o corretor a tenha escrito", () => {
    expect(
      conferir("Prezada Ana, espero que esteja bem. Surgiu condição nova no Dom Parque, no Jardim Tupanci. Posso enviar?"),
    ).toMatch(/automática/);
    const doCorretor = "Prezada Ana, saiu condição nova no Dom Parque, no Jardim Tupanci. Quer ver?";
    expect(conferir("Prezada Ana, o Dom Parque, no Jardim Tupanci, abriu condição nova. Quer conhecer?", doCorretor)).toBeNull();
  });

  it("recusa quando a pergunta do final some", () => {
    expect(conferir("Oi Ana! Saiu condição nova no Dom Parque, no Jardim Tupanci. Te mando em seguida.")).toMatch(/pergunta/);
  });

  it("recusa texto longo demais, curto demais, markdown e emoji demais", () => {
    expect(conferir(`Oi Ana! ${"Dom Parque no Jardim Tupanci tem condição nova. ".repeat(6)}Quer ver?`)).toMatch(/longa/);
    expect(conferir("Ana: Dom Parque, Jardim Tupanci?")).toMatch(/encurtou/);
    expect(conferir("Oi **Ana**! Saiu condição nova no Dom Parque, no Jardim Tupanci. Quer ver?")).toMatch(/markdown/);
    expect(conferir("Oi Ana! 🎉🏡✨ Saiu condição nova no Dom Parque, no Jardim Tupanci. Quer ver?")).toMatch(/emoji/);
  });
});

describe("saudação do horário", () => {
  // 18h UTC = 15h em São Paulo.
  const tarde = new Date("2026-10-08T18:00:00Z");
  const manha = new Date("2026-10-08T12:30:00Z");
  const noite = new Date("2026-10-08T23:10:00Z");

  it("escolhe pela hora de São Paulo, não do servidor", () => {
    expect(saudacaoDoHorario(manha)).toBe("bom dia");
    expect(saudacaoDoHorario(tarde)).toBe("boa tarde");
    expect(saudacaoDoHorario(noite)).toBe("boa noite");
  });

  it("troca a saudação errada mantendo a caixa e o artigo", () => {
    expect(ajustarSaudacaoAoHorario("Bom dia, Ana! Tenha um bom dia.", tarde)).toBe("Boa tarde, Ana! Tenha uma boa tarde.");
    expect(ajustarSaudacaoAoHorario("BOA NOITE! tudo bem?", manha)).toBe("BOM DIA! tudo bem?");
    expect(ajustarSaudacaoAoHorario("Oi Ana, uma boa tarde para você", noite)).toBe("Oi Ana, uma boa noite para você");
  });

  it("não mexe em texto sem saudação nem na saudação certa", () => {
    expect(ajustarSaudacaoAoHorario("Oi Ana, tudo bem?", tarde)).toBe("Oi Ana, tudo bem?");
    expect(ajustarSaudacaoAoHorario("Boa tarde, Ana!", tarde)).toBe("Boa tarde, Ana!");
  });
});

describe("pedido à IA", () => {
  it("sorteia abertura e organização, e sem nome não pede abertura com nome", () => {
    const vistos = new Set<string>();
    for (let s = 0; s < 40; s++) {
      const estilo = estiloDaVariacao(s, { temNome: false, manterAbertura: false });
      expect(estilo).toHaveLength(2);
      expect(estilo.join(" ")).not.toMatch(/nome/);
      vistos.add(estilo.join("|"));
    }
    expect(vistos.size).toBeGreaterThanOrEqual(10);
  });

  it("no teste A/B não mexe no jeito de abrir", () => {
    for (let s = 0; s < 20; s++) {
      const estilo = estiloDaVariacao(s, { temNome: true, manterAbertura: true });
      expect(estilo).toHaveLength(1);
      expect(estilo[0]).not.toMatch(/abra|parágrafos/);
    }
  });

  /*
   * Trocar palavra por palavra mantém a sequência, que é o que a conferência
   * mede. Foi assim que a lista do Ramos parou em 08/10/2026: o modo A/B
   * mandava "mudar só as palavras", e a sétima reescrita não passou mais.
   */
  it("nenhum estilo pede só sinônimos, nem no teste A/B", () => {
    for (let s = 0; s < 60; s++) {
      for (const manterAbertura of [false, true]) {
        const estilo = estiloDaVariacao(s, { temNome: true, manterAbertura });
        expect(estilo.join(" ")).not.toMatch(/sin[ôo]nimo/);
      }
    }
    const ab = promptDeVariacao({
      original: ORIGINAL,
      nome: "Ana",
      fatos: FATOS,
      recentes: [],
      estilo: [],
      manterAbertura: true,
    });
    expect(ab).not.toMatch(/só as palavras/);
    expect(ab).toContain("mude a ordem das ideias");
    expect(ab).toContain("não basta: a conferência compara a sequência das palavras");
  });

  it("recusada por semelhança, a próxima tentativa é mandada mudar a ordem, não só as palavras", () => {
    const prompt = promptDeVariacao({
      original: ORIGINAL,
      nome: "Ana",
      fatos: FATOS,
      recentes: [],
      estilo: [],
      manterAbertura: false,
      tentativaAnterior: { problema: "ficou 72% parecida", parecidaCom: "Oi [nome], tudo bem?" },
    });
    expect(prompt).toContain("Comece por outra ideia, mude a ordem do resto");
    const semParecida = promptDeVariacao({
      original: ORIGINAL,
      nome: "Ana",
      fatos: FATOS,
      recentes: [],
      estilo: [],
      manterAbertura: false,
      tentativaAnterior: { problema: "sumiu o bairro" },
    });
    expect(semParecida).toContain("Escreva de outro jeito.");
    expect(semParecida).not.toContain("Comece por outra ideia");
  });

  it("leva os fatos, o marcador, o nome, as recentes e o motivo da recusa anterior", () => {
    const prompt = promptDeVariacao({
      original: "Oi Ana! Tenho {horarios} para o Dom Parque. Algum serve?",
      nome: "Ana",
      fatos: ["Dom Parque"],
      recentes: ["Oi [nome], o Dom Parque abriu agenda. Quer ver?"],
      estilo: ["use frases bem curtas, como quem digita no celular"],
      manterAbertura: true,
      tentativaAnterior: { problema: "ficou 82% parecida com uma mensagem anterior", parecidaCom: "Oi [nome], tudo bem?" },
    });
    expect(prompt).toContain('"Dom Parque"');
    expect(prompt).toContain("{horarios} exatamente assim");
    expect(prompt).toContain('chame a pessoa de "Ana"');
    expect(prompt).toContain("1. Oi [nome], o Dom Parque abriu agenda.");
    expect(prompt).toContain("teste entre duas aberturas");
    expect(prompt).toContain("82% parecida");
    expect(prompt).toContain("frases bem curtas");
  });

  it("sem nome, proíbe cliente, prezado e nome inventado", () => {
    const prompt = promptDeVariacao({
      original: "Oi! Saiu condição nova. Quer ver?",
      nome: null,
      fatos: [],
      recentes: [],
      estilo: [],
      manterAbertura: false,
    });
    expect(prompt).toContain("não sabemos o nome");
    expect(prompt).not.toContain("Mensagens que este número já mandou");
  });

  it("tira o nome de quem recebeu antes de mostrar a mensagem à IA", () => {
    expect(mascararNomes("Oi Ana Paula, a Ana voltou?", ["Ana Paula", "Ana"])).toBe("Oi [nome], a [nome] voltou?");
    expect(mascararNomes("Banana", ["Ana"])).toBe("Banana");
  });
});

describe("o nome na mensagem", () => {
  it("usa o primeiro nome, como gente chama gente", () => {
    expect(primeiroNomeUtil("Gabriely Bonfim")).toBe("Gabriely");
    expect(primeiroNomeUtil("MARIA SILVA")).toBe("Maria");
    expect(primeiroNomeUtil("  fernanda  ")).toBe("Fernanda");
  });

  it("mantém nome composto e título", () => {
    expect(primeiroNomeUtil("Ana Paula Souza")).toBe("Ana Paula");
    expect(primeiroNomeUtil("joão pedro lima")).toBe("João Pedro");
    expect(primeiroNomeUtil("Dr. Roberto")).toBe("Dr. Roberto");
    expect(primeiroNomeUtil("dra marcia alves")).toBe("Dra. Marcia");
  });

  it("não chama ninguém pelo que não é nome", () => {
    expect(primeiroNomeUtil("WhatsApp 1234")).toBeNull();
    expect(primeiroNomeUtil("Contato sem nome")).toBeNull();
    expect(primeiroNomeUtil("cliente")).toBeNull();
    expect(primeiroNomeUtil("ana@gmail.com")).toBeNull();
    expect(primeiroNomeUtil("11 98765-4321")).toBeNull();
    expect(primeiroNomeUtil(null)).toBeNull();
  });

  it("sem nome, o marcador some com a pontuação que só existia por ele", () => {
    expect(trocarNome("Olá, {nome}! Conheça o Dom Parque.", null)).toBe("Olá! Conheça o Dom Parque.");
    expect(trocarNome("Oi {nome}, tudo bem?", null)).toBe("Oi, tudo bem?");
    expect(trocarNome("{nome}, saiu condição nova.", null)).toBe("Saiu condição nova.");
    expect(trocarNome("Tudo bem, {nome}?", null)).toBe("Tudo bem?");
    expect(trocarNome("Lembrei de você, {nome}, porque saiu novidade.", null)).toBe("Lembrei de você, porque saiu novidade.");
    expect(trocarNome("Oi {nome} tudo bem", null)).toBe("Oi tudo bem");
    expect(trocarNome("Oi {nome},\n\nSaiu novidade.", null)).toBe("Oi,\n\nSaiu novidade.");
    expect(trocarNome("Oi {nome}, tudo bem?", "Ana")).toBe("Oi Ana, tudo bem?");
  });
});

/*
 * A lista do Ramos em 08/10/2026: versões A e B iguais letra por letra, seis
 * reescritas que só trocavam sinônimos (entre 0,46 e 0,70 umas das outras) e a
 * sétima que não passou mais. Medido sobre os textos reais.
 */
describe("teste A/B e o molde da reescrita", () => {
  it("versões iguais não são teste A/B", () => {
    const a = "Olá, Sou Consultor Imobiliário Ramos !! Tudo bem? Lembrei do seu interesse no {imovel}. Quer os detalhes?";
    expect(versoesDiferentes(a, a)).toBe(false);
    expect(versoesDiferentes(a, a.toUpperCase().replace("!!", "!"))).toBe(false);
    expect(versoesDiferentes(a, "Oi! Saiu novidade no {imovel}. Posso te mandar?")).toBe(true);
    expect(versoesDiferentes(a, null)).toBe(false);
    expect(versoesDiferentes(a, "   ")).toBe(false);
  });

  const FATOS_RAMOS = ["Dom Parque", "Jardim Tupanci", "Barueri", "Ramos", "Next Home"];
  const ENVIADAS = [
    ["Olá, Sou Consultor Imobiliário Ramos !! Tudo bem? Lembrei do seu interesse e acabou de sair uma condição nova no Dom Parque, em Jardim Tupanci. Quer que eu te mande os detalhes?", []],
    ["Oi Jhezynha, aqui é o Ramos, Consultor Imobiliário. Tudo certo? Vi que você se interessou e surgiu uma novidade no Dom Parque, lá no Jardim Tupanci. Quer que eu te envie as infos?", ["Jhezynha"]],
    ["Oi Ana, aqui é o Ramos, Consultor Imobiliário! Tudo certo? Pensei no seu interesse e tem uma novidade no Dom Parque em Jardim Tupanci. Quer que eu te envie os detalhes?", ["Ana"]],
    ["Olá Amanda, aqui é Ramos, Consultor Imobiliário! Tudo bom? Lembrei que você demonstrou interesse e apareceu uma novidade no Dom Parque, em Jardim Tupanci. Quer que eu te passe as informações?", ["Amanda"]],
    ["Olá, aqui é Ramos, seu Consultor Imobiliário! Tudo bem, Osmario? Lembrei que você tinha interesse e saiu uma opção nova no Dom Parque, em Jardim Tupanci. Quer que eu mande os detalhes para você?", ["Osmario"]],
    ["Oi, Vitor! Aqui é o Ramos, consultor imobiliário. Está tudo bem? Me lembrei do seu interesse e surgiu uma nova oferta no Dom Parque, em Jardim Tupanci. Quer que eu te envie as informações?", ["Vitor"]],
    ["Fala, Dema! Aqui é o Ramos, Consultor Imobiliário. Tudo tranquilo? Me veio à mente seu interesse e tem uma novidade no Dom Parque, em Jardim Tupanci. Quer que eu te mande as informações?", ["Dema"]],
  ].map(([texto, nomes]) => ({ texto: texto as string, nomes: nomes as string[] }));
  const contra = (texto: string) => maiorSemelhanca(texto, ["Thais"], ENVIADAS, FATOS_RAMOS).semelhanca;

  it("mais uma troca de sinônimos no mesmo molde não passa", () => {
    expect(
      contra(
        "Oi Thais, aqui é o Ramos, Consultor Imobiliário! Tudo certo? Lembrei do seu interesse e surgiu uma novidade no Dom Parque, em Jardim Tupanci. Quer que eu te mande as informações?",
      ),
    ).toBeGreaterThanOrEqual(LIMITE_DE_SEMELHANCA);
  });

  it("a mesma mensagem com outra ordem de ideias passa com folga", () => {
    for (const texto of [
      "Thais, saiu uma condição nova no Dom Parque, em Jardim Tupanci, e lembrei de você na hora. Sou o Ramos, consultor imobiliário. Te mando os detalhes?",
      "Thais, ainda pensa em morar no Dom Parque? Sou o Ramos, consultor imobiliário, e saiu uma condição nova em Jardim Tupanci. Se quiser, te explico como ficou.",
      "Bom dia, Thais! Ramos, consultor imobiliário, falando. Como vai? Você tinha comentado do Dom Parque e chegou uma condição diferente lá em Jardim Tupanci. Posso te contar como ficou?",
    ]) {
      expect(contra(texto)).toBeLessThan(0.5);
    }
  });
});
