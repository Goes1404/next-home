import { describe, expect, it } from "vitest";
import { recuperarNumerosColados } from "./coladoDaPlanilha";

/*
 * O que o Excel, o Google Planilhas e o LibreOffice põem na área de
 * transferência ao copiar Nome e Telefone: o texto mostra a notação cortada,
 * e o HTML guarda o número inteiro num atributo da célula.
 */
const TEXTO = "Nome\tTelefone\r\nAna Prado\t5,51198E+12\r\nBia Reis\t5,51198E+12\r\nCaio Lima\t11981918127\r\n";

const EXCEL = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><body><table>
<tr height=20><td height=20 width=120>Nome</td><td width=110>Telefone</td></tr>
<tr height=20><td height=20>Ana&nbsp;Prado</td><td class=xl65 align=right x:num="5511981918127">5,51198E+12</td></tr>
<tr height=20><td height=20>Bia Reis</td><td class=xl65 align=right x:num="5511984444333">5,51198E+12</td></tr>
<tr height=20><td height=20>Caio Lima</td><td align=right x:num>11981918127</td></tr>
</table></body></html>`;

const SHEETS = `<meta charset="utf-8"><google-sheets-html-origin><table><tbody>
<tr style="height:21px;"><td data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Nome&quot;}">Nome</td><td data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Telefone&quot;}">Telefone</td></tr>
<tr style="height:21px;"><td data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Ana Prado&quot;}">Ana Prado</td><td data-sheets-value="{&quot;1&quot;:3,&quot;3&quot;:5511981918127}">5.51198E+12</td></tr>
<tr style="height:21px;"><td>Bia Reis</td><td data-sheets-value="{&quot;1&quot;:3,&quot;3&quot;:5511984444333}">5.51198E+12</td></tr>
<tr style="height:21px;"><td>Caio Lima</td><td data-sheets-value="{&quot;1&quot;:3,&quot;3&quot;:11981918127}">11981918127</td></tr>
</tbody></table></google-sheets-html-origin>`;

describe("colar da planilha sem perder dígitos", () => {
  it("Excel: o x:num devolve o número inteiro", () => {
    const { texto, recuperados } = recuperarNumerosColados(TEXTO, EXCEL);
    expect(recuperados).toBe(2);
    expect(texto).toBe("Nome\tTelefone\nAna Prado\t5511981918127\nBia Reis\t5511984444333\nCaio Lima\t11981918127");
  });

  it("Google Planilhas: o data-sheets-value devolve o número inteiro", () => {
    const comPonto = TEXTO.replace(/5,51198E\+12/g, "5.51198E+12");
    const { texto, recuperados } = recuperarNumerosColados(comPonto, SHEETS);
    expect(recuperados).toBe(2);
    expect(texto.split("\n")[1]).toBe("Ana Prado\t5511981918127");
    expect(texto.split("\n")[2]).toBe("Bia Reis\t5511984444333");
  });

  it("LibreOffice: o sdval devolve o número inteiro", () => {
    const html = `<table><tr><td>Ana Prado</td><td sdval="5511981918127" sdnum="1046;0;Padrão">5,51198E+12</td></tr></table>`;
    expect(recuperarNumerosColados("Ana Prado\t5,51198E+12", html)).toEqual({
      texto: "Ana Prado\t5511981918127",
      recuperados: 1,
    });
  });

  it("linha que não bate com o texto não troca nada", () => {
    // O HTML tem a Bia onde o texto tem a Ana: trocar daria o número de uma para a outra.
    const trocado = EXCEL.replace("Ana&nbsp;Prado", "Outra Pessoa");
    const { texto, recuperados } = recuperarNumerosColados(TEXTO, trocado);
    expect(recuperados).toBe(1);
    expect(texto.split("\n")[1]).toBe("Ana Prado\t5,51198E+12");
  });

  it("valor escondido que não arredonda para o que a tela mostrava não entra", () => {
    const outro = EXCEL.replace('x:num="5511981918127"', 'x:num="5511991918127"');
    const { texto } = recuperarNumerosColados(TEXTO, outro);
    expect(texto.split("\n")[1]).toBe("Ana Prado\t5,51198E+12");
  });

  it("número de linhas diferente, sem HTML ou sem número cortado: o texto fica como veio", () => {
    const semUmaLinha = EXCEL.replace(/<tr height=20><td height=20>Caio[\s\S]*?<\/tr>/, "");
    expect(recuperarNumerosColados(TEXTO, semUmaLinha)).toEqual({ texto: TEXTO, recuperados: 0 });
    expect(recuperarNumerosColados(TEXTO, "")).toEqual({ texto: TEXTO, recuperados: 0 });
    const inteiro = "Ana\t5511981918127";
    expect(recuperarNumerosColados(inteiro, EXCEL)).toEqual({ texto: inteiro, recuperados: 0 });
  });

  it("formato interno do Google que mudou não quebra a colagem", () => {
    const quebrado = SHEETS.replace(/data-sheets-value="\{&quot;1&quot;:3[^"]*"/g, 'data-sheets-value="{quebrado"');
    expect(recuperarNumerosColados(TEXTO.replace(/,51198/g, ".51198"), quebrado).recuperados).toBe(0);
  });
});
