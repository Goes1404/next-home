import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorDeMensagem } from "./EditorDeMensagem";

const base = {
  rotulo: "Texto",
  valor: "",
  aoMudar: () => {},
  marcadores: [{ chave: "cliente", nome: "Cliente" }],
  limite: 600,
};

describe("EditorDeMensagem", () => {
  it("a prévia mostra *negrito* como o WhatsApp e cada marcador vira botão", () => {
    const html = renderToStaticMarkup(<EditorDeMensagem {...base} valor="*Lead* {cliente}" previa="*Lead* Marina" />);
    expect(html).toContain("<strong>Lead</strong> Marina");
    expect(html).toContain("+ Cliente");
    expect(html).toContain("16/600 caracteres");
  });

  it("prévia vazia avisa que nada é enviado", () => {
    expect(renderToStaticMarkup(<EditorDeMensagem {...base} previa="  " />)).toContain("Em branco: nada é enviado.");
  });
});
