import { afterEach, describe, expect, it, vi } from "vitest";
import { montarZip } from "../../../test/zipDeTeste";
import {
  extrairDeImagem,
  extrairDeTexto,
  extrairDeVcard,
  extrairDeXlsx,
  parsearTabelaLeads,
} from "./importacao";
import { lerLinhasDaAba } from "./xlsxLeitura";

/*
 * Os formatos que a importação passou a aceitar em 24/09/2026. Os fixtures
 * reproduzem o que os programas de verdade geram — o `.txt` do Android com o
 * nome do arquivo, o vCard 2.1 do Android em quoted-printable, o `waid=` do
 * contato compartilhado pelo WhatsApp, o CSV do Google Contatos com a coluna
 * "Phone 1 - Label" antes do número —, porque fixture limpo demais testa um
 * formato que ninguém manda.
 */

describe("Importação — .txt solto da conversa do WhatsApp (Android)", () => {
  const CONVERSA = [
    "12/09/2026 09:41 - As mensagens e as chamadas são protegidas com a criptografia de ponta a ponta.",
    "12/09/2026 09:41 - +55 11 99123-4567: Boa tarde! Vi o anúncio do Vitra Alphaville",
    "12/09/2026 09:42 - +55 11 99123-4567: Ainda tem de 2 dormitórios?",
    "12/09/2026 09:45 - Bruna Next Home: Oi! Tenho sim",
  ].join("\n");

  it("lê como conversa, não como tabela", async () => {
    const resultado = await extrairDeTexto(CONVERSA, {
      nomeDoArquivo: "Conversa do WhatsApp com +55 11 99123-4567.txt",
    });

    expect(resultado.metodo).toBe("whatsapp");
    expect(resultado.candidatos).toHaveLength(1);
    expect(resultado.candidatos[0].telefoneE164).toBe("5511991234567");
    expect(resultado.candidatos[0].mensagem).toContain("Vitra Alphaville");
  });

  it("deixa o corretor de fora também quando a conversa é COLADA", async () => {
    const colada = [
      "12/09/2026 09:41 - Ana Prado: Oi, quero ver o decorado",
      "12/09/2026 09:42 - Bruna Next Home: Claro!",
      "12/09/2026 09:43 - Ana Prado: sábado pode?",
    ].join("\n");

    const resultado = await extrairDeTexto(colada, { dono: { nome: "Bruna Next Home" } });

    expect(resultado.candidatos.map((c) => c.nome)).toEqual(["Ana Prado"]);
  });
});

describe("Importação — contatos (.vcf)", () => {
  it("usa o waid do contato compartilhado pelo WhatsApp", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Prado;Ana;;;",
      "FN:Ana Prado",
      "item1.TEL;waid=5511991234567:+55 11 99123-4567",
      "item1.X-ABLabel:Celular",
      "END:VCARD",
    ].join("\r\n");

    const resultado = extrairDeVcard(vcf);

    expect(resultado.metodo).toBe("contatos");
    expect(resultado.candidatos[0].nome).toBe("Ana Prado");
    expect(resultado.candidatos[0].telefoneE164).toBe("5511991234567");
  });

  it("lê a agenda do Android em quoted-printable, com acento e linha continuada", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:2.1",
      "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Ara=C3=BAjo;Jo=C3=A3o;;;",
      "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Jo=C3=A3o Ara=C3=BAjo =",
      "Silva",
      "TEL;HOME:1133334444",
      "TEL;CELL:11 98888-7777",
      "EMAIL;HOME:joao@exemplo.com",
      "END:VCARD",
      "BEGIN:VCARD",
      "VERSION:2.1",
      "FN:Sem Telefone",
      "END:VCARD",
    ].join("\n");

    const resultado = extrairDeVcard(vcf);

    expect(resultado.candidatos).toHaveLength(1);
    expect(resultado.candidatos[0].nome).toBe("João Araújo Silva");
    // Celular vence o fixo: é ele que tem WhatsApp.
    expect(resultado.candidatos[0].telefoneE164).toBe("5511988887777");
    expect(resultado.candidatos[0].email).toBe("joao@exemplo.com");
  });

  it("junta linha dobrada da versão 3.0 e monta o nome pelo N quando falta FN", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Lima;Bruno;;;",
      "TEL;TYPE=CELL:+55 11 9",
      " 7777-6666",
      "END:VCARD",
    ].join("\n");

    const resultado = extrairDeVcard(vcf);

    expect(resultado.candidatos[0].nome).toBe("Bruno Lima");
    expect(resultado.candidatos[0].telefoneE164).toBe("5511977776666");
  });

  it("não carimba 55 em número estrangeiro", () => {
    const vcf = ["BEGIN:VCARD", "VERSION:3.0", "FN:John", "TEL;TYPE=CELL:+1 415 555 2671", "END:VCARD"].join("\n");

    const resultado = extrairDeVcard(vcf);

    expect(resultado.candidatos).toHaveLength(1);
    expect(resultado.candidatos[0].telefoneE164).toBeNull();
  });

  it("o arquivo .vcf enviado como texto chega ao leitor de contatos", async () => {
    const vcf = ["BEGIN:VCARD", "VERSION:3.0", "FN:Carla", "TEL:11 96666-5555", "END:VCARD"].join("\n");

    const resultado = await extrairDeTexto(vcf, { nomeDoArquivo: "Carla.vcf" });

    expect(resultado.metodo).toBe("contatos");
    expect(resultado.candidatos[0].telefoneE164).toBe("5511966665555");
  });
});

describe("Importação — CSV do Google Contatos e campos entre aspas", () => {
  it("ignora a coluna de rótulo do telefone e junta nome e sobrenome", () => {
    const csv = [
      "First Name,Middle Name,Last Name,Notes,E-mail 1 - Label,E-mail 1 - Value,Phone 1 - Label,Phone 1 - Value",
      'Ana,,Prado,"Quer 2 dorms, perto do parque",* Home,ana@exemplo.com,Mobile,+55 11 99123-4567 ::: +55 11 3333-4444',
    ].join("\n");

    const linhas = parsearTabelaLeads(csv);

    expect(linhas).toHaveLength(1);
    expect(linhas[0].nome).toBe("Ana Prado");
    expect(linhas[0].telefoneE164).toBe("5511991234567");
    expect(linhas[0].email).toBe("ana@exemplo.com");
  });

  it("não desloca as colunas quando o nome tem vírgula entre aspas", () => {
    const csv = ['nome,telefone,email', '"Prado, Ana",11991234567,ana@exemplo.com'].join("\n");

    const linhas = parsearTabelaLeads(csv);

    expect(linhas[0].nome).toBe("Prado, Ana");
    expect(linhas[0].email).toBe("ana@exemplo.com");
  });

  it("aceita observação entre aspas atravessando linhas", () => {
    const csv = ['nome;telefone;observação', 'Ana;11991234567;"primeira linha', 'segunda linha"', "Bruno;11987654321;ok"].join(
      "\n",
    );

    const linhas = parsearTabelaLeads(csv);

    expect(linhas.map((l) => l.nome)).toEqual(["Ana", "Bruno"]);
    expect(linhas[0].mensagem).toContain("segunda linha");
  });

  it("com vários telefones, prefere a coluna do celular", () => {
    const csv = ["First Name,Business Phone,Mobile Phone", "Ana,1133334444,11991234567"].join("\n");

    expect(parsearTabelaLeads(csv)[0].telefoneE164).toBe("5511991234567");
  });
});

describe("Importação — Excel (.xlsx)", () => {
  function planilha(abas: { nome: string; xml: string }[], compartilhados: string[]) {
    const sheets = abas
      .map((aba, i) => `<sheet name="${aba.nome}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("");
    const rels = abas
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("");
    const sst = compartilhados.map((t) => `<si><t>${t}</t></si>`).join("");

    return montarZip([
      {
        nome: "xl/workbook.xml",
        conteudo: `<?xml version="1.0"?><workbook xmlns:r="r"><sheets>${sheets}</sheets></workbook>`,
      },
      { nome: "xl/_rels/workbook.xml.rels", conteudo: `<Relationships>${rels}</Relationships>` },
      { nome: "xl/sharedStrings.xml", conteudo: `<sst>${sst}</sst>` },
      ...abas.map((aba, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, conteudo: aba.xml })),
    ]);
  }

  it("lê nome em texto compartilhado e telefone guardado como NÚMERO", async () => {
    // 0 = "Nome", 1 = "Celular", 2 = "Ana Prado"
    const aba = `<worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
      <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>5.5119912345670002E+12</v></c></row>
      <row r="3"/>
      <row r="4"><c r="A4" t="inlineStr"><is><t>Bruno &amp; Cia</t></is></c><c r="B4"><v>11987654321</v></c></row>
    </sheetData></worksheet>`;

    const resultado = await extrairDeXlsx(planilha([{ nome: "Contatos", xml: aba }], ["Nome", "Celular", "Ana Prado"]));

    expect(resultado.metodo).toBe("planilha");
    expect(resultado.candidatos.map((c) => [c.nome, c.telefoneE164])).toEqual([
      ["Ana Prado", "5511991234567"],
      ["Bruno & Cia", "5511987654321"],
    ]);
  });

  it("pula a aba de resumo e usa a primeira que tem contatos", async () => {
    const resumo = `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Total</t></is></c><c r="B1"><v>42</v></c></row></sheetData></worksheet>`;
    const lista = `<worksheet><sheetData>
      <row r="1"><c r="A1" t="inlineStr"><is><t>Cliente</t></is></c><c r="C1" t="inlineStr"><is><t>WhatsApp</t></is></c></row>
      <row r="2"><c r="A2" t="inlineStr"><is><t>Carla</t></is></c><c r="C2" t="inlineStr"><is><t>(11) 96666-5555</t></is></c></row>
    </sheetData></worksheet>`;

    const resultado = await extrairDeXlsx(
      planilha(
        [
          { nome: "Resumo", xml: resumo },
          { nome: "Leads", xml: lista },
        ],
        [],
      ),
    );

    expect(resultado.candidatos[0].telefoneE164).toBe("5511966665555");
    expect(resultado.aviso).toContain("Leads");
  });

  it("mantém a coluna certa quando há célula vazia no meio", () => {
    const xml = `<x:worksheet><x:sheetData><x:row r="1"><x:c r="A1"><x:v>1</x:v></x:c><x:c r="D1"><x:v>4</x:v></x:c></x:row></x:sheetData></x:worksheet>`;

    expect(lerLinhasDaAba(xml, [])).toEqual([["1", "", "", "4"]]);
  });

  it("recusa o que não é planilha com uma frase que diz o que fazer", async () => {
    const resultado = await extrairDeXlsx(Buffer.from("isto não é um xlsx"));

    expect(resultado.candidatos).toHaveLength(0);
    expect(resultado.aviso).toContain(".xlsx");
  });
});

describe("Importação — foto ou print", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sem a IA disponível, diz que a leitura de foto depende dela", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GOOGLE_AI_API_KEY", "");

    const resultado = await extrairDeImagem(Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg");

    expect(resultado.candidatos).toHaveLength(0);
    expect(resultado.aviso).toContain("IA");
  });
});
