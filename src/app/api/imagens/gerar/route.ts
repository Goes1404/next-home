import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";
import { medirImagem } from "@/lib/imoveis/imagemDerivada";
import { gerarImagem, imagensConfiguradas } from "@/lib/imagens/gerarImagem";
import { getTetoDeHoje, registrarImagem } from "@/lib/imagens/galeria";
import { TAMANHOS, type ChaveQualidade, type ChaveTamanho } from "@/lib/imagens/imagensTipos";

export const runtime = "nodejs";
/**
 * 60s é o teto do plano Hobby, e não dá para esticar. `gerarImagem` aborta aos
 * 55s de propósito: melhor devolver "demorou demais" com o motivo escrito do
 * que a função ser morta pela plataforma e a tela receber um erro genérico.
 */
export const maxDuration = 60;

/**
 * Gerar uma imagem.
 *
 * É rota HTTP e não Server Action porque o corpo carrega BYTES de volta e a
 * espera é longa: action é para efeito com resposta curta. A referência não
 * sobe por aqui — ela já está no Storage, mandada direto pelo navegador (o
 * padrão de `importar/OrigemPdf.tsx`), e o que chega é só o caminho.
 */

const BUCKET = "empreendimentos";

export async function POST(req: NextRequest) {
  const corretor = await getCorretorLogado();
  if (!corretor) {
    return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  }
  if (!imagensConfiguradas()) {
    return NextResponse.json(
      { erro: "A geração de imagens não está configurada neste ambiente." },
      { status: 503 },
    );
  }

  const corpo = (await req.json().catch(() => null)) as {
    prompt?: string;
    tamanho?: ChaveTamanho;
    qualidade?: ChaveQualidade;
    referenciaPath?: string | null;
  } | null;

  const prompt = corpo?.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ erro: "Escreva o que você quer na imagem." }, { status: 400 });
  }

  // O teto é conferido ANTES de gastar a chamada — é a única coisa do painel
  // que custa dinheiro por clique.
  const teto = await getTetoDeHoje(corretor.id);
  if (teto.usadasHoje >= teto.teto) {
    return NextResponse.json(
      {
        erro: `Você já criou ${teto.teto} imagens hoje. O limite volta amanhã.`,
        teto,
      },
      { status: 429 },
    );
  }

  const formato = TAMANHOS.find((t) => t.chave === corpo?.tamanho) ?? TAMANHOS[0];
  const supabase = createServiceClient();

  let referencia: { bytes: Buffer; mime: string } | null = null;
  let referenciaUrl: string | null = null;
  if (corpo?.referenciaPath) {
    // O caminho vem do cliente, então é preciso confinar: só a pasta do
    // PRÓPRIO corretor. Sem isso, um caminho forjado leria arquivo alheio no
    // bucket e o mandaria para o modelo.
    const prefixo = `corretores/${corretor.id}/`;
    if (!corpo.referenciaPath.startsWith(prefixo)) {
      return NextResponse.json({ erro: "Referência inválida." }, { status: 400 });
    }
    const { data, error } = await supabase.storage.from(BUCKET).download(corpo.referenciaPath);
    if (error || !data) {
      return NextResponse.json({ erro: "Não deu para ler a foto de referência." }, { status: 400 });
    }
    referencia = { bytes: Buffer.from(await data.arrayBuffer()), mime: data.type || "image/png" };
    referenciaUrl = supabase.storage.from(BUCKET).getPublicUrl(corpo.referenciaPath).data.publicUrl;
  }

  const resultado = await gerarImagem({
    prompt,
    referencia,
    largura: formato.largura,
    altura: formato.altura,
    qualidade: corpo?.qualidade ?? "low",
  });

  if (!resultado.ok) {
    return NextResponse.json(
      { erro: fraseDoMotivo(resultado.motivo, resultado.detalhe), motivo: resultado.motivo },
      { status: resultado.motivo === "sem_credito" ? 402 : 502 },
    );
  }

  // Mesmo esquema de nome de `registrarMidia`: hash do conteúdo, o que torna o
  // upload idempotente. O prefixo `corretores/<id>/` já é coberto pela policy
  // de storage da 0015 — nenhum bucket novo, nenhuma policy nova.
  const hash = createHash("sha256").update(resultado.bytes).digest("hex").slice(0, 16);
  const caminho = `corretores/${corretor.id}/criacoes/${hash}.png`;

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, resultado.bytes, { contentType: resultado.mime, upsert: true });
  if (erroUpload) {
    return NextResponse.json(
      { erro: "A imagem foi criada mas não deu para guardar. Tente de novo." },
      { status: 500 },
    );
  }

  const url = supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
  const medida = await medirImagem(resultado.bytes);

  const imagem = await registrarImagem({
    corretorId: corretor.id,
    prompt,
    modelo: resultado.modelo,
    url,
    largura: medida?.largura ?? formato.largura,
    altura: medida?.altura ?? formato.altura,
    referenciaUrl,
    latenciaMs: resultado.latenciaMs,
  });

  return NextResponse.json({
    ok: true,
    imagem: imagem ?? {
      id: hash,
      prompt,
      url,
      largura: formato.largura,
      altura: formato.altura,
      referenciaUrl,
      criadaEm: new Date().toISOString(),
    },
    teto: { usadasHoje: teto.usadasHoje + 1, teto: teto.teto },
    latenciaMs: resultado.latenciaMs,
  });
}

/**
 * Cada motivo vira uma frase que diz o que fazer.
 *
 * `sem_credito` e `recusado` existem separados justamente para chegarem aqui
 * como frases diferentes: falta pagar é uma ação, pedido recusado é outra, e
 * "não deu para gerar" não é nenhuma das duas.
 */
function fraseDoMotivo(motivo: string, detalhe?: string): string {
  switch (motivo) {
    case "sem_credito":
      return "A conta de IA está sem crédito. Recarregue para voltar a gerar imagens.";
    case "recusado":
      return `O modelo recusou este pedido${detalhe ? `: ${detalhe}` : "."} Tente descrever de outro jeito.`;
    case "timeout":
      return "A imagem demorou demais e foi cancelada. Tente com qualidade Rápida.";
    case "http_429":
      return "Muitos pedidos de uma vez. Espere alguns segundos e tente de novo.";
    case "sem_api_key":
      return "A geração de imagens não está configurada neste ambiente.";
    default:
      return "Não deu para gerar a imagem agora. Tente de novo em instantes.";
  }
}
