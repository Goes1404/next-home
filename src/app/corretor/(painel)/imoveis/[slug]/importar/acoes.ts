"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { extrairImagensDePdf, TETO_IMAGENS } from "@/lib/imoveis/pdfImagens";
import { gerarPreview, sharpDisponivel } from "@/lib/imoveis/imagemDerivada";
import { registrarMidia } from "@/lib/imoveis/registrarMidia";
import { baixarArquivo, listarPasta, parsearLinkDrive, type ArquivoDrive } from "@/lib/imoveis/drive";
import { montarRascunhoDePdf, type RascunhoCadastro } from "@/lib/imoveis/rascunhoDePdf";
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
    return { ok: false, gravadas: 0, duplicadas: 0, falhas: [], erro: "Sessão expirada. Entre de novo." };
  }
  if (entrada.escolhas.length === 0) {
    return { ok: false, gravadas: 0, duplicadas: 0, falhas: [], erro: "Marque pelo menos uma imagem." };
  }

  const supabase = await createClient();
  const baixado = await supabase.storage.from("empreendimentos").download(entrada.caminhoStaging);
  if (baixado.error || !baixado.data) {
    return {
      ok: false,
      gravadas: 0,
      duplicadas: 0,
      falhas: [],
      erro: "O arquivo que eu estava usando não está mais aqui. Escolha o PDF de novo.",
    };
  }

  const pdf = Buffer.from(await baixado.data.arrayBuffer());
  const extraidas = extrairImagensDePdf(pdf);
  const deps = depsMidiaSupabase(supabase);

  let gravadas = 0;
  let duplicadas = 0;
  const falhas: string[] = [];

  for (const escolha of entrada.escolhas) {
    const imagem = extraidas.imagens[escolha.indice];
    if (!imagem) {
      falhas.push(`Imagem ${escolha.indice + 1} não foi encontrada na segunda leitura do arquivo.`);
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

    if (!resultado.ok) falhas.push(`Imagem ${escolha.indice + 1}: ${resultado.erro}`);
    else if (resultado.duplicada) duplicadas++;
    else gravadas++;
  }

  // O PDF de passagem já cumpriu o papel; deixá-lo no bucket seria lixo que
  // ninguém volta a abrir.
  await supabase.storage.from("empreendimentos").remove([entrada.caminhoStaging]);

  revalidatePath(`/empreendimentos/${entrada.slug}`);
  revalidatePath("/empreendimentos", "layout");
  revalidatePath("/corretor/imoveis");

  return { ok: true, gravadas, duplicadas, falhas };
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
  revalidatePath("/empreendimentos", "layout");
  revalidatePath("/corretor/imoveis");
  revalidatePath("/", "layout");

  return { ok: true };
}
