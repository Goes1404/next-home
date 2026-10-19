import { describe, expect, it } from "vitest";
import { configuracaoCompleta, passosDoCorretor, progressoDaConfiguracao } from "./primeirosPassos";

const nada = { whatsappConectado: false, temFoto: false, temApresentacao: false, leads: 0 };
const tudo = { whatsappConectado: true, temFoto: true, temApresentacao: true, leads: 10 };

describe("primeiros passos", () => {
  it("o WhatsApp vem primeiro: sem ele nada mais produz efeito", () => {
    expect(passosDoCorretor(nada)[0].id).toBe("whatsapp");
  });

  it("perfil só conta com foto E apresentação", () => {
    const p = passosDoCorretor({ ...nada, temFoto: true }).find((x) => x.id === "perfil")!;
    expect(p.feito).toBe(false);
  });

  it("progresso e completude", () => {
    expect(progressoDaConfiguracao(nada)).toEqual({ feitos: 0, total: 3 });
    expect(progressoDaConfiguracao({ ...nada, leads: 3 })).toEqual({ feitos: 1, total: 3 });
    expect(configuracaoCompleta(tudo)).toBe(true);
    expect(configuracaoCompleta({ ...tudo, whatsappConectado: false })).toBe(false);
    // Agenda não é passo: sem ela vale a padrão.
    expect(passosDoCorretor(nada).some((p) => (p.id as string) === "agenda")).toBe(false);
  });

  it("todo passo diz por que importa e aponta para uma tela do painel", () => {
    for (const p of passosDoCorretor(nada)) {
      expect(p.porque.length).toBeGreaterThan(20);
      expect(p.href.startsWith("/corretor/")).toBe(true);
    }
  });
});
