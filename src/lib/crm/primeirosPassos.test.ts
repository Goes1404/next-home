import { describe, expect, it } from "vitest";
import { configuracaoCompleta, passosDoCorretor, progressoDaConfiguracao } from "./primeirosPassos";

const nada = { whatsappConectado: false, faixasDeAgenda: 0, temFoto: false, temApresentacao: false, leads: 0 };
const tudo = { whatsappConectado: true, faixasDeAgenda: 2, temFoto: true, temApresentacao: true, leads: 10 };

describe("primeiros passos", () => {
  it("o WhatsApp vem primeiro: sem ele nada mais produz efeito", () => {
    expect(passosDoCorretor(nada)[0].id).toBe("whatsapp");
  });

  it("perfil só conta com foto E apresentação", () => {
    const p = passosDoCorretor({ ...nada, temFoto: true }).find((x) => x.id === "perfil")!;
    expect(p.feito).toBe(false);
  });

  it("progresso e completude", () => {
    expect(progressoDaConfiguracao(nada)).toEqual({ feitos: 0, total: 4 });
    expect(progressoDaConfiguracao({ ...nada, leads: 3 })).toEqual({ feitos: 1, total: 4 });
    expect(configuracaoCompleta(tudo)).toBe(true);
    expect(configuracaoCompleta({ ...tudo, faixasDeAgenda: 0 })).toBe(false);
  });

  it("todo passo diz por que importa e aponta para uma tela do painel", () => {
    for (const p of passosDoCorretor(nada)) {
      expect(p.porque.length).toBeGreaterThan(20);
      expect(p.href.startsWith("/corretor/")).toBe(true);
    }
  });
});
