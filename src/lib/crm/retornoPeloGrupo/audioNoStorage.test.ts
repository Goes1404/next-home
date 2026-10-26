import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    throw new Error("o teste passa o cliente");
  },
}));

import { bancoFalso } from "../../../../test/bancoFalso";
import {
  apagarAudiosGuardados,
  assinarAudiosDaFicha,
  caminhosDeAudioDaPessoa,
  caminhosDeAudioDosLeads,
  caminhosDeAudioPorLead,
} from "./audioNoStorage";

const G = "g-1";
const OUTRO = "g-2";

function cenario(opcoes: { falhaRemover?: boolean; falhaAssinar?: boolean } = {}) {
  const banco = bancoFalso({
    leads: [
      { id: "l1", grupo_id: G, telefone_e164: "+5511999990000", email: "Ana@x.com" },
      { id: "l2", grupo_id: G, telefone_e164: "+5511999990000", email: null },
      { id: "l3", grupo_id: G, telefone_e164: "+5511888880000", email: "ana@x.com" },
      { id: "l4", grupo_id: G, telefone_e164: "+5511777770000", email: "outra@x.com" },
      { id: "l5", grupo_id: OUTRO, telefone_e164: "+5511999990000", email: "ana@x.com" },
    ],
    retornos_de_ligacao: [
      { id: "r1", grupo_id: G, lead_id: "l1", audio_path: `${G}/m1.ogg` },
      { id: "r2", grupo_id: G, lead_id: "l2", audio_path: `${G}/m2.ogg` },
      { id: "r3", grupo_id: G, lead_id: "l3", audio_path: `${G}/m3.ogg` },
      { id: "r4", grupo_id: G, lead_id: "l4", audio_path: `${G}/m4.ogg` },
      { id: "r5", grupo_id: OUTRO, lead_id: "l5", audio_path: `${OUTRO}/m5.ogg` },
      { id: "r6", grupo_id: G, lead_id: "l1", audio_path: null },
      { id: "r7", grupo_id: G, lead_id: "l1", audio_path: `${OUTRO}/intruso.ogg` },
    ],
  });
  const removidos: string[] = [];
  const assinados: { caminhos: string[]; segundos: number }[] = [];
  (banco.cliente as unknown as Record<string, unknown>).storage = {
    from: (bucket: string) => ({
      remove: async (caminhos: string[]) => {
        if (opcoes.falhaRemover) return { data: null, error: { message: "fora do ar" } };
        removidos.push(...caminhos.map((c) => `${bucket}/${c}`));
        return { data: [], error: null };
      },
      createSignedUrls: async (caminhos: string[], segundos: number) => {
        assinados.push({ caminhos, segundos });
        if (opcoes.falhaAssinar) return { data: null, error: { message: "fora do ar" } };
        return { data: caminhos.map((path) => ({ path, signedUrl: `https://x/${bucket}/${path}?t=1`, error: null })), error: null };
      },
    }),
  };
  return { banco, removidos, assinados, servico: banco.cliente as never };
}

describe("caminhos de áudio de leads que vão ser excluídos", () => {
  it("lê só os do lead E do grupo dele, e só os que estão na pasta do grupo", async () => {
    const c = cenario();
    const caminhos = await caminhosDeAudioDosLeads(c.servico, [{ id: "l1", grupo_id: G }]);
    expect(caminhos).toEqual([`${G}/m1.ogg`]);
    const leitura = c.banco.consultas.find((q) => q.tabela === "retornos_de_ligacao");
    expect(leitura?.filtros).toEqual(expect.arrayContaining(["in:lead_id", "eq:grupo_id"]));
  });

  it("vários leads", async () => {
    const c = cenario();
    const caminhos = await caminhosDeAudioDosLeads(c.servico, [
      { id: "l1", grupo_id: G },
      { id: "l4", grupo_id: G },
    ]);
    expect(caminhos.sort()).toEqual([`${G}/m1.ogg`, `${G}/m4.ogg`]);
  });

  it("por lead: cada um com os seus (a exclusão em lote só apaga os de quem saiu)", async () => {
    const c = cenario();
    const mapa = await caminhosDeAudioPorLead(c.servico, [
      { id: "l1", grupo_id: G },
      { id: "l4", grupo_id: G },
    ]);
    expect(mapa.get("l1")).toEqual([`${G}/m1.ogg`]);
    expect(mapa.get("l4")).toEqual([`${G}/m4.ogg`]);
    expect(mapa.has("l2")).toBe(false);
  });

  it("sem lead, nem consulta", async () => {
    const c = cenario();
    expect(await caminhosDeAudioDosLeads(c.servico, [])).toEqual([]);
    expect(c.banco.consultas).toEqual([]);
  });

  it("se a leitura falha, devolve vazio (a exclusão não espera o Storage)", async () => {
    const c = cenario();
    (c.servico as unknown as { from: () => never }).from = () => {
      throw new Error("sem rede");
    };
    expect(await caminhosDeAudioDosLeads(c.servico, [{ id: "l1", grupo_id: G }])).toEqual([]);
  });
});

describe("caminhos de áudio da pessoa (pedido do titular)", () => {
  it("inclui as outras fichas do grupo com o mesmo telefone ou e-mail, e nada de outro grupo", async () => {
    const c = cenario();
    const caminhos = await caminhosDeAudioDaPessoa(c.servico, G, "l1");
    expect(caminhos.sort()).toEqual([`${G}/m1.ogg`, `${G}/m2.ogg`, `${G}/m3.ogg`]);
  });

  it("e-mail com % e _ não puxa o áudio de outra pessoa (o LIKE não é critério)", async () => {
    const c = cenario();
    c.banco.tabelas.leads.push(
      { id: "p1", grupo_id: G, telefone_e164: "+5511000000001", email: "a_%@x.com" },
      { id: "p2", grupo_id: G, telefone_e164: "+5511000000002", email: "abc@x.com" },
      { id: "p3", grupo_id: G, telefone_e164: "+5511000000003", email: "a_%@x.com.br" },
    );
    c.banco.tabelas.retornos_de_ligacao.push(
      { id: "rp1", grupo_id: G, lead_id: "p1", audio_path: `${G}/p1.ogg` },
      { id: "rp2", grupo_id: G, lead_id: "p2", audio_path: `${G}/p2.ogg` },
      { id: "rp3", grupo_id: G, lead_id: "p3", audio_path: `${G}/p3.ogg` },
    );
    expect(await caminhosDeAudioDaPessoa(c.servico, G, "p1")).toEqual([`${G}/p1.ogg`]);
  });

  it("lead de outro grupo não é lido", async () => {
    const c = cenario();
    expect(await caminhosDeAudioDaPessoa(c.servico, G, "l5")).toEqual([]);
  });
});

describe("apagar os áudios", () => {
  it("remove do bucket do retorno e diz que deu certo", async () => {
    const c = cenario();
    expect(await apagarAudiosGuardados(c.servico, [`${G}/m1.ogg`, `${G}/m2.ogg`])).toBe(true);
    expect(c.removidos).toEqual([`retornos-de-ligacao/${G}/m1.ogg`, `retornos-de-ligacao/${G}/m2.ogg`]);
  });

  it("sem caminho, não chama o Storage", async () => {
    const c = cenario();
    expect(await apagarAudiosGuardados(c.servico, [])).toBe(true);
    expect(c.removidos).toEqual([]);
  });

  it("falha no Storage não lança: devolve false", async () => {
    const c = cenario({ falhaRemover: true });
    expect(await apagarAudiosGuardados(c.servico, [`${G}/m1.ogg`])).toBe(false);
  });
});

describe("link do player na ficha", () => {
  it("assina por 1 hora só os caminhos da pasta do grupo do lead", async () => {
    const c = cenario();
    const urls = await assinarAudiosDaFicha(c.servico, G, [`${G}/m1.ogg`, `${OUTRO}/intruso.ogg`, `${G}/../${OUTRO}/x.ogg`]);
    expect(c.assinados).toEqual([{ caminhos: [`${G}/m1.ogg`], segundos: 3600 }]);
    expect(urls.get(`${G}/m1.ogg`)).toMatch(/^https:\/\//);
    expect(urls.has(`${OUTRO}/intruso.ogg`)).toBe(false);
  });

  it("sem caminho válido, não assina", async () => {
    const c = cenario();
    expect((await assinarAudiosDaFicha(c.servico, G, [`${OUTRO}/x.ogg`])).size).toBe(0);
    expect(c.assinados).toEqual([]);
  });

  it("se não assina, a ficha abre sem o player", async () => {
    const c = cenario({ falhaAssinar: true });
    expect((await assinarAudiosDaFicha(c.servico, G, [`${G}/m1.ogg`])).size).toBe(0);
  });
});
