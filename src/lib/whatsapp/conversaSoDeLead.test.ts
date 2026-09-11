import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repositorio = readFileSync("src/lib/whatsapp/repositorio.ts", "utf8");
const webhook = readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/0111_conversa_so_existe_para_lead.sql", "utf8");
const paginaConversas = readFileSync("src/app/corretor/(painel)/conversas/page.tsx", "utf8");
const pessoas = readFileSync("src/lib/crm/pessoas.ts", "utf8");

describe("conversa de WhatsApp só existe para lead cadastrado", () => {
  it("não cria lead automaticamente a partir de mensagem", () => {
    const inicio = repositorio.indexOf("async function encontrarLeadCadastrado");
    const fim = repositorio.indexOf("export async function preencherNomeContato", inicio);
    expect(repositorio.slice(inicio, fim)).not.toMatch(/\.from\("leads"\)\s*\.insert/);
    expect(repositorio).toContain("if (!leadId) return null");
  });

  it("barra número desconhecido antes de transcrever áudio", () => {
    const porteiro = webhook.indexOf('ignored: "numero_sem_lead_cadastrado"');
    const transcricao = webhook.indexOf("transcreverAudioWhatsapp(audioUrlOrBase64)");
    expect(porteiro).toBeGreaterThan(0);
    expect(porteiro).toBeLessThan(transcricao);
  });

  it("o banco exige lead e apaga a conversa quando ele é excluído", () => {
    expect(migration).toMatch(/alter column lead_id set not null/i);
    expect(migration).toMatch(/references public\.leads\(id\) on delete cascade/i);
  });

  it("as duas listas também escondem estoque antigo sem lead", () => {
    expect(paginaConversas).toContain('.not("lead_id", "is", null)');
    expect(pessoas).toContain('.not("lead_id", "is", null)');
  });
});
