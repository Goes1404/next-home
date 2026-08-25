import { describe, expect, it } from "vitest";
import { validarUrlMidiaExterna, videoEmbedUrl } from "./embedMidia";

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

describe("videoEmbedUrl — os formatos que o corretor cola do celular", () => {
  it("aceita watch com parâmetro antes do v= (share do app mobile)", () => {
    expect(videoEmbedUrl("https://www.youtube.com/watch?app=desktop&v=oczIKJOAnYM")).toBe(
      "https://www.youtube-nocookie.com/embed/oczIKJOAnYM",
    );
  });

  it("aceita youtu.be com o rastreador ?si= do botão compartilhar", () => {
    expect(videoEmbedUrl("https://youtu.be/oczIKJOAnYM?si=AbCdEf123")).toBe(
      "https://www.youtube-nocookie.com/embed/oczIKJOAnYM",
    );
  });

  it("aceita Shorts, live e m.youtube", () => {
    expect(videoEmbedUrl("https://www.youtube.com/shorts/oczIKJOAnYM")).toBe(
      "https://www.youtube-nocookie.com/embed/oczIKJOAnYM",
    );
    expect(videoEmbedUrl("https://www.youtube.com/live/oczIKJOAnYM")).toBe(
      "https://www.youtube-nocookie.com/embed/oczIKJOAnYM",
    );
    expect(videoEmbedUrl("https://m.youtube.com/watch?v=oczIKJOAnYM")).toBe(
      "https://www.youtube-nocookie.com/embed/oczIKJOAnYM",
    );
  });

  it("não confunde a home nem a página de canal com vídeo", () => {
    expect(videoEmbedUrl("https://www.youtube.com/")).toBeNull();
    expect(videoEmbedUrl("https://www.youtube.com/@nexthome")).toBeNull();
  });

  it("vídeo não listado do Vimeo mantém a chave de acesso", () => {
    expect(videoEmbedUrl("https://vimeo.com/123456789/abc123def")).toBe(
      "https://player.vimeo.com/video/123456789?h=abc123def",
    );
  });

  it("vídeo do Google Drive vira /preview — /view não embuti", () => {
    expect(videoEmbedUrl("https://drive.google.com/file/d/1AbC-dEf_2/view?usp=sharing")).toBe(
      "https://drive.google.com/file/d/1AbC-dEf_2/preview",
    );
  });

  it("host parecido com o do Drive não passa", () => {
    expect(videoEmbedUrl("https://xdrive.google.com/file/d/1AbC-dEf_2/view")).toBeNull();
  });
});

describe("validarUrlMidiaExterna", () => {
  it("aceita o link que vem do app do YouTube no celular", () => {
    const r = validarUrlMidiaExterna("video", "https://www.youtube.com/watch?app=desktop&v=oczIKJOAnYM");
    expect(r.ok).toBe(true);
  });

  it("aceita vídeo do Google Drive", () => {
    expect(validarUrlMidiaExterna("video", "https://drive.google.com/file/d/1AbC-dEf_2/view").ok).toBe(true);
  });

  it("aceita arquivo direto com querystring (link assinado de storage)", () => {
    expect(
      validarUrlMidiaExterna("video", "https://exemplo.com/tour.mp4?token=abc").ok,
    ).toBe(true);
  });

  it("recusa rede social, e a mensagem diz o que fazer", () => {
    const r = validarUrlMidiaExterna("video", "https://www.instagram.com/reel/Abc123/");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("Instagram");
  });

  it("recusa http — o navegador bloquearia dentro do site", () => {
    expect(validarUrlMidiaExterna("video", "http://www.youtube.com/watch?v=oczIKJOAnYM").ok).toBe(false);
  });
});
