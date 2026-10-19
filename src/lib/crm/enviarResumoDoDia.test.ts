import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";
import { PARAMETROS_PADRAO } from "@/lib/credito/parametros";

/**
 * O resumo do dia cruza os imóveis publicados nas últimas 24h com os leads do
 * corretor ("3 leads seus combinam com X"). Pela chave de serviço, sem o
 * grupo, o corretor do grupo A recebia o imóvel do grupo B no WhatsApp dele,
 * com o link do painel para mandar a campanha (a mesma família da L13).
 */

const GRUPO_A = "00000000-0000-0000-0000-00000000000a";
const GRUPO_B = "00000000-0000-0000-0000-00000000000b";

let banco: BancoFalso;
const textos: string[] = [];

vi.mock("@/lib/whatsapp/provider", () => ({
  enviarMensagemWhatsapp: async (e: { texto: string }) => {
    textos.push(e.texto);
    return { enviado: true };
  },
}));
vi.mock("@/lib/credito/parametros", async (original) => ({
  ...(await original<typeof import("@/lib/credito/parametros")>()),
  getParametrosCredito: async () => PARAMETROS_PADRAO,
}));

const { enviarResumosDoDia } = await import("./enviarResumoDoDia");

// Terça, 9h em São Paulo: dentro da janela do resumo.
const AGORA = new Date("2026-10-20T12:00:00Z");
const hNa = (horas: number) => new Date(AGORA.getTime() - horas * 3600_000).toISOString();

const imovel = (nome: string, grupo: string) => ({
  nome,
  slug: nome.toLowerCase(),
  cidade: "Barueri",
  bairro: "Centro",
  preco_a_partir: null,
  tipologias: [{ dormitorios: 2 }],
  publicado: true,
  created_at: hNa(2),
  grupo_id: grupo,
});

describe("enviarResumosDoDia", () => {
  beforeEach(() => {
    textos.length = 0;
    banco = bancoFalso({
      corretor_whatsapp_instancias: [{ corretor_id: "corretor-a", instance_name: "a", status_conexao: "conectado", grupo_id: GRUPO_A }],
      corretores: [
        {
          id: "corretor-a",
          nome: "Ana",
          whatsapp: "5511990000001",
          ativo: true,
          grupo_id: GRUPO_A,
          resumo_diario_em: null,
          resumo_hora: null,
          resumo_fim_de_semana: null,
        },
      ],
      empreendimentos: [imovel("Lancamento do Grupo B", GRUPO_B), imovel("Lancamento do Grupo A", GRUPO_A)],
      leads: [
        {
          id: "lead-a",
          corretor_id: "corretor-a",
          grupo_id: GRUPO_A,
          regiao_interesse: "Barueri",
          dormitorios_min: null,
          orcamento_max: null,
          renda_mensal: null,
          arquivado_em: null,
          nao_contatar_em: null,
          etapa: "primeiro_contato",
          created_at: hNa(72),
        },
      ],
    });
  });

  it("resumo do dia só cruza imóvel novo do grupo do corretor", async () => {
    await enviarResumosDoDia(banco.cliente as never, AGORA);
    expect(textos).toHaveLength(1);
    expect(textos[0]).toContain("Lancamento do Grupo A");
    expect(textos[0]).not.toContain("Lancamento do Grupo B");
  });
});
