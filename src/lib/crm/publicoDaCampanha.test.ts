import { describe, expect, it } from "vitest";
import { elegivel } from "./publicoDaCampanha";
import type { Lead } from "@/lib/types";

/**
 * O público "abordado e sem resposta" (01/09/2026).
 *
 * Escolhido medindo: dos 112 leads ativos, **46 estão em "primeiro
 * contato"** — receberam disparo de campanha e nunca responderam — e
 * NENHUM filtro os alcançava. `novos_sem_contato` pega só `etapa = 'novo'`
 * (2 leads na base), `parados_15d` exige 15 dias desde a mudança de etapa
 * (eles têm 5), e `todos` incluiria quem já está conversando.
 */
function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: "1",
    nome: "Fulano",
    email: null,
    telefone: "11999990000",
    mensagem: null,
    tipo: "comprador",
    detalhes: null,
    origem: "site",
    criadoEm: new Date().toISOString(),
    etapa: "primeiro_contato",
    etapaAlteradaEm: new Date().toISOString(),
    origemAtribuicao: null,
    corretor: null,
    empreendimento: null,
    visitaAgendadaEm: null,
    tentativasSemResposta: 1,
    ...over,
  } as Lead;
}

describe("público: abordado e sem resposta", () => {
  it("entra quem foi abordado uma ou duas vezes e não respondeu", () => {
    expect(elegivel(lead({ tentativasSemResposta: 1 }), "sem_resposta")).toBe(true);
    expect(elegivel(lead({ tentativasSemResposta: 2 }), "sem_resposta")).toBe(true);
  });

  it("NÃO entra quem nunca foi abordado", () => {
    // Esse é o público do "quem acabou de chegar" — insistir com quem
    // ainda não ouviu nada não é reengajamento.
    expect(elegivel(lead({ tentativasSemResposta: 0 }), "sem_resposta")).toBe(false);
  });

  it("NÃO entra quem já foi cutucado três vezes", () => {
    /*
     * A ficha do lead já sugere parar em 3. A quarta não converte e
     * alimenta denúncia — o sinal mais forte contra o número, e a razão de
     * existir a janela comercial. Quem quiser insistir escolhe a dedo.
     */
    expect(elegivel(lead({ tentativasSemResposta: 3 }), "sem_resposta")).toBe(false);
    expect(elegivel(lead({ tentativasSemResposta: 7 }), "sem_resposta")).toBe(false);
  });

  it("respeita as regras de base: sem telefone, fechado e perdido nunca entram", () => {
    expect(elegivel(lead({ telefone: null }), "sem_resposta")).toBe(false);
    expect(elegivel(lead({ etapa: "fechado" }), "sem_resposta")).toBe(false);
    expect(elegivel(lead({ etapa: "perdido" }), "sem_resposta")).toBe(false);
  });

  it("é um público DIFERENTE dos que já existiam", () => {
    // O lead medido em produção: primeiro contato há 5 dias, abordado uma
    // vez, calado. Nenhum filtro antigo o pegava.
    const abordadoOntem = lead({
      etapa: "primeiro_contato",
      etapaAlteradaEm: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      tentativasSemResposta: 1,
    });

    expect(elegivel(abordadoOntem, "novos_sem_contato")).toBe(false);
    expect(elegivel(abordadoOntem, "parados_15d")).toBe(false);
    expect(elegivel(abordadoOntem, "sem_resposta")).toBe(true);
  });
});
