"use server";

import { revalidatePath } from "next/cache";
import { revalidarCatalogo } from "@/lib/catalogo/revalidar";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { extrairImagensDePdf, TETO_IMAGENS } from "@/lib/imoveis/pdfImagens";
import { gerarPreview, sharpDisponivel } from "@/lib/imoveis/imagemDerivada";
import { registrarMidia } from "@/lib/imoveis/registrarMidia";
import { baixarArquivo, listarPasta, parsearLinkDrive, type ArquivoDrive } from "@/lib/imoveis/drive";
import { montarRascunhoDePdf, montarRascunhoDeTexto, type RascunhoCadastro } from "@/lib/imoveis/rascunhoDePdf";
import { buscarSeguro } from "@/lib/imoveis/site/buscarSeguro";
import {
  chaveDaFoto,
  lerPaginaDaConstrutora,
  type DicasEstruturadas,
  type ImagemDoSite,
  type MidiaDoSite,
} from "@/lib/imoveis/site/lerPagina";
import { youtubeId } from "@/lib/embedMidia";
import { lerPlanta } from "@/lib/imoveis/lerPlanta";
import { extrairTextoDePdf } from "@/lib/leads/pdfTexto";
import { limparTextoDeApresentacao } from "@/lib/imoveis/textoDoDeck";
import type { Database } from "@/lib/supabase/types";

type AtualizacaoEmpreendimento = Database["public"]["Tables"]["empreendimentos"]["Update"];

export type ItemCurado = {
  /** Posição na extração. A extração é determinística, então isto é identidade. */
  indice: number;
  preview: string;
  largura: number;
  altura: number;
  parecePlanta: boolean;
  parecePaginaInteira: boolean;
  /** Escala de cinza: letreiro, logo ou recorte — não é foto. */
  pareceGrafismo: boolean;
};

export type AnaliseDoPdf =
  | { ok: true; itens: ItemCurado[]; avisos: string[] }
  | { ok: false; erro: string };

/**
 * Lê a apresentação já guardada no Storage e devolve as prévias do que dá
 * para extrair dela.
 *
 * O arquivo NÃO chega por aqui: quem o envia é o navegador, direto para o
 * Storage. Server Action tem teto de corpo (12 MB neste projeto, por causa
 * da importação de leads) e um deck de construtora passa disso com folga —
 * mandar o PDF pela action obrigaria a afrouxar esse teto para TODAS as
 * actions do sistema. Assim os bytes nunca cruzam a função, o que também
 * preserva o orçamento de 60s do plano Hobby.
 *
 * O PDF fica no Storage porque a curadoria acontece numa requisição
 * diferente. Guardar UM arquivo é mais barato que guardar as sessenta
 * imagens extraídas dele — e como a extração é determinística, o índice de
 * cada imagem continua valendo quando o corretor mandar gravar.
 */
export async function analisarPdf(caminhoStaging: string): Promise<AnaliseDoPdf> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  const supabase = await createClient();
  const baixado = await supabase.storage.from("empreendimentos").download(caminhoStaging);
  if (baixado.error || !baixado.data) {
    return { ok: false, erro: "Não encontrei o arquivo que você acabou de enviar. Tente escolher de novo." };
  }

  const bytes = Buffer.from(await baixado.data.arrayBuffer());
  const extraidas = extrairImagensDePdf(bytes);

  const avisos: string[] = [];
  for (const { codec, quantidade } of extraidas.naoSuportadas) {
    avisos.push(
      `${quantidade} ${quantidade === 1 ? "imagem" : "imagens"} em um formato que ainda não sei ler (${codec}).`,
    );
  }
  if (extraidas.descartadasPorTamanho > 0) {
    avisos.push(
      `${extraidas.descartadasPorTamanho} imagens pequenas demais foram ignoradas — costumam ser logo e ícone.`,
    );
  }
  if (extraidas.mascarasIgnoradas > 0) {
    avisos.push(
      `${extraidas.mascarasIgnoradas} ${extraidas.mascarasIgnoradas === 1 ? "recorte de transparência foi ignorado" : "recortes de transparência foram ignorados"} — não são fotos.`,
    );
  }
  if (extraidas.imagens.length === TETO_IMAGENS) {
    avisos.push(`Parei nas primeiras ${TETO_IMAGENS} imagens do arquivo.`);
  }

  // Sem o processador de imagem não há prévia nenhuma, e o corretor merece
  // saber que o problema é do ambiente — não do arquivo que ele mandou.
  if (!(await sharpDisponivel())) {
    return {
      ok: false,
      erro: "O processamento de imagem não está disponível neste ambiente, então não consigo mostrar as fotos do PDF. Avise quem cuida do sistema.",
    };
  }

  if (extraidas.imagens.length === 0) {
    return {
      ok: false,
      erro:
        avisos.length > 0
          ? `Não consegui tirar nenhuma foto deste PDF. ${avisos.join(" ")}`
          : "Não encontrei imagem nenhuma dentro deste PDF.",
    };
  }

  const itens: ItemCurado[] = [];
  for (const [indice, imagem] of extraidas.imagens.entries()) {
    const previa = await gerarPreview(imagem.bytes);
    // Imagem que o decodificador não lê não vai para a grade: mostrar um
    // quadro quebrado seria pior que não mostrar.
    if (!previa) continue;
    itens.push({
      indice,
      preview: previa.dataUrl,
      largura: imagem.largura,
      altura: imagem.altura,
      parecePlanta: previa.parecePlanta,
      parecePaginaInteira: imagem.parecePaginaInteira,
      pareceGrafismo: previa.pareceGrafismo,
    });
  }

  return { ok: true, itens, avisos };
}

export type ResultadoGravacao = {
  ok: boolean;
  gravadas: number;
  duplicadas: number;
  falhas: string[];
  /** O que foi marcado como planta, para virar tipologia em seguida. */
  plantas: { indice: number; url: string }[];
  /** O desfecho de CADA imagem pedida: a tela marca uma a uma na grade. */
  porItem: { indice: number; desfecho: "entrou" | "duplicada" | "falhou" }[];
  erro?: string;
};

/**
 * Re-extrai o PDF guardado e sobe SÓ os índices escolhidos.
 *
 * Re-extrair em vez de guardar as imagens: a extração é determinística, e
 * assim a área de passagem guarda um arquivo em vez de sessenta. O custo é
 * uma segunda varredura do mesmo PDF, que roda em milissegundos.
 *
 * O resultado de cada item vem separado porque o corretor precisa saber
 * QUAL imagem falhou — um total de "3 de 12" não diz o que refazer.
 */
export async function gravarEscolhasDoPdf(entrada: {
  empreendimentoId: string;
  slug: string;
  caminhoStaging: string;
  escolhas: { indice: number; tipo: "foto" | "planta"; capa: boolean }[];
}): Promise<ResultadoGravacao> {
  const corretor = await getCorretorLogado();
  if (!corretor) {
    return { ok: false, gravadas: 0, duplicadas: 0, falhas: [], plantas: [], porItem: [], erro: "Sessão expirada. Entre de novo." };
  }
  if (entrada.escolhas.length === 0) {
    return { ok: false, gravadas: 0, duplicadas: 0, falhas: [], plantas: [], porItem: [], erro: "Marque pelo menos uma imagem." };
  }

  const supabase = await createClient();
  const baixado = await supabase.storage.from("empreendimentos").download(entrada.caminhoStaging);
  if (baixado.error || !baixado.data) {
    return {
      ok: false,
      gravadas: 0,
      duplicadas: 0,
      falhas: [],
      plantas: [],
      porItem: [],
      erro: "O arquivo que eu estava usando não está mais aqui. Escolha o PDF de novo.",
    };
  }

  const pdf = Buffer.from(await baixado.data.arrayBuffer());
  const extraidas = extrairImagensDePdf(pdf);
  const deps = depsMidiaSupabase(supabase);

  let gravadas = 0;
  let duplicadas = 0;
  const falhas: string[] = [];
  const plantas: { indice: number; url: string }[] = [];
  const porItem: ResultadoGravacao["porItem"] = [];

  for (const escolha of entrada.escolhas) {
    const imagem = extraidas.imagens[escolha.indice];
    if (!imagem) {
      falhas.push(`Imagem ${escolha.indice + 1} não foi encontrada na segunda leitura do arquivo.`);
      porItem.push({ indice: escolha.indice, desfecho: "falhou" });
      continue;
    }

    const resultado = await registrarMidia(deps, {
      empreendimentoId: entrada.empreendimentoId,
      bytes: imagem.bytes,
      mime: imagem.mime,
      tipo: escolha.tipo,
      alt: escolha.tipo === "planta" ? "Planta do empreendimento" : "Foto do empreendimento",
      // Capa é ordem 0, mesma convenção de `definirFotoComoCapa`.
      ordem: escolha.capa ? 0 : 10,
    });

    if (!resultado.ok) {
      falhas.push(`Imagem ${escolha.indice + 1}: ${resultado.erro}`);
      porItem.push({ indice: escolha.indice, desfecho: "falhou" });
      continue;
    }

    if (resultado.duplicada) duplicadas++;
    else gravadas++;
    porItem.push({ indice: escolha.indice, desfecho: resultado.duplicada ? "duplicada" : "entrou" });

    // Planta não é só foto na galeria: é a tipologia do imóvel, e é dela que
    // o bot tira dormitórios, suítes e metragem para responder ao cliente.
    if (escolha.tipo === "planta") plantas.push({ indice: escolha.indice, url: resultado.url });
  }

  // O PDF de passagem SÓ é apagado quando a leitura das plantas terminar
  // (`descartarPdfDeImportacao`): é dele que sai o texto onde moram o nome e
  // a metragem de cada tipologia — a imagem sozinha não tem isso.

  revalidatePath(`/empreendimentos/${entrada.slug}`);
  revalidarCatalogo();
  revalidatePath("/empreendimentos", "layout");
  revalidatePath("/corretor/imoveis");

  return { ok: true, gravadas, duplicadas, falhas, plantas, porItem };
}

export type ResultadoTipologia =
  | { ok: true; nome: string; criada: boolean }
  | { ok: false; erro: string };

/**
 * Transforma UMA planta já gravada na tipologia correspondente.
 *
 * Uma por chamada, como a transferência do Drive: cada leitura é uma ida ao
 * modelo com a imagem embutida, e um deck com sete plantas estouraria o teto
 * de 60s da função se tudo fosse numa requisição só.
 *
 * A tipologia é a ficha que o bot lê para responder "quantos dormitórios",
 * "qual a metragem" — por isso a planta não pode parar na galeria.
 */
export async function gerarTipologiaDaPlanta(entrada: {
  empreendimentoId: string;
  slug: string;
  caminhoStaging: string;
  indice: number;
  plantaUrl: string;
}): Promise<ResultadoTipologia> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "sessão expirada" };

  const supabase = await createClient();
  const baixado = await supabase.storage.from("empreendimentos").download(entrada.caminhoStaging);
  if (baixado.error || !baixado.data) {
    return { ok: false, erro: "não encontrei mais o arquivo da apresentação" };
  }

  const pdf = Buffer.from(await baixado.data.arrayBuffer());
  const imagem = extrairImagensDePdf(pdf).imagens[entrada.indice];
  if (!imagem) return { ok: false, erro: "não reencontrei a planta no arquivo" };

  const leitura = await lerPlanta(imagem.bytes, imagem.mime, limparTextoDeApresentacao(extrairTextoDePdf(pdf)));
  return gravarTipologiaLida(supabase, entrada, leitura);
}

/**
 * Da leitura da planta à linha de `tipologias`. Compartilhada pelas origens
 * PDF e Site: duas cópias da regra de "mesmo nome atualiza, não duplica"
 * divergiriam na primeira mudança.
 */
async function gravarTipologiaLida(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entrada: { empreendimentoId: string; slug: string; plantaUrl: string },
  leitura: Awaited<ReturnType<typeof lerPlanta>>,
): Promise<ResultadoTipologia> {
  if (!leitura.ok) {
    return {
      ok: false,
      erro:
        leitura.motivo === "sem_api_key"
          ? "a leitura de plantas depende da IA, que não está configurada aqui"
          : "não consegui ler os dados desta planta",
    };
  }

  const t = leitura.tipologia;

  // Mesma planta lida de novo não vira tipologia duplicada: o nome é a
  // identidade dentro do empreendimento, e reimportar deve ATUALIZAR.
  const { data: existente } = await supabase
    .from("tipologias")
    .select("id")
    .eq("empreendimento_id", entrada.empreendimentoId)
    .ilike("nome", t.nome)
    .maybeSingle();

  const linha = {
    empreendimento_id: entrada.empreendimentoId,
    nome: t.nome,
    dormitorios: t.dormitorios,
    suites: t.suites,
    banheiros: t.banheiros,
    vagas: t.vagas,
    area_privativa: t.metragem,
    planta_url: entrada.plantaUrl,
  };

  // `preco` e `unidades_disponiveis` ficam de FORA de propósito: não saem de
  // uma apresentação, mudam toda semana, e a IA é proibida de falar valores.
  const { error } = existente
    ? await supabase.from("tipologias").update(linha).eq("id", existente.id)
    : await supabase.from("tipologias").insert(linha);

  if (error) {
    console.error("Erro ao gravar tipologia da planta:", error);
    return { ok: false, erro: "não consegui salvar a tipologia" };
  }

  revalidatePath(`/empreendimentos/${entrada.slug}`);
  revalidatePath("/corretor/imoveis");

  return { ok: true, nome: t.nome, criada: !existente };
}

/** Apaga a apresentação da área de passagem, encerrando a importação. */
export async function descartarPdfDeImportacao(caminhoStaging: string): Promise<void> {
  const corretor = await getCorretorLogado();
  if (!corretor) return;

  const supabase = await createClient();
  await supabase.storage.from("empreendimentos").remove([caminhoStaging]);
}

/**
 * Ponte entre `registrarMidia` (que não conhece Supabase, para ser testável)
 * e o cliente de sessão. Fica aqui porque as duas origens da importação — o
 * PDF e o Drive — usam a mesma ponte.
 */
function depsMidiaSupabase(supabase: Awaited<ReturnType<typeof createClient>>) {
  return {
    async subir(caminho: string, conteudo: Buffer, contentType: string) {
      const { error } = await supabase.storage
        .from("empreendimentos")
        .upload(caminho, conteudo, { contentType, upsert: true });
      return { erro: error?.message ?? null };
    },
    urlPublica(caminho: string) {
      return supabase.storage.from("empreendimentos").getPublicUrl(caminho).data.publicUrl;
    },
    async inserir(linha: Parameters<Parameters<typeof registrarMidia>[0]["inserir"]>[0]) {
      const { data, error } = await supabase.from("midias").insert(linha).select("id").single();
      // 23505 = unique_violation: o índice de dedup recusou, e isso é sucesso.
      if (error?.code === "23505") return { id: null, duplicada: true, erro: null };
      if (error) {
        console.error("Erro ao registrar mídia importada:", error);
        return { id: null, duplicada: false, erro: error.message };
      }
      return { id: data.id, duplicada: false, erro: null };
    },
  };
}

export async function listarMaterialDoDrive(
  link: string,
): Promise<{ ok: true; arquivos: ArquivoDrive[] } | { ok: false; erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  const alvo = parsearLinkDrive(link);
  if (alvo.tipo === "nao_reconhecido") return { ok: false, erro: alvo.motivo };
  if (alvo.tipo === "arquivo") {
    return { ok: false, erro: "Este link é de um arquivo só. Cole o link da PASTA com o material." };
  }

  return listarPasta(alvo.id);
}

/**
 * Traz UM arquivo do Drive para a galeria do imóvel.
 *
 * O cliente chama uma vez por arquivo escolhido, poucos em paralelo. O teto
 * de função no plano Hobby é 60s: uma pasta inteira num request só estoura e
 * perde tudo. Assim há progresso, retomada, e o arquivo que falha aparece
 * nomeado sem derrubar os outros.
 */
export async function trazerArquivoDoDrive(entrada: {
  empreendimentoId: string;
  slug: string;
  arquivoId: string;
  nome: string;
  tipo: "foto" | "planta";
  capa: boolean;
}): Promise<{ ok: boolean; duplicada?: boolean; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "sessão expirada" };

  const baixado = await baixarArquivo(entrada.arquivoId);
  if (!baixado.ok) return { ok: false, erro: baixado.erro };

  const supabase = await createClient();
  const resultado = await registrarMidia(depsMidiaSupabase(supabase), {
    empreendimentoId: entrada.empreendimentoId,
    bytes: baixado.bytes,
    mime: baixado.mime,
    tipo: entrada.tipo,
    // O nome do arquivo é a melhor descrição que existe aqui, e sem a
    // extensão ele vira texto alternativo aceitável.
    alt: entrada.nome.replace(/\.[^.]+$/, ""),
    ordem: entrada.capa ? 0 : 10,
  });

  if (!resultado.ok) return { ok: false, erro: resultado.erro };

  revalidatePath(`/empreendimentos/${entrada.slug}`);
  revalidarCatalogo();
  revalidatePath("/empreendimentos", "layout");
  revalidatePath("/corretor/imoveis");

  return { ok: true, duplicada: resultado.duplicada };
}

export type SugestaoDeCadastro =
  | { ok: true; rascunho: RascunhoCadastro }
  | { ok: false; aviso: string };

/**
 * Propõe o cadastro a partir do texto da apresentação já guardada.
 *
 * Roda separado de `analisarPdf` de propósito: a IA é o elo que pode
 * demorar ou estar fora do ar, e as imagens não podem ficar esperando por
 * ela. Se esta falhar, a curadoria das fotos continua funcionando.
 */
export async function sugerirCadastroDoPdf(caminhoStaging: string): Promise<SugestaoDeCadastro> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, aviso: "Sessão expirada. Entre de novo." };

  const supabase = await createClient();
  const baixado = await supabase.storage.from("empreendimentos").download(caminhoStaging);
  if (baixado.error || !baixado.data) {
    return { ok: false, aviso: "Não consegui reabrir o arquivo para ler os dados escritos nele." };
  }

  const resultado = await montarRascunhoDePdf(Buffer.from(await baixado.data.arrayBuffer()));

  if (!resultado.ok) {
    return {
      ok: false,
      aviso:
        resultado.motivo === "sem_texto"
          ? "Esta apresentação não tem texto embutido — é imagem pura. As fotos acima continuam disponíveis, mas os dados do imóvel precisam ser digitados."
          : "Não consegui ler os dados escritos nesta apresentação agora. As fotos acima continuam disponíveis.",
    };
  }

  return { ok: true, rascunho: resultado.rascunho };
}

/**
 * Grava SÓ os campos que o corretor marcou.
 *
 * Não reusa `salvarDadosGerais` porque aquela action recebe o formulário
 * inteiro: mandar o rascunho por ela apagaria todo campo que a IA não leu.
 */
export async function aplicarRascunhoNoCadastro(entrada: {
  empreendimentoId: string;
  slug: string;
  aceitos: Partial<RascunhoCadastro>;
}): Promise<{ ok: boolean; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  const COLUNA: Record<keyof RascunhoCadastro, string | null> = {
    nome: "nome",
    construtora: "construtora",
    cidade: "cidade",
    bairro: "bairro",
    endereco: "endereco",
    status: "status",
    entregaPrevista: "entrega_prevista",
    totalTorres: "total_torres",
    totalAndares: "total_andares",
    totalUnidades: "total_unidades",
    tagline: "tagline",
    descricao: "descricao",
    // Plantas e lazer têm tabela própria (tipologias, empreendimento_lazer) e
    // campos que não saem de uma apresentação — preço, unidades disponíveis.
    // A tela mostra o que foi lido e manda cadastrar lá.
    tipologias: null,
    lazer: null,
  };

  const mudancas: AtualizacaoEmpreendimento = {};
  for (const [campo, valor] of Object.entries(entrada.aceitos)) {
    const coluna = COLUNA[campo as keyof RascunhoCadastro];
    if (coluna && valor !== undefined) {
      // O mapa `COLUNA` é a garantia de que só coluna existente entra; o
      // cast diz isso ao compilador, que não consegue seguir a indireção.
      (mudancas as Record<string, unknown>)[coluna] = valor;
    }
  }

  if (Object.keys(mudancas).length === 0) {
    return { ok: false, erro: "Nada para salvar." };
  }

  mudancas.updated_at = new Date().toISOString();

  const supabase = await createClient();
  const { error } = await supabase.from("empreendimentos").update(mudancas).eq("id", entrada.empreendimentoId);

  if (error) {
    console.error("Erro ao aplicar o rascunho no cadastro:", error);
    return { ok: false, erro: "Não consegui salvar no cadastro agora. Tente de novo." };
  }

  revalidatePath(`/empreendimentos/${entrada.slug}`);
  revalidarCatalogo();
  revalidatePath("/empreendimentos", "layout");
  revalidatePath("/corretor/imoveis");
  revalidarCatalogo();
  revalidatePath("/", "layout");

  return { ok: true };
}

// ─── Origem: site da construtora ──────────────────────────────────────────

/** Página de empreendimento passa de 1 MB (Even: 1,3 MB); 5 MB é folga. */
const TETO_HTML = 5 * 1024 * 1024;
/** Foto de construtora chega a 1500 px; 15 MB cobre com folga e trava o absurdo. */
const TETO_IMAGEM = 15 * 1024 * 1024;

export type ImagemDoSiteNaTela = ImagemDoSite & {
  /** Já veio desta página numa importação anterior (`midias.origem_url`). */
  jaTrazida: boolean;
};
export type MidiaDoSiteNaTela = MidiaDoSite & { jaCadastrada: boolean };

export type AnaliseDoSite =
  | {
      ok: true;
      titulo: string;
      /** Vai e volta pela tela: é dele que saem o rascunho e a leitura das plantas. */
      texto: string;
      dicas: DicasEstruturadas;
      imagens: ImagemDoSiteNaTela[];
      midias: MidiaDoSiteNaTela[];
      montadaPorJs: boolean;
      urlFinal: string;
    }
  | { ok: false; erro: string };

/**
 * Origens das fotos já trazidas para este imóvel. Consulta à parte, com o
 * erro engolido: a coluna nasceu na 0113, e antes de ela existir a tela só
 * perde a marca "já trazida" — não a importação.
 */
async function origensJaTrazidas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  empreendimentoId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("midias")
    .select("origem_url")
    .eq("empreendimento_id", empreendimentoId)
    .not("origem_url", "is", null);
  if (error) {
    console.warn("[importar do site] sem origem_url (0113 aplicada?):", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((m) => m.origem_url).filter((u): u is string => Boolean(u)));
}

/** Identidade de uma mídia externa: o ID do YouTube, ou a URL sem barra final. */
function identidadeDaMidia(url: string): string {
  return youtubeId(url) ?? url.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * Baixa e lê a página do empreendimento no site da construtora.
 *
 * Nada é gravado aqui. A análise devolve o que a página tem, e a curadoria
 * acontece na tela — só o que o corretor marcar é trazido depois, uma foto
 * por chamada (`trazerImagemDoSite`), como no Drive.
 */
export async function analisarSite(entrada: { url: string; empreendimentoId: string }): Promise<AnaliseDoSite> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  const busca = await buscarSeguro(entrada.url, {
    tetoBytes: TETO_HTML,
    prazoMs: 15_000,
    aceitar: (tipo) => tipo.includes("text/html") || tipo.includes("application/xhtml"),
  });

  if (!busca.ok) {
    return {
      ok: false,
      erro:
        busca.motivo === "bloqueado"
          ? `${busca.mensagem} Use a aba de PDF ou a do Drive com o material que a construtora mandou.`
          : busca.motivo === "tipo_errado"
            ? "Este link não é de uma página de site. Cole o endereço da página do empreendimento."
            : busca.mensagem,
    };
  }

  const pagina = lerPaginaDaConstrutora(busca.bytes.toString("utf8"), busca.urlFinal);

  const supabase = await createClient();
  const { data: existentes } = await supabase
    .from("midias")
    .select("url")
    .eq("empreendimento_id", entrada.empreendimentoId)
    .in("tipo", ["video", "tour360"]);
  const jaTem = new Set((existentes ?? []).map((m) => identidadeDaMidia(m.url)));
  const trazidas = await origensJaTrazidas(supabase, entrada.empreendimentoId);

  // Página lida guarda o link no imóvel: é ele que deixa o corretor voltar e
  // "buscar novidades" sem colar de novo. Página montada por JavaScript não
  // é lembrada — reler um casco vazio não traria novidade nenhuma.
  if (!pagina.montadaPorJs) {
    const { error } = await supabase
      .from("empreendimentos")
      .update({ site_construtora: busca.urlFinal })
      .eq("id", entrada.empreendimentoId);
    if (error) console.warn("[importar do site] não guardei o link (0113 aplicada?):", error.message);
  }

  return {
    ok: true,
    titulo: pagina.titulo,
    texto: pagina.texto,
    dicas: pagina.dicas,
    imagens: pagina.imagens.map((img) => ({ ...img, jaTrazida: trazidas.has(chaveDaFoto(img.url)) })),
    midias: pagina.midias.map((m) => ({ ...m, jaCadastrada: jaTem.has(identidadeDaMidia(m.url)) })),
    montadaPorJs: pagina.montadaPorJs,
    urlFinal: busca.urlFinal,
  };
}

function dicasComoTexto(dicas: DicasEstruturadas): string {
  return [
    dicas.nome ? `Nome: ${dicas.nome}` : "",
    dicas.endereco ? `Endereço: ${dicas.endereco}` : "",
    dicas.bairro ? `Bairro ou região: ${dicas.bairro}` : "",
    dicas.cidade ? `Cidade: ${dicas.cidade}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Mesmo leitor do PDF, com o texto da página e as dicas estruturadas dela. */
export async function sugerirCadastroDoSite(entrada: {
  texto: string;
  dicas: DicasEstruturadas;
}): Promise<SugestaoDeCadastro> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, aviso: "Sessão expirada. Entre de novo." };

  const resultado = await montarRascunhoDeTexto(entrada.texto.slice(0, 20_000), dicasComoTexto(entrada.dicas));
  if (!resultado.ok) {
    return {
      ok: false,
      aviso:
        resultado.motivo === "sem_texto"
          ? "A página quase não tem texto. As fotos e vídeos acima continuam disponíveis; os dados do imóvel precisam ser digitados."
          : "Não consegui ler os dados da página agora. As fotos e vídeos acima continuam disponíveis.",
    };
  }
  return { ok: true, rascunho: resultado.rascunho };
}

/**
 * Traz UMA imagem do site para a galeria. Uma por chamada, como no Drive: o
 * teto da função é 60 s, e o que falha aparece nomeado sem derrubar o resto.
 */
export async function trazerImagemDoSite(entrada: {
  empreendimentoId: string;
  slug: string;
  url: string;
  legenda: string;
  tipo: "foto" | "planta";
  capa: boolean;
}): Promise<{ ok: boolean; duplicada?: boolean; url?: string; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "sessão expirada" };

  const busca = await buscarSeguro(entrada.url, {
    tetoBytes: TETO_IMAGEM,
    prazoMs: 20_000,
    aceitar: (tipo) => /^image\/(jpeg|png|webp)/.test(tipo),
  });
  if (!busca.ok) return { ok: false, erro: busca.mensagem };

  const supabase = await createClient();
  const resultado = await registrarMidia(depsMidiaSupabase(supabase), {
    empreendimentoId: entrada.empreendimentoId,
    bytes: busca.bytes,
    mime: busca.contentType.split(";")[0].trim(),
    tipo: entrada.tipo,
    alt: entrada.legenda.slice(0, 200) || (entrada.tipo === "planta" ? "Planta do empreendimento" : "Foto do empreendimento"),
    ordem: entrada.capa ? 0 : 10,
  });
  if (!resultado.ok) return { ok: false, erro: resultado.erro };

  // A origem é carimbada DEPOIS, e à parte: citar a coluna no insert de
  // `registrarMidia` derrubaria a importação inteira enquanto a 0113 não
  // estiver aplicada. Só preenche onde está vazio — a foto que já existia
  // (duplicada) guarda a primeira origem, não a última.
  const { error: erroOrigem } = await supabase
    .from("midias")
    .update({ origem_url: chaveDaFoto(entrada.url) })
    .eq("empreendimento_id", entrada.empreendimentoId)
    .eq("url", resultado.url)
    .is("origem_url", null);
  if (erroOrigem) console.warn("[importar do site] sem origem_url (0113 aplicada?):", erroOrigem.message);

  revalidatePath(`/empreendimentos/${entrada.slug}`);
  revalidarCatalogo();
  revalidatePath("/empreendimentos", "layout");
  revalidatePath("/corretor/imoveis");

  return { ok: true, duplicada: resultado.duplicada, url: resultado.url };
}

/**
 * A planta trazida do site vira tipologia. A imagem é relida da NOSSA cópia
 * (já no Storage), e o texto da página entra como contexto — é nele que
 * moram o nome e a metragem de cada tipologia.
 */
export async function gerarTipologiaDaPlantaDoSite(entrada: {
  empreendimentoId: string;
  slug: string;
  plantaUrl: string;
  texto: string;
}): Promise<ResultadoTipologia> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "sessão expirada" };

  const busca = await buscarSeguro(entrada.plantaUrl, {
    tetoBytes: TETO_IMAGEM,
    prazoMs: 20_000,
    aceitar: (tipo) => tipo.startsWith("image/"),
  });
  if (!busca.ok) return { ok: false, erro: "não consegui reabrir a planta" };

  const leitura = await lerPlanta(busca.bytes, busca.contentType.split(";")[0].trim(), entrada.texto.slice(0, 20_000));
  const supabase = await createClient();
  return gravarTipologiaLida(supabase, entrada, leitura);
}

