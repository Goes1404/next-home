import { describe, expect, it } from "vitest";
import {
  assinarMensagem,
  cumprimentarPeloNome,
  mensagemDeFollowupDoCrm,
  mensagemParaEnviar,
  nomeDoCorretor,
  primeiroNome,
} from "./abordagem";

const IMOBILIARIA =
  "Oi, tudo bem? Aqui é o Eduardo, da Astro Soluções, aqui da região. Criamos um CRM com IA que responde os leads da imobiliária no WhatsApp na hora. Posso te mostrar em 2 minutos como ficaria na Bendito Imóvel?";
const CORRETOR =
  "Oi, tudo bem? Aqui é o Eduardo, da Astro Soluções, aqui da região. Fizemos um CRM com IA para corretor. Posso te mostrar em 2 minutos?";

describe("mensagem assinada por quem está logado (20/11/2026)", () => {
  it("pega o primeiro nome cadastrado na equipe", () => {
    expect(primeiroNome("Matheus Goes")).toBe("Matheus");
    expect(primeiroNome("  eduardo ")).toBe("Eduardo");
    expect(primeiroNome("")).toBe("");
    expect(primeiroNome(null)).toBe("");
  });

  it("troca o Eduardo da mensagem gravada pelo nome de quem envia, sem artigo", () => {
    expect(assinarMensagem(IMOBILIARIA, "Matheus Goes")).toContain("Aqui é Matheus, da Astro Soluções, aqui da região.");
    expect(assinarMensagem(IMOBILIARIA, "Eduardo")).toContain("Aqui é Eduardo, da Astro Soluções");
    expect(assinarMensagem("Aqui é a Bruna, da Astro Soluções.", "Matheus")).toBe("Aqui é Matheus, da Astro Soluções.");
  });

  it("sem nome, ou mensagem escrita à mão, sai como está", () => {
    expect(assinarMensagem(IMOBILIARIA, null)).toBe(IMOBILIARIA);
    expect(assinarMensagem("Bom dia! Vi seu anúncio.", "Matheus")).toBe("Bom dia! Vi seu anúncio.");
  });

  it("acha o nome da pessoa no perfil do corretor, só quando é nome conhecido", () => {
    expect(nomeDoCorretor("Sabrina Broetto Corretora | CRECI: 212.745-F")).toBe("Sabrina");
    expect(nomeDoCorretor("Corretor de Imóveis | Emerson Lopes")).toBe("Emerson");
    expect(nomeDoCorretor("APEPVOCE | Isaque Brito | Corretor na Lapa SP")).toBe("Isaque");
    expect(nomeDoCorretor("VALDIRENE GOMES - Corretora de Imóveis")).toBe("Valdirene");
    expect(nomeDoCorretor("Otávia Baad Negócios Imobiliários")).toBe("Otávia");
    expect(nomeDoCorretor("KF Brokers")).toBe("");
    expect(nomeDoCorretor("Acqua Park Barueri Corretor Tavares")).toBe("");
  });

  it("põe o nome do corretor no Oi", () => {
    expect(cumprimentarPeloNome(CORRETOR, "Sabrina")).toMatch(/^Oi, Sabrina, tudo bem\? /);
    expect(cumprimentarPeloNome(CORRETOR, "")).toBe(CORRETOR);
  });

  it("monta a mensagem final: assinada, e com o nome só para corretor", () => {
    expect(mensagemParaEnviar(CORRETOR, { nomeDeQuemEnvia: "Matheus Goes", segmento: "corretor", nomeDoLead: "Raquel Pereira – Corretora de Imóveis" })).toBe(
      "Oi, Raquel, tudo bem? Aqui é Matheus, da Astro Soluções, aqui da região. Fizemos um CRM com IA para corretor. Posso te mostrar em 2 minutos?",
    );
    const imob = mensagemParaEnviar(IMOBILIARIA, { nomeDeQuemEnvia: "Eduardo", segmento: "imobiliaria", nomeDoLead: "Marcos Tadashy Imoveis Ltda" });
    expect(imob).toMatch(/^Oi, tudo bem\? Aqui é Eduardo,/);
  });

  it("o follow-up do CRM não manda link de amostra", () => {
    const m = mensagemDeFollowupDoCrm();
    expect(m).not.toContain("/astro/amostra/");
    expect(m).toContain("7 dias grátis");
    expect(m).toContain("https://astroimob.vercel.app");
  });
});
