import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const chat = readFileSync(join(process.cwd(), "src/app/corretor/(painel)/conversas/Chat.tsx"), "utf8");

describe("perfil do lead dentro da conversa", () => {
  it("abre pelo cabeçalho e substitui o chat por uma tela de detalhes", () => {
    expect(chat).toContain("Abrir perfil do lead");
    expect(chat).toMatch(/if \(fichaAberta && conversa\.temLead\)[\s\S]*return <PerfilLead/);
    expect(chat).toContain("Voltar para a conversa");
  });

  it("mantém as ações essenciais do perfil a um toque", () => {
    expect(chat).toContain('href={`tel:${conversa.telefone}`}');
    expect(chat).toContain('/corretor/anotacoes?lead=${ficha.leadId}');
    expect(chat).toContain('/corretor/leads/${ficha.leadId}');
  });
});
