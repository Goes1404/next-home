import { describe, expect, it } from "vitest";
import { impressoesDigitais, PACOTE_PADRAO, vinculosDoApp } from "./appAndroid";

const A = Array.from({ length: 32 }, (_, i) => (i * 7 % 256).toString(16).padStart(2, "0")).join(":");
const B = Array.from({ length: 32 }, () => "AB").join(":");

describe("assetlinks do app Android", () => {
  it("sem chave configurada: lista vazia (o app abre, só com a barra do navegador)", () => {
    expect(vinculosDoApp(undefined)).toEqual([]);
    expect(vinculosDoApp("")).toEqual([]);
  });

  it("aceita uma ou mais impressões, em minúsculas ou com espaços, e descarta as malformadas", () => {
    expect(impressoesDigitais(`${A.toLowerCase()}, ${B} , 12:34`)).toEqual([A.toUpperCase(), B]);
  });

  it("declara o pacote padrão com a relação que o Trusted Web Activity pede", () => {
    expect(vinculosDoApp(B)).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: PACOTE_PADRAO, sha256_cert_fingerprints: [B] },
      },
    ]);
  });

  it("o pacote pode vir da variável", () => {
    expect(vinculosDoApp(B, "com.exemplo.app")[0].target.package_name).toBe("com.exemplo.app");
  });
});
