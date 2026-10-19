import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../../../test/bancoFalso";

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
