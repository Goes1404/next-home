import { describe, expect, it } from "vitest";
import { videoEmbedUrl } from "./embedMidia";

describe("videoEmbedUrl — YouTube", () => {
  it("reconhece watch?v=", () => {
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=oczIKJOAnYM")).toBe(
      "https://www.youtube-nocookie.com/embed/oczIKJOAnYM",
    );
  });

  it("reconhece youtu.be encurtado", () => {
    expect(videoEmbedUrl("https://youtu.be/oczIKJOAnYM")).toBe(
      "https://www.youtube-nocookie.com/embed/oczIKJOAnYM",
    );
  });

  it("reconhece link já em formato embed (com ou sem -nocookie)", () => {
    expect(videoEmbedUrl("https://www.youtube.com/embed/oczIKJOAnYM")).toBe(
      "https://www.youtube-nocookie.com/embed/oczIKJOAnYM",
    );
    expect(videoEmbedUrl("https://www.youtube-nocookie.com/embed/oczIKJOAnYM")).toBe(
      "https://www.youtube-nocookie.com/embed/oczIKJOAnYM",
    );
  });

  it("ignora parâmetros extras na URL", () => {
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=oczIKJOAnYM&t=30s")).toBe(
      "https://www.youtube-nocookie.com/embed/oczIKJOAnYM",
    );
  });
});

describe("videoEmbedUrl — Vimeo", () => {
  it("reconhece link direto do vimeo.com", () => {
    expect(videoEmbedUrl("https://vimeo.com/123456789")).toBe(
      "https://player.vimeo.com/video/123456789",
    );
  });

  it("reconhece link já em formato player", () => {
    expect(videoEmbedUrl("https://player.vimeo.com/video/123456789")).toBe(
      "https://player.vimeo.com/video/123456789",
    );
  });
});

describe("videoEmbedUrl — não reconhecido", () => {
  it("retorna null pra um link que não é YouTube nem Vimeo (ex.: mp4 direto)", () => {
    expect(
      videoEmbedUrl(
        "https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/eternity-alphaville/tour.mp4",
      ),
    ).toBeNull();
  });
});
