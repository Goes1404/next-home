import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";
import { semComentarios } from "@/lib/grupos/codigoFonte";
import { acessoAindaVale, MOTIVO_PADRAO, normalizarMotivo, VALIDADE_DO_ACESSO_MS } from "./acessoDeSuporte";

/**
 * A visão de suporte de UMA conta (0243, 29/10/2026). A regra do produto e
 * da política de privacidade: o administrador da plataforma nunca vê
 * conversa, mensagem, dossiê, nota nem identidade de lead. Aqui: leads e
 * visitas só CONTADOS (`head: true`) e sempre no grupo da rota; o acesso só
 * vale se for do próprio administrador, para este grupo, e recente.
 */

const GRUPO = "00000000-0000-4000-8000-0000000000a1";
const OUTRO = "00000000-0000-4000-8000-0000000000b2";
const AGORA = new Date("2026-10-29T15:00:00Z");
const PROVA = { userId: "u-admin" };

let banco: BancoFalso;

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));

const { lerAcessoDeSuporte, lerEquipeDoSuporte, lerFunilEmNumeros } = await import("./visaoDeSuporte");

const lead = (grupo: string, etapa: string, criado: string, arquivado: string | null = null) => ({
  grupo_id: grupo,
  etapa,
  created_at: criado,
  arquivado_em: arquivado,
  nome: "Cliente Secreto",
  telefone: "5511999999999",
  email: "cliente@exemplo.com",
});

beforeEach(() => {
  banco = bancoFalso({
    leads: [
      lead(GRUPO, "novo", "2026-10-28T10:00:00Z"),
      lead(GRUPO, "novo", "2026-10-10T10:00:00Z"),
      lead(GRUPO, "visita_agendada", "2026-08-01T10:00:00Z"),
      lead(GRUPO, "perdido", "2026-08-01T10:00:00Z", "2026-09-01T10:00:00Z"),
      lead(OUTRO, "novo", "2026-10-28T10:00:00Z"),
    ],
    visitas: [
      { grupo_id: GRUPO, status: "marcada", inicio: "2026-10-30T13:00:00Z" },
      { grupo_id: GRUPO, status: "marcada", inicio: "2026-10-20T13:00:00Z" },
      { grupo_id: GRUPO, status: "cancelada", inicio: "2026-10-31T13:00:00Z" },
      { grupo_id: OUTRO, status: "marcada", inicio: "2026-10-30T13:00:00Z" },
    ],
    corretores: [
      { id: "c1", grupo_id: GRUPO, nome: "Ana", papel: "gestor", ativo: true, creci: "12345-F", user_id: "u1", email: "ana@x.com", whatsapp: "5511" },
      { id: "c2", grupo_id: GRUPO, nome: "Bia", papel: "corretor", ativo: true, creci: "PENDENTE-abc", user_id: null, email: null, whatsapp: "5511" },
      { id: "c3", grupo_id: OUTRO, nome: "Outra", papel: "gestor", ativo: true, creci: "1", user_id: "u3", email: null, whatsapp: "5511" },
    ],
    corretor_whatsapp_instancias: [
      { grupo_id: GRUPO, corretor_id: "c1", status_conexao: "conectado", conectado_em: "2026-10-01T00:00:00Z", desconectado_em: null, instance_name: "segredo" },
      { grupo_id: OUTRO, corretor_id: "c3", status_conexao: "conectado", conectado_em: null, desconectado_em: null, instance_name: "x" },
    ],
    acessos_de_suporte: [
      { id: "a-ok", grupo_alvo_id: GRUPO, admin_user_id: "u-admin", criado_em: "2026-10-29T14:30:00Z", motivo: "Atendimento de suporte" },
      { id: "a-velho", grupo_alvo_id: GRUPO, admin_user_id: "u-admin", criado_em: "2026-10-29T12:00:00Z", motivo: null },
      { id: "a-de-outro-admin", grupo_alvo_id: GRUPO, admin_user_id: "u-outro", criado_em: "2026-10-29T14:30:00Z", motivo: null },
      { id: "a-outro-grupo", grupo_alvo_id: OUTRO, admin_user_id: "u-admin", criado_em: "2026-10-29T14:30:00Z", motivo: null },
    ],
  });
});

describe("lerFunilEmNumeros", () => {
  it("conta por etapa, os novos dos 7 e 30 dias e as visitas a fazer, só deste grupo", async () => {
    const funil = await lerFunilEmNumeros(PROVA, GRUPO, AGORA);
    expect(funil.porEtapa.novo).toBe(2);
    expect(funil.porEtapa.visita_agendada).toBe(1);
    expect(funil.porEtapa.perdido).toBe(0);
    expect(funil).toMatchObject({ arquivados: 1, criadosEm7Dias: 1, criadosEm30Dias: 2, visitasMarcadas: 1 });
  });

  it("nenhuma linha de lead nem de visita volta: toda consulta é contagem filtrada pelo grupo", async () => {
    await lerFunilEmNumeros(PROVA, GRUPO, AGORA);
    const consultas = banco.consultas.filter((c) => c.tabela === "leads" || c.tabela === "visitas");
    expect(consultas.length).toBe(14);
    for (const c of consultas) {
      expect(c.operacao).toBe("select");
      expect(c.filtros).toContain("eq:grupo_id");
    }
  });
});

describe("lerAcessoDeSuporte", () => {
  it("vale o acesso recente do próprio administrador para este grupo", async () => {
    expect(await lerAcessoDeSuporte(PROVA, GRUPO, "a-ok", AGORA)).toEqual({
      id: "a-ok",
      criadoEm: "2026-10-29T14:30:00Z",
      motivo: "Atendimento de suporte",
    });
  });

  it("não vale: vencido, de outro administrador ou de outro grupo", async () => {
    expect(await lerAcessoDeSuporte(PROVA, GRUPO, "a-velho", AGORA)).toBeNull();
    expect(await lerAcessoDeSuporte(PROVA, GRUPO, "a-de-outro-admin", AGORA)).toBeNull();
    expect(await lerAcessoDeSuporte(PROVA, GRUPO, "a-outro-grupo", AGORA)).toBeNull();
    expect(await lerAcessoDeSuporte(PROVA, GRUPO, "nao-existe", AGORA)).toBeNull();
  });
});

describe("lerEquipeDoSuporte", () => {
  it("a equipe do grupo com CRECI, login e status do WhatsApp; nada de outro grupo", async () => {
    (banco.cliente.auth as { admin: { getUserById: unknown } }).admin.getUserById = async (id: string) => ({
      data: { user: { id, last_sign_in_at: "2026-10-28T09:00:00Z" } },
      error: null,
    });
    const equipe = await lerEquipeDoSuporte(PROVA, GRUPO);
    expect(equipe).toEqual([
      {
        corretorId: "c1",
        nome: "Ana",
        papel: "gestor",
        ativo: true,
        creciOk: true,
        temLogin: true,
        ultimoAcesso: "2026-10-28T09:00:00Z",
        whatsapp: [{ status: "conectado", desde: "2026-10-01T00:00:00Z" }],
      },
      { corretorId: "c2", nome: "Bia", papel: "corretor", ativo: true, creciOk: false, temLogin: false, ultimoAcesso: null, whatsapp: [] },
    ]);
    for (const c of banco.consultas) expect(c.filtros).toContain("eq:grupo_id");
  });
});

describe("regras do acesso", () => {
  it("motivo: vazio vira o padrão, espaços aparados, longo demais recusado", () => {
    expect(normalizarMotivo("")).toBe(MOTIVO_PADRAO);
    expect(normalizarMotivo(null)).toBe(MOTIVO_PADRAO);
    expect(normalizarMotivo("  IA   muda ")).toBe("IA muda");
    expect(normalizarMotivo("a".repeat(201))).toBeNull();
  });

  it("o acesso vale 2 horas", () => {
    const agora = new Date("2026-10-29T15:00:00Z");
    expect(acessoAindaVale(new Date(agora.getTime() - VALIDADE_DO_ACESSO_MS).toISOString(), agora)).toBe(true);
    expect(acessoAindaVale(new Date(agora.getTime() - VALIDADE_DO_ACESSO_MS - 1000).toISOString(), agora)).toBe(false);
    expect(acessoAindaVale("lixo", agora)).toBe(false);
  });
});

/**
 * Lendo o código-fonte: além da guarda geral (`servicoComGrupo.test.ts`),
 * nenhuma leitura da visão de suporte pede coluna de identidade de lead nem
 * do número de WhatsApp, e a página não usa a chave direto.
 */
describe("a visão de suporte não lê identidade", () => {
  const leitor = semComentarios(readFileSync("src/lib/plataforma/visaoDeSuporte.ts", "utf8"));
  const pagina = semComentarios(readFileSync("src/app/plataforma/grupos/[id]/suporte/page.tsx", "utf8"));

  it("as projeções não trazem telefone, e-mail, número nem conteúdo", () => {
    const projecoes = [...leitor.matchAll(/\.select\(\s*"([^"]*)"/g)].map((m) => m[1]);
    expect(projecoes.length).toBeGreaterThanOrEqual(5);
    for (const p of projecoes) {
      expect(p).not.toMatch(/\b(telefone|email|whatsapp|mensagem|instance_name|qrcode_base64|detalhes|nome_cliente)\b/);
    }
  });

  it("leads e visitas só aparecem como contagem", () => {
    for (const m of leitor.matchAll(/\.from\("(leads|visitas)"\)\s*\.select\(([^)]*)\)/g)) {
      expect(m[2]).toMatch(/head:\s*true/);
    }
    expect([...leitor.matchAll(/\.from\("(leads|visitas)"\)/g)].length).toBe(5);
  });

  it("a página chama a guarda antes de tudo e não usa a chave", () => {
    expect(pagina).not.toMatch(/createServiceClient/);
    const corpo = pagina.slice(pagina.indexOf("export default async function"));
    const guarda = corpo.indexOf("exigirAdminDaPlataformaNaPagina(");
    expect(guarda).toBeGreaterThan(0);
    for (const leitura of ["lerGrupoDaPlataforma(", "lerAcessoDeSuporte(", "lerFunilEmNumeros(", "lerEquipeDoSuporte(", "lerLimitesDetalhados("]) {
      expect(corpo.indexOf(leitura)).toBeGreaterThan(guarda);
    }
    // Os números só depois de conferido o acesso registrado.
    const conferido = corpo.indexOf("if (!acesso)");
    expect(corpo.indexOf("lerFunilEmNumeros(")).toBeGreaterThan(conferido);
    expect(corpo.indexOf("lerEquipeDoSuporte(")).toBeGreaterThan(conferido);
  });
});
