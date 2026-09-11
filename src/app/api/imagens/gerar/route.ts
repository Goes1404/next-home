import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";
import { medirImagem } from "@/lib/imoveis/imagemDerivada";
import { gerarImagem, imagensConfiguradas } from "@/lib/imagens/gerarImagem";
import { getTetoDeHoje, registrarImagem } from "@/lib/imagens/galeria";
import { TAMANHOS, type ChaveQualidade, type ChaveTamanho } from "@/lib/imagens/imagensTipos";
import { montarPedido, receitaPor } from "@/lib/imagens/receitas";
import { carimbarRessalva } from "@/lib/imagens/carimbo";
import { classificarFalhaDeStorage } from "@/lib/imagens/falhaDeStorage";
import { getEmpreendimentoDoPainel } from "@/lib/imoveis/catalogoDoPainel";

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
    referenciaPaths?: string[] | null;
    /**
     * Uma foto do CATÁLOGO como base, escolhida na faixa do chat.
     *
     * Separado de `referenciaPath` de propósito: aquele é caminho de arquivo e
     * precisa ser confinado à pasta do corretor, porque um caminho forjado
     * leria arquivo alheio. Aqui vem um ID de linha, e quem decide o acesso é
     * a RLS — o `select` roda com o cliente de SESSÃO, então mídia de imóvel
     * que ele não pode ver simplesmente volta vazia.
     */
    midiaId?: string | null;
    imovelSlug?: string | null;
  } | null;

  /*
   * O imóvel a que esta arte pertence (0101). Até aqui o vínculo existia só
   * como texto dentro do `briefing` (`imovelSlug`), o que não é vínculo: slug
   * muda quando o imóvel é renomeado e ninguém consegue perguntar ao banco
   * "quais artes são deste imóvel". Resolvido pelo cliente COM sessão, então
   * a RLS já responde por quem pode ver o quê — slug de imóvel alheio volta
   * nulo e a imagem nasce avulsa, sem vazar nada.
   */
  let empreendimentoId: string | null = null;

  const p = corpo?.prompt?.trim();
  if (!p) {
    return NextResponse.json({ erro: "Escreva o que você quer na imagem." }, { status: 400 });
  }
  const prompt = p;
  // A espinha da receita entra por CÓDIGO, aqui, antes de qualquer IA: quem
  // escolheu "mobiliar ambiente vazio" já leva junto o "mantenha a mesma
  // arquitetura e o mesmo ângulo" sem ter de saber que isso se pede.
  const pedidoCompleto = montarPedido(p, receitaPor(corpo?.receita));
  // O cadastro de imóvel (`/corretor/imoveis/novo`) gera no modo livre e
  // manda o slug que acabou de nascer — é o que amarra a arte ao imóvel.
  if (corpo?.imovelSlug) {
    empreendimentoId = (await getEmpreendimentoDoPainel(corpo.imovelSlug))?.id ?? null;
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

  const referencias: { bytes: Buffer; mime: string }[] = [];
  const referenciasUrl: string[] = [];
  if (corpo?.midiaId) {
    /*
     * A foto do imóvel como base. Nenhuma confinação de caminho aqui: o
     * recorte é a RLS, que é fonte de verdade e não precisa ser repetida em
     * JavaScript. Mídia de imóvel que este corretor não enxerga volta nula.
     */
    const { data: midia } = await supabase
      .from("midias")
      .select("url, empreendimento_id")
      .eq("id", corpo.midiaId)
      .maybeSingle();

    if (!midia?.url) {
      return NextResponse.json({ erro: "Essa foto não está disponível." }, { status: 400 });
    }

    const baixada = await fetch(midia.url);
    if (!baixada.ok) {
      return NextResponse.json({ erro: "Não deu para ler a foto do imóvel." }, { status: 400 });
    }
    referencias.push({
      bytes: Buffer.from(await baixada.arrayBuffer()),
      mime: baixada.headers.get("content-type") || "image/jpeg",
    });
    referenciasUrl.push(midia.url);
    // A arte nasce ligada ao imóvel da foto — é o vínculo que a 0101 criou e
    // que estava nulo nas 8 gerações da vida inteira.
    empreendimentoId = empreendimentoId ?? midia.empreendimento_id ?? null;
  } else if (Array.isArray(corpo?.referenciaPaths) && corpo.referenciaPaths.length > 0) {
    // O caminho vem do cliente, então é preciso confinar: só a pasta do
    // PRÓPRIO corretor. Sem isso, um caminho forjado leria arquivo alheio no
    // bucket e o mandaria para o modelo.
    const prefixo = `corretores/${corretor.id}/`;
    const paths = [...new Set(corpo.referenciaPaths)].slice(0, 4);
    if (paths.length !== corpo.referenciaPaths.length || paths.some((path) => !path.startsWith(prefixo))) {
      return NextResponse.json({ erro: "Referência inválida." }, { status: 400 });
    }
    for (const path of paths) {
      const { data, error } = await supabase.storage.from(BUCKET).download(path);
      if (error || !data) {
        return NextResponse.json({ erro: "Não deu para ler uma das fotos de referência." }, { status: 400 });
      }
      referencias.push({ bytes: Buffer.from(await data.arrayBuffer()), mime: data.type || "image/png" });
      referenciasUrl.push(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
    }
  }

  const resultado = await gerarImagem({
    prompt: pedidoCompleto,
    referencias,
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

  /*
   * A ressalva legal entra AQUI, por código, antes de a imagem existir como
   * arquivo. É o que separa uma perspectiva ilustrativa de uma promessa ao
   * cliente, e não se pede ao modelo: ele acerta o literal 3 em 4, ótimo para
   * manchete e inaceitável para aviso legal.
   *
   * Carimbar antes do hash é de propósito — o que é guardado, o que a galeria
   * mostra e o que o corretor baixa passam a ser o MESMO arquivo, já marcado.
   * Carimbar depois deixaria uma versão sem aviso no bucket.
   */
  const marcada = await carimbarRessalva(resultado.bytes, resultado.mime);

  // Mesmo esquema de nome de `registrarMidia`: hash do conteúdo, o que torna o
  // upload idempotente. O prefixo `corretores/<id>/` já é coberto pela policy
  // de storage da 0015 — nenhum bucket novo, nenhuma policy nova.
  const hash = createHash("sha256").update(marcada.bytes).digest("hex").slice(0, 16);
  const caminho = `corretores/${corretor.id}/criacoes/${hash}.png`;

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, marcada.bytes, { contentType: marcada.mime, upsert: true });
  if (erroUpload) {
    /*
     * A arte já foi PAGA quando se chega aqui, e uma frase só obrigaria quem
     * investiga a abrir o terminal do servidor para saber se o caso é limite,
     * tipo, permissão ou uma piscada de rede — quatro consertos diferentes
     * atrás da mesma tela. O motivo é tipado e vai junto para o cliente.
     */
    const falha = classificarFalhaDeStorage(erroUpload.message, erroUpload.statusCode);
    console.error("[imagens] falha ao guardar arte gerada", {
      motivo: falha.motivo,
      mensagem: erroUpload.message,
      status: erroUpload.statusCode,
      caminho,
      bytes: marcada.bytes.length,
      mime: marcada.mime,
    });
    return NextResponse.json(
      { erro: falha.mensagem, motivo: falha.motivo, valeTentarDeNovo: falha.valeTentarDeNovo },
      { status: 500 },
    );
  }

  const url = supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
  const medida = await medirImagem(marcada.bytes);

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
    referenciaUrl: referenciasUrl[0] ?? null,
    latenciaMs: resultado.latenciaMs,
    empreendimentoId,
  });

  return NextResponse.json({
    ok: true,
    imagem: imagem ?? {
      id: hash,
      prompt,
      url,
      largura: formato.largura,
      altura: formato.altura,
      referenciaUrl: referenciasUrl[0] ?? null,
      empreendimentoId,
      criadaEm: new Date().toISOString(),
    },
    /*
     * `false` só quando o carimbo falhou — e a tela é OBRIGADA a dizer isso.
     * A imagem já foi paga, então recusar a entrega seria queimar dinheiro de
     * quem não errou; o que não pode é ela sair achando que tem a ressalva.
     */
    comRessalva: marcada.carimbada,
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
