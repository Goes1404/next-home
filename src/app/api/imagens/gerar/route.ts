import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";
import { medirImagem } from "@/lib/imoveis/imagemDerivada";
import { gerarImagem, imagensConfiguradas } from "@/lib/imagens/gerarImagem";
import { getTetoDeHoje, registrarImagem } from "@/lib/imagens/galeria";
import { TAMANHOS, type ChaveQualidade, type ChaveTamanho } from "@/lib/imagens/imagensTipos";
import { montarPedido, receitaPor } from "@/lib/imagens/receitas";
import { getEmpreendimentoDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { comporArte } from "@/lib/imagens/compor";
import { restricoesDuras } from "@/lib/imagens/diretorCriativo";
import { montarBriefing, problemasDaCopy, type Copy } from "@/lib/imagens/marketing";
import { site } from "@/lib/site";
import type { BriefingGravado } from "@/lib/imagens/imagensTipos";

export const runtime = "nodejs";
/**
 * 60s é o teto do plano Hobby, e não dá para esticar. `gerarImagem` aborta aos
 * 45s de propósito, deixando 15s para o upload dos 1-3 MB e a linha da
 * galeria: melhor devolver "demorou demais" com o motivo escrito do que a
 * função ser morta pela plataforma DEPOIS de a imagem já ter sido paga.
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
    receita?: string;
    referenciaPath?: string | null;
    // Modo "arte": peça de marketing composta, decidida pelo briefing.
    modo?: "livre" | "arte";
    imovelSlug?: string | null;
    objetivo?: string;
    canal?: string;
    publico?: string;
    cena?: string;
    titulo?: string;
    apoio?: string;
    cta?: string;
    usarFotoReal?: boolean;
  } | null;

  const modoArte = corpo?.modo === "arte";

  // ---- Modo arte: o briefing decide tamanho, referência e o que a copy pode dizer
  let arte: {
    canal: ReturnType<typeof montarBriefing>["canal"];
    copy: Copy;
    briefingGravado: BriefingGravado;
    fotoReal: string | null;
  } | null = null;

  let prompt: string;
  let pedidoCompleto: string;

  if (modoArte) {
    const cena = corpo?.cena?.trim();
    if (!cena || !corpo?.objetivo || !corpo.canal || !corpo.publico) {
      return NextResponse.json({ erro: "Monte o briefing antes de criar a arte." }, { status: 400 });
    }
    const imovel = corpo.imovelSlug ? await getEmpreendimentoDoPainel(corpo.imovelSlug) : null;
    const briefing = montarBriefing({
      imovel,
      objetivo: corpo.objetivo as never,
      canal: corpo.canal as never,
      publico: corpo.publico as never,
    });
    const copy: Copy = {
      titulo: corpo.titulo?.trim() ?? "",
      apoio: corpo.apoio?.trim() ?? "",
      cta: corpo.cta?.trim() ?? "",
    };
    // O corretor pode ter editado a copy — e é aqui que a régua de
    // publicidade vale de novo. Recusar com o motivo escrito é o serviço.
    const problemas = problemasDaCopy(copy);
    if (problemas.length > 0) {
      return NextResponse.json(
        { erro: `A copy não pode ir assim: ${problemas.join("; ")}.`, problemas },
        { status: 400 },
      );
    }
    prompt = cena;
    // O rabo determinístico vai de novo aqui porque a pessoa pode ter
    // editado a cena e apagado a restrição sem querer.
    pedidoCompleto = `${cena} ${restricoesDuras(briefing)}`;
    arte = {
      canal: briefing.canal,
      copy,
      fotoReal: corpo.usarFotoReal === false ? null : briefing.fotoDeReferencia,
      briefingGravado: {
        objetivo: briefing.objetivo.chave,
        canal: briefing.canal.chave,
        publico: briefing.publico.chave,
        imovelSlug: imovel?.slug ?? null,
        imovelNome: imovel?.nome ?? null,
        ...copy,
      },
    };
  } else {
    const p = corpo?.prompt?.trim();
    if (!p) {
      return NextResponse.json({ erro: "Escreva o que você quer na imagem." }, { status: 400 });
    }
    prompt = p;
    // A espinha da receita entra por CÓDIGO, aqui, antes de qualquer IA: quem
    // escolheu "mobiliar ambiente vazio" já leva junto o "mantenha a mesma
    // arquitetura e o mesmo ângulo" sem ter de saber que isso se pede.
    pedidoCompleto = montarPedido(p, receitaPor(corpo?.receita));
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

  const formato = arte
    ? { largura: arte.canal.geracao.largura, altura: arte.canal.geracao.altura }
    : (TAMANHOS.find((t) => t.chave === corpo?.tamanho) ?? TAMANHOS[0]);
  const supabase = createServiceClient();

  let referencia: { bytes: Buffer; mime: string } | null = null;
  let referenciaUrl: string | null = null;
  if (arte?.fotoReal) {
    // A foto real do imóvel como ponto de partida: é o que faz a arte mostrar
    // ESTE prédio, e não um prédio qualquer. Se o download falhar, a geração
    // segue sem referência — arte sem a foto é melhor que arte nenhuma.
    try {
      const r = await fetch(arte.fotoReal);
      if (r.ok) {
        referencia = {
          bytes: Buffer.from(await r.arrayBuffer()),
          mime: r.headers.get("content-type") || "image/jpeg",
        };
        referenciaUrl = arte.fotoReal;
      }
    } catch {
      /* segue sem referência */
    }
  } else if (corpo?.referenciaPath) {
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
    prompt: pedidoCompleto,
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

  // ---- A arte composta: marca + copy + ressalva, no tamanho do canal.
  let arteUrl: string | null = null;
  if (arte) {
    try {
      const rodape = `${corretor.nome} · ${site.url.replace(/^https?:\/\//, "")}`;
      const png = await comporArte({ imagem: resultado.bytes, canal: arte.canal, copy: arte.copy, rodape });
      const caminhoArte = `corretores/${corretor.id}/criacoes/${hash}-${arte.canal.chave}.png`;
      const { error: erroArte } = await supabase.storage
        .from(BUCKET)
        .upload(caminhoArte, png, { contentType: "image/png", upsert: true });
      if (!erroArte) arteUrl = supabase.storage.from(BUCKET).getPublicUrl(caminhoArte).data.publicUrl;
      else console.error("[imagens] arte não guardada:", erroArte.message);
    } catch (e) {
      // A imagem crua já está salva e paga. Compor falhar não pode apagar isso.
      console.error("[imagens] falha ao compor a arte:", e instanceof Error ? e.message : e);
    }
  }

  const imagem = await registrarImagem({
    corretorId: corretor.id,
    // A galeria guarda o que o CORRETOR escreveu, não o pedido montado. Ela é
    // lista de trabalho — o cartão precisa dizer "sala de estar, tons claros"
    // e não um parágrafo de lente e temperatura de luz. A espinha é
    // determinística e ele a recupera escolhendo a mesma receita de novo.
    prompt,
    modelo: resultado.modelo,
    url,
    largura: medida?.largura ?? formato.largura,
    altura: medida?.altura ?? formato.altura,
    referenciaUrl,
    latenciaMs: resultado.latenciaMs,
    arteUrl,
    briefing: arte?.briefingGravado ?? null,
  });

  return NextResponse.json({
    ok: true,
    imagem: imagem ?? {
      id: hash,
      prompt,
      url,
      arteUrl,
      briefing: arte?.briefingGravado ?? null,
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
