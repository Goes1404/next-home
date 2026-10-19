import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ehContaSoWhatsapp } from "./contaSoWhatsapp";
import { guardaOTextoDaConversa } from "./privacidadeDaConversa";

/*
 * Conta só WhatsApp (0180, 17/10/2026): a exceção declarada à regra da 0111.
 * A pessoa usa o painel como WhatsApp Web — todas as conversas do número
 * aparecem, quem não é lead NÃO vira lead, o texto é guardado e a IA fica
 * desligada. As guardas abaixo protegem as duas metades: a exceção funciona,
 * e ela não vaza para as outras contas.
 */

const migration = readFileSync("supabase/migrations/0180_conta_so_whatsapp.sql", "utf8");
const webhook = readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8");
const abertura = readFileSync("src/lib/whatsapp/aberturaPelaIA.ts", "utf8");
const repositorio = readFileSync("src/lib/whatsapp/repositorio.ts", "utf8");
const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("o banco só aceita conversa sem lead em conta só WhatsApp", () => {
  it("o trigger recusa para qualquer outra conta", () => {
    expect(migration).toMatch(/new\.lead_id is null and not exists/);
    expect(migration).toMatch(/c\.so_whatsapp/);
    expect(migration).toMatch(/raise exception/);
    expect(migration).toMatch(/before insert or update of lead_id, corretor_id on public\.whatsapp_conversas/);
  });

  it("a sessão não liga a marca sozinha: sem grant de update", () => {
    expect(migration).not.toMatch(/grant\s+update[^;]*so_whatsapp/i);
  });

  it("o sorteio do anúncio deixa a conta de fora; a roleta só a põe por último", () => {
    expect(migration).toMatch(/and not c\.so_whatsapp/);
    const roleta = migration.slice(
      migration.indexOf("create or replace function public.distribuir_lead"),
      migration.indexOf("create or replace function public.sortear_corretor_whatsapp"),
    );
    const where = roleta.slice(roleta.indexOf(" where c.ativo"), roleta.indexOf("order by"));
    expect(where, "a roleta filtraria: lead nasceria sem dono").not.toContain("so_whatsapp");
    expect(roleta.slice(roleta.indexOf("order by"))).toContain("c.so_whatsapp");
  });
});

describe("o texto é guardado só na conta que escolheu guardar", () => {
  it("conta só WhatsApp guarda até conversa sem lead", () => {
    expect(guardaOTextoDaConversa({ leadId: null }, { soWhatsapp: true })).toBe(true);
  });

  it("qualquer outra conta segue a régua de sempre", () => {
    expect(guardaOTextoDaConversa({ leadId: null }, { soWhatsapp: false })).toBe(false);
    expect(guardaOTextoDaConversa({ leadId: "l" }, { soWhatsapp: false })).toBe(true);
  });
});

describe("o webhook", () => {
  const codigo = semComentario(webhook);

  it("só abre conversa sem lead e sem convite na conta só WhatsApp", () => {
    expect(codigo).toContain("convite: instancia.soWhatsapp ? null : convite");
    expect(codigo).toContain("semLead: instancia.soWhatsapp");
  });

  it("conversa sem lead para logo depois de gravar, antes de qualquer efeito de CRM ou IA", () => {
    const parada = codigo.indexOf('action: "mensagem_registrada_sem_lead"');
    expect(parada).toBeGreaterThan(0);
    for (const depois of ["registrarRespostaDoLead(", "decidirSeAIaResponde(", "guardarMidiaRecebida("]) {
      expect(codigo.indexOf(depois), depois).toBeGreaterThan(parada);
    }
  });

  it("a palavra-chave não cadastra nada na conta só WhatsApp", () => {
    expect(codigo).toMatch(/fromMe && text && !instancia\.soWhatsapp/);
  });
});

describe("a IA não fala na conta só WhatsApp", () => {
  it("o modo do número vira 'desativado' na resolução da instância", () => {
    expect(semComentario(repositorio)).toContain('modoBot: soWhatsapp ? "desativado" : data.modo_bot');
  });

  it("o clique e a palavra-chave também param antes de gerar", () => {
    const codigo = semComentario(abertura);
    const checagem = codigo.indexOf("ehContaSoWhatsapp(");
    expect(checagem).toBeGreaterThan(0);
    expect(checagem).toBeLessThan(codigo.indexOf("travarDisparo("));
  });
});

describe("ehContaSoWhatsapp", () => {
  const cliente = (resposta: { data: unknown; error: unknown }) =>
    ({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => resposta }) }) }),
    }) as unknown as Parameters<typeof ehContaSoWhatsapp>[0];

  it("sem a migration (coluna inexistente) a conta é comum", async () => {
    expect(await ehContaSoWhatsapp(cliente({ data: null, error: { message: "column does not exist" } }), "c")).toBe(false);
  });

  it("lê a marca quando ela existe", async () => {
    expect(await ehContaSoWhatsapp(cliente({ data: { so_whatsapp: true }, error: null }), "c")).toBe(true);
    expect(await ehContaSoWhatsapp(cliente({ data: { so_whatsapp: false }, error: null }), "c")).toBe(false);
  });
});
