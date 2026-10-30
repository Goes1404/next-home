import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, leiturasSemGrupo, type BancoFalso } from "../../../../../test/bancoFalso";

/**
 * O relatório semanal roda pela chave de serviço, que enxerga todos os
 * grupos. Somando o banco inteiro e mandando a todo gestor ativo, o gestor
 * do grupo B receberia os números do grupo A (L18). Cada gestor recebe só os
 * números do grupo dele.
 */

const GRUPO_A = "00000000-0000-0000-0000-00000000000a";
const GRUPO_B = "00000000-0000-0000-0000-00000000000b";

let banco: BancoFalso;
const enviados: { para: string; texto: string }[] = [];

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("@/lib/email", () => ({
  enviarEmail: async (e: { para: string; texto: string }) => {
    enviados.push({ para: e.para, texto: e.texto });
    return { enviado: true };
  },
}));
// O texto do e-mail vira os próprios números: o que se confere é QUAIS
// números chegaram a quem, não a redação.
vi.mock("@/lib/admin/relatorioSemanal", () => ({
  acharNoticias: () => [],
  assuntoDoRelatorio: () => "Relatório",
  corpoDoRelatorio: ({ numeros }: { numeros: unknown }) => ({ texto: JSON.stringify(numeros), html: "" }),
}));

// O resumo no WhatsApp (0246) sai pelo canal dos avisos ao corretor.
const noWhatsapp: { para: string; texto: string }[] = [];
vi.mock("@/lib/crm/avisoAoCorretor", () => ({
  avisarCorretor: async (_s: unknown, para: string, texto: string) => {
    noWhatsapp.push({ para, texto });
    return true;
  },
}));

const { GET } = await import("./route");

const recente = new Date().toISOString();

describe("/api/cron/relatorio-semanal", () => {
  beforeEach(() => {
    enviados.length = 0;
    banco = bancoFalso({
      grupos: [{ id: GRUPO_A }, { id: GRUPO_B }],
      corretores: [
        { id: "gestor-a", nome: "Ana", email: "ana@a", user_id: null, papel: "gestor", ativo: true, grupo_id: GRUPO_A },
        { id: "corretor-a", nome: "Caio", email: null, user_id: null, papel: "corretor", ativo: true, grupo_id: GRUPO_A },
        { id: "gestor-b", nome: "Bia", email: "bia@b", user_id: null, papel: "gestor", ativo: true, grupo_id: GRUPO_B },
      ],
      leads: [
        { id: "l1", created_at: recente, arquivado_em: null, grupo_id: GRUPO_A },
        { id: "l2", created_at: recente, arquivado_em: null, grupo_id: GRUPO_A },
        { id: "l3", created_at: recente, arquivado_em: null, grupo_id: GRUPO_A },
        { id: "l4", created_at: recente, arquivado_em: null, grupo_id: GRUPO_B },
      ],
      corretor_whatsapp_instancias: [{ status_conexao: "conectado", desconectado_em: null, grupo_id: GRUPO_A }],
      whatsapp_funil_metricas: [
        { corretor_id: "corretor-a", visitas_propostas: 5, visitas_agendadas: 2 },
        { corretor_id: "gestor-b", visitas_propostas: 1, visitas_agendadas: 1 },
      ],
      whatsapp_resposta_metricas: [
        { corretor_id: "corretor-a", conversas_com_fala_do_cliente: 10, conversas_atendidas: 8, mediana_segundos: 9 },
      ],
      whatsapp_campanhas_fila: [
        { status: "enviado", grupo_id: GRUPO_A },
        { status: "respondido", grupo_id: GRUPO_B },
      ],
      empreendimentos: [
        { slug: "a1", nome: "A1", nomes_alternativos: [], midias: [], tipologias: [], publicado: true, grupo_id: GRUPO_A },
        { slug: "b1", nome: "B1", nomes_alternativos: [], midias: [], tipologias: [], publicado: true, grupo_id: GRUPO_B },
        { slug: "b2", nome: "B2", nomes_alternativos: [], midias: [], tipologias: [], publicado: true, grupo_id: GRUPO_B },
      ],
    });
  });

  it("relatório semanal manda a cada gestor só os números do grupo dele", async () => {
    const resposta = await GET(new NextRequest("http://localhost/api/cron/relatorio-semanal"));
    expect(resposta.status).toBe(200);

    const para = Object.fromEntries(enviados.map((e) => [e.para, JSON.parse(e.texto)]));
    expect(Object.keys(para).sort()).toEqual(["ana@a", "bia@b"]);

    expect(para["ana@a"]).toMatchObject({
      leadsNovosNaSemana: 3,
      imoveisPublicados: 1,
      numeroNoAr: true,
      visitasPropostas: 5,
      conversasComFalaDoCliente: 10,
      campanhaEntregues: 1,
      campanhaRespostas: 0,
    });
    expect(para["bia@b"]).toMatchObject({
      leadsNovosNaSemana: 1,
      imoveisPublicados: 2,
      numeroNoAr: null,
      visitasPropostas: 1,
      conversasComFalaDoCliente: 0,
      campanhaEntregues: 1,
      campanhaRespostas: 1,
    });
  });
});

/*
 * O resumo da semana no WhatsApp do gestor (0246, 29/10/2026): só para quem
 * deixou ligado, com os números do PRÓPRIO grupo, uma vez por semana.
 */
describe("/api/cron/relatorio-semanal no WhatsApp do gestor", () => {
  const diasAtras = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

  beforeEach(() => {
    enviados.length = 0;
    noWhatsapp.length = 0;
    banco = bancoFalso({
      grupos: [{ id: GRUPO_A }, { id: GRUPO_B }],
      corretores: [
        { id: "gestor-a", nome: "Ana Souza", email: "ana@a", user_id: null, papel: "gestor", ativo: true, grupo_id: GRUPO_A, relatorio_semanal_whatsapp: true, relatorio_semanal_whatsapp_em: null },
        { id: "gestor-a2", nome: "Alice", email: null, user_id: null, papel: "gestor", ativo: true, grupo_id: GRUPO_A, relatorio_semanal_whatsapp: false, relatorio_semanal_whatsapp_em: null },
        { id: "corretor-a", nome: "Caio", email: null, user_id: null, papel: "corretor", ativo: true, grupo_id: GRUPO_A },
        { id: "gestor-b", nome: "Bia", email: "bia@b", user_id: null, papel: "gestor", ativo: true, grupo_id: GRUPO_B, relatorio_semanal_whatsapp: true, relatorio_semanal_whatsapp_em: null },
      ],
      leads: [
        // Grupo A: 2 na semana, 1 na anterior.
        { id: "l1", created_at: diasAtras(2), arquivado_em: null, grupo_id: GRUPO_A },
        { id: "l2", created_at: diasAtras(3), arquivado_em: null, grupo_id: GRUPO_A },
        { id: "l3", created_at: diasAtras(10), arquivado_em: null, grupo_id: GRUPO_A },
        // Grupo B: 5 na semana — não podem aparecer para a Ana.
        ...[1, 2, 3, 4, 5].map((i) => ({ id: `b${i}`, created_at: diasAtras(2), arquivado_em: null, grupo_id: GRUPO_B })),
      ],
      visitas: [
        { inicio: diasAtras(2), status: "realizada", grupo_id: GRUPO_A },
        { inicio: diasAtras(9), status: "realizada", grupo_id: GRUPO_A },
        { inicio: diasAtras(9), status: "cancelada", grupo_id: GRUPO_A },
        { inicio: diasAtras(2), status: "realizada", grupo_id: GRUPO_B },
      ],
      vendas: [
        { valor_venda: 450_000, data_venda: diasAtras(2).slice(0, 10), status: "ativa", grupo_id: GRUPO_A },
        { valor_venda: 900_000, data_venda: diasAtras(2).slice(0, 10), status: "ativa", grupo_id: GRUPO_B },
      ],
      corretor_whatsapp_instancias: [],
      whatsapp_funil_metricas: [],
      whatsapp_resposta_metricas: [],
      whatsapp_campanhas_fila: [],
      empreendimentos: [],
    });
  });

  it("vai a quem deixou ligado, com os números do grupo dele, comparados com a semana anterior", async () => {
    const resposta = await GET(new NextRequest("http://localhost/api/cron/relatorio-semanal"));
    expect(resposta.status).toBe(200);
    expect(noWhatsapp.map((m) => m.para).sort()).toEqual(["gestor-a", "gestor-b"]);

    const daAna = noWhatsapp.find((m) => m.para === "gestor-a")!.texto;
    expect(daAna).toContain("Leads novos: *2* · ↑ 1 (1 na anterior)");
    expect(daAna).toContain("Visitas feitas: *1* · igual à anterior");
    expect(daAna).toContain("Vendas: *1* (R$ 450 mil) · ↑ 1 (0 na anterior)");
    expect(daAna).not.toContain("900");

    const daBia = noWhatsapp.find((m) => m.para === "gestor-b")!.texto;
    expect(daBia).toContain("Leads novos: *5*");
    // O e-mail continua saindo como antes.
    expect(enviados.map((e) => e.para).sort()).toEqual(["ana@a", "bia@b"]);
  });

  it("uma vez por semana: o segundo disparo da mesma manhã não repete", async () => {
    await GET(new NextRequest("http://localhost/api/cron/relatorio-semanal"));
    await GET(new NextRequest("http://localhost/api/cron/relatorio-semanal"));
    expect(noWhatsapp.filter((m) => m.para === "gestor-a")).toHaveLength(1);
    expect(banco.tabelas.corretores.find((c) => c.id === "gestor-a")?.relatorio_semanal_whatsapp_em).toBeTruthy();
  });

  it("toda leitura de corretores, leads, visitas e vendas filtra o grupo", async () => {
    await GET(new NextRequest("http://localhost/api/cron/relatorio-semanal"));
    for (const tabela of ["corretores", "leads", "visitas", "vendas"]) {
      expect(leiturasSemGrupo(banco, tabela), tabela).toEqual([]);
    }
  });
});
