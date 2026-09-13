import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repositorio = readFileSync("src/lib/whatsapp/repositorio.ts", "utf8");
const webhook = readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/0111_conversa_so_existe_para_lead.sql", "utf8");
const paginaConversas = readFileSync("src/app/corretor/(painel)/conversas/page.tsx", "utf8");
const pessoas = readFileSync("src/lib/crm/pessoas.ts", "utf8");

/*
 * A regra da 0111 ganhou uma exceção em 13/09/2026, e esta guarda foi
 * REESCRITA em vez de apagada — ela cumpriu o papel dela, obrigando a
 * mudança a ser explícita.
 *
 * O que mudou: a 0111 fechou o webhook para número desconhecido, e isso
 * fechou junto a porta que o anúncio PAGA para abrir — a pessoa clicava,
 * escrevia, e a mensagem morria sem resposta e sem rastro no CRM. Hoje há
 * UMA exceção: quem responde a uma peça nossa (a mensagem pronta do link
 * porteiro, ou uma frase que o próprio corretor cadastrou) vira cadastro.
 *
 * O que NÃO mudou, e é o que estas asserções protegem: sem convite, nada.
 * Conversa da família no número pessoal do corretor continua não virando
 * lead, nem conversa, nem gravação — que é a razão inteira da 0111.
 */
describe("conversa de WhatsApp só existe para lead cadastrado", () => {
  it("a busca do lead NUNCA insere — ela só procura", () => {
    const inicio = repositorio.indexOf("async function encontrarLeadCadastrado");
    const fim = repositorio.indexOf("async function cadastrarLeadDeConvite", inicio);
    expect(inicio, "a busca do lead sumiu").toBeGreaterThan(0);
    expect(fim, "o cadastro por convite sumiu — a âncora do recorte não vale").toBeGreaterThan(
      inicio,
    );
    expect(repositorio.slice(inicio, fim)).not.toMatch(/\.from\("leads"\)\s*\.insert/);
  });

  it("cadastrar só acontece sob CONVITE, nunca por mensagem qualquer", () => {
    const chamadas = [...repositorio.matchAll(/cadastrarLeadDeConvite\(supabase, params\)/g)];
    // Duas: a conversa nova e a antiga sem lead. Zero significaria que o
    // caminho morreu; uma solta, que um dos dois ramos cadastra sem convite.
    expect(chamadas, "o cadastro por convite mudou de forma").toHaveLength(2);
    for (const chamada of chamadas) {
      const antes = repositorio.slice(Math.max(0, chamada.index - 120), chamada.index);
      expect(antes, "cadastro sem a trava do convite").toContain("params.convite ?");
    }
    // Sem lead e sem convite, a conversa não nasce.
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
