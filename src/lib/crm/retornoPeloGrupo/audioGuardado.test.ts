import { describe, expect, it } from "vitest";
import {
  BUCKET_DO_AUDIO,
  RETORNO_PELO_GRUPO,
  caminhosDeAudioValidos,
  lerRetornoDaInteracao,
  textoDoResultado,
} from "./audioGuardado";

const G = "7d9c4a52-1111-4222-8333-944455556666";
const OUTRO = "aaaaaaaa-1111-4222-8333-944455556666";

describe("caminhosDeAudioValidos", () => {
  it("fica só com o que está na pasta do grupo", () => {
    expect(caminhosDeAudioValidos([`${G}/m1.ogg`, `${OUTRO}/m2.ogg`, `${G}/m3.mp3`], G)).toEqual([`${G}/m1.ogg`, `${G}/m3.mp3`]);
  });

  it("descarta vazio, nulo, repetido e o que não é texto", () => {
    expect(caminhosDeAudioValidos([null, undefined, "", 42, `${G}/m1.ogg`, `${G}/m1.ogg`], G)).toEqual([`${G}/m1.ogg`]);
  });

  it("não aceita subir de pasta nem prefixo parecido", () => {
    expect(caminhosDeAudioValidos([`${G}/../${OUTRO}/m.ogg`, `${G}x/m.ogg`, `${G}/`, G, `${G}/a/b.ogg`], G)).toEqual([]);
  });

  it("grupo vazio ou torto não valida nada", () => {
    expect(caminhosDeAudioValidos([`/m.ogg`, `${G}/m.ogg`], "")).toEqual([]);
    expect(caminhosDeAudioValidos([`${G}/m.ogg`], "../x")).toEqual([]);
  });

  it("o bucket é o privado do retorno", () => {
    expect(BUCKET_DO_AUDIO).toBe("retornos-de-ligacao");
  });
});

describe("textoDoResultado", () => {
  it.each([
    ["atendeu", "Atendeu"],
    ["nao_atendeu", "Não atendeu"],
    ["numero_errado", "Número errado"],
    ["pediu_retorno", "Pediu retorno"],
  ])("%s vira %s", (resultado, texto) => {
    expect(textoDoResultado(resultado)).toBe(texto);
  });

  it("valor desconhecido não aparece cru na tela", () => {
    expect(textoDoResultado("qualquer_coisa")).toBeNull();
    expect(textoDoResultado(null)).toBeNull();
    expect(textoDoResultado(3)).toBeNull();
  });
});

describe("lerRetornoDaInteracao", () => {
  it("só a ligação que veio do grupo é retorno", () => {
    const detalhes = { origem: "grupo_whatsapp", resultado: "atendeu", mensagem_id: "m1", audio_path: `${G}/m1.ogg` };
    expect(lerRetornoDaInteracao("ligacao", detalhes)).toEqual({ resultado: "Atendeu", audioPath: `${G}/m1.ogg` });
    expect(lerRetornoDaInteracao("nota", detalhes)).toBeNull();
    expect(lerRetornoDaInteracao("ligacao", { origem: "painel" })).toBeNull();
    expect(lerRetornoDaInteracao("ligacao", null)).toBeNull();
    expect(lerRetornoDaInteracao("ligacao", "texto")).toBeNull();
  });

  it("sem áudio ou sem resultado, devolve o que há", () => {
    expect(lerRetornoDaInteracao("ligacao", { origem: "grupo_whatsapp" })).toEqual({ resultado: null, audioPath: null });
    expect(lerRetornoDaInteracao("ligacao", { origem: "grupo_whatsapp", audio_path: "" })).toEqual({ resultado: null, audioPath: null });
  });

  it("o rótulo da linha é o combinado", () => {
    expect(RETORNO_PELO_GRUPO).toBe("📞 Retorno da ligação (pelo grupo)");
  });
});
