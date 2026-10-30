import { describe, expect, it } from "vitest";
import {
  INTERVALO_AUTOMATICO_MS,
  INTERVALO_DO_BOTAO_MS,
  RESUMOS_POR_DIA,
  TETO_DA_LINHA,
  cacheDaLinha,
  decidirResumo,
  falasParaOResumo,
  lerSaidaDoResumo,
  montarPromptDoResumo,
  resumoDesatualizado,
  type FalaDaConversa,
} from "./resumoDaConversa";
import { TEXTO_NAO_GUARDADO } from "@/lib/whatsapp/privacidadeDaConversa";
import { AUDIO_TRANSCREVENDO } from "@/lib/whatsapp/transcricaoNoGrupo";

/*
 * As regras do cache do resumo da conversa (30/10/2026): quando chamar a IA,
 * quando servir o cache, e os tetos de custo.
 */
const AGORA = new Date("2026-10-30T15:00:00Z");
const antes = (ms: number) => new Date(AGORA.getTime() - ms).toISOString();

const base = {
  agora: AGORA,
  forcar: false,
  resumosHoje: 0,
  semCota: false,
  totalDeFalas: 6,
};

describe("decidirResumo", () => {
  it("sem cache e com conversa: gera", () => {
    expect(decidirResumo({ ...base, cache: null, ultimaMensagemEm: antes(1000) })).toBe("gerar");
  });

  it("conversa curta demais (ou nenhuma): não chama", () => {
    expect(decidirResumo({ ...base, cache: null, ultimaMensagemEm: null })).toBe("sem_conversa");
    expect(decidirResumo({ ...base, cache: null, ultimaMensagemEm: antes(1000), totalDeFalas: 1 })).toBe("sem_conversa");
  });

  it("sem mensagem nova desde o cache: em dia, sem chamada", () => {
    const cache = { geradoEm: antes(3_600_000), ate: antes(4_000_000) };
    expect(decidirResumo({ ...base, cache, ultimaMensagemEm: antes(4_000_000) })).toBe("em_dia");
  });

  it("mensagem nova: refaz sozinho, mas no máximo a cada 10 min", () => {
    const recente = { geradoEm: antes(INTERVALO_AUTOMATICO_MS - 1000), ate: antes(INTERVALO_AUTOMATICO_MS) };
    expect(decidirResumo({ ...base, cache: recente, ultimaMensagemEm: antes(1000) })).toBe("espera");
    const velho = { geradoEm: antes(INTERVALO_AUTOMATICO_MS + 1000), ate: antes(INTERVALO_AUTOMATICO_MS + 2000) };
    expect(decidirResumo({ ...base, cache: velho, ultimaMensagemEm: antes(1000) })).toBe("gerar");
  });

  it("o botão força, respeitando o intervalo de 1 min", () => {
    const agoraMesmo = { geradoEm: antes(INTERVALO_DO_BOTAO_MS - 1000), ate: antes(INTERVALO_DO_BOTAO_MS) };
    expect(decidirResumo({ ...base, forcar: true, cache: agoraMesmo, ultimaMensagemEm: antes(INTERVALO_DO_BOTAO_MS) })).toBe("em_dia");
    const ha2min = { geradoEm: antes(2 * 60_000), ate: antes(3 * 60_000) };
    expect(decidirResumo({ ...base, forcar: true, cache: ha2min, ultimaMensagemEm: antes(3 * 60_000) })).toBe("gerar");
  });

  it("cota do mês esgotada ou teto do dia: não chama", () => {
    expect(decidirResumo({ ...base, cache: null, ultimaMensagemEm: antes(1000), semCota: true })).toBe("sem_cota");
    expect(decidirResumo({ ...base, cache: null, ultimaMensagemEm: antes(1000), resumosHoje: RESUMOS_POR_DIA })).toBe("teto_do_dia");
    expect(decidirResumo({ ...base, cache: null, ultimaMensagemEm: antes(1000), resumosHoje: RESUMOS_POR_DIA - 1 })).toBe("gerar");
  });
});

describe("resumoDesatualizado", () => {
  it("sem cache com conversa, ou mensagem depois do cache", () => {
    expect(resumoDesatualizado(null, antes(10))).toBe(true);
    expect(resumoDesatualizado({ ate: antes(100) }, antes(10))).toBe(true);
    expect(resumoDesatualizado({ ate: antes(10) }, antes(10))).toBe(false);
    expect(resumoDesatualizado(null, null)).toBe(false);
  });
});

describe("falasParaOResumo", () => {
  it("tira marcadores (áudio, sem texto guardado), ordena e corta nas 40 mais recentes", () => {
    const falas: FalaDaConversa[] = [
      { remetente: "cliente", texto: TEXTO_NAO_GUARDADO, em: antes(5000) },
      { remetente: "cliente", texto: AUDIO_TRANSCREVENDO, em: antes(4000) },
      { remetente: "cliente", texto: "  ", em: antes(3000) },
      { remetente: "corretor", texto: "Oi, tudo bem?", em: antes(2000) },
      { remetente: "cliente", texto: "Quero ver o apartamento", em: antes(1000) },
    ];
    expect(falasParaOResumo(falas).map((f) => f.texto)).toEqual(["Oi, tudo bem?", "Quero ver o apartamento"]);
    const muitas = Array.from({ length: 60 }, (_, i) => ({ remetente: "cliente" as const, texto: `fala ${i}`, em: antes((60 - i) * 1000) }));
    const cortadas = falasParaOResumo(muitas);
    expect(cortadas).toHaveLength(40);
    expect(cortadas.at(-1)?.texto).toBe("fala 59");
  });
});

describe("montarPromptDoResumo", () => {
  const falas: FalaDaConversa[] = [
    { remetente: "cliente", texto: "Oi", em: antes(2000) },
    { remetente: "corretor", texto: "Olá!", em: antes(1000) },
    { remetente: "bot", texto: "Posso ajudar?", em: antes(500) },
  ];

  it("imobiliária: corretor, imóvel, visita", () => {
    const prompt = montarPromptDoResumo({ ramo: "imobiliaria", falas });
    expect(prompt).toContain("uma imobiliária");
    expect(prompt).toContain("para o corretor");
    expect(prompt).toContain("Ligar hoje para confirmar a visita de sábado");
    expect(prompt).toContain("Corretor: Olá!");
    expect(prompt).toContain("Assistente (IA): Posso ajudar?");
  });

  it("outro ramo: vocabulário dele, nada de imóvel", () => {
    const prompt = montarPromptDoResumo({ ramo: "advocacia", falas });
    expect(prompt).toContain("escritório de advocacia");
    expect(prompt).toContain("para o advogado");
    expect(prompt).toContain("confirmar a consulta");
    expect(prompt).toContain("Advogado: Olá!");
    expect(prompt).not.toMatch(/imóvel|imobili|corretor|visita/i);
  });

  it("serviços (compromisso masculino) e o texto livre do Outro", () => {
    expect(montarPromptDoResumo({ ramo: "servicos", falas })).toContain("confirmar o atendimento");
    expect(montarPromptDoResumo({ ramo: "outro", ramoDescricao: "Clínica veterinária", falas })).toContain('ramo "Clínica veterinária"');
  });
});

describe("lerSaidaDoResumo e cacheDaLinha", () => {
  it("exige o que o cliente quer e o próximo passo; normaliza o resto", () => {
    expect(lerSaidaDoResumo({ quer: "Apto 2 dorms", proximoPasso: "" })).toBeNull();
    expect(lerSaidaDoResumo(null)).toBeNull();
    const r = lerSaidaDoResumo({
      quer: "  Apartamento   de 2 dormitórios ",
      objecoes: "null",
      combinado: "Visita sábado 10h",
      proximoPasso: "Ligar hoje",
      temperatura: "fervendo",
    });
    expect(r).toEqual({
      quer: "Apartamento de 2 dormitórios",
      objecoes: null,
      combinado: "Visita sábado 10h",
      proximoPasso: "Ligar hoje",
      temperatura: null,
    });
  });

  it("corta a linha longa no teto", () => {
    const r = lerSaidaDoResumo({ quer: "x".repeat(500), proximoPasso: "Ligar" });
    expect(r?.quer.length).toBe(TETO_DA_LINHA);
  });

  it("o cache só vale com as duas datas", () => {
    const resumo = { quer: "A", proximoPasso: "B" };
    expect(cacheDaLinha({ resumo_conversa: resumo, resumo_conversa_em: null, resumo_conversa_ate: antes(1) })).toBeNull();
    expect(cacheDaLinha({ resumo_conversa: resumo, resumo_conversa_em: antes(1), resumo_conversa_ate: antes(2) })?.resumo.quer).toBe("A");
  });
});
