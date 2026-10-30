import "server-only";

import { createHash } from "node:crypto";
import { SELECT_EMPREENDIMENTO } from "@/lib/catalogo/selects";
import { carimbarRessalva } from "@/lib/imagens/carimbo";
import { classificarFalhaDeStorage } from "@/lib/imagens/falhaDeStorage";
import { getTetoDeHoje, registrarImagem } from "@/lib/imagens/galeria";
import { gerarImagem, imagensConfiguradas } from "@/lib/imagens/gerarImagem";
import { TAMANHOS, type ChaveTamanho } from "@/lib/imagens/imagensTipos";
import { montarPedido, receitaPor } from "@/lib/imagens/receitas";
import { textosEntreAspas } from "@/lib/imagens/textoNaCena";
import { traduzirPedido } from "@/lib/imagens/tradutor";
import { medirImagem } from "@/lib/imoveis/imagemDerivada";
import { MENSAGEM_DE_ARTES_PAUSADAS } from "@/lib/planos/cobranca";
import { grupoSuspenso } from "@/lib/planos/cobrancaDoGrupo";
import { conferirLimite } from "@/lib/planos/usoDaIa";
import { mapEmpreendimento, type LinhaEmpreendimento } from "@/lib/supabase/mappers";
import { createServiceClient } from "@/lib/supabase/service";
import { fatosDoImovelCitado } from "./imovelNaArte";

/**
 * A arte do Estúdio pedida pelo número central (spec 3.5, capacidade 16;
 * onda 3, Frente M).
 *
 * É a MESMA geração da tela, sem a sessão: a rota `/api/imagens/gerar` lê o
 * corretor de `getCorretorLogado`, e o central não tem sessão (o corretor e
 * o grupo vêm da identificação pelo telefone). As peças são as da rota, na
 * mesma ordem, e nenhuma é nova:
 *
 * 1. grupo suspenso, motor configurado, teto diário do corretor
 *    (`getTetoDeHoje`, 20/dia) e limite de artes do PLANO
 *    (`conferirLimite(grupo, "arte")`) — tudo ANTES de gastar;
 * 2. o pedido vira prompt pelo tradutor do Estúdio (`traduzirPedido`, com os
 *    fatos da ficha: `fatosDoImovelCitado`), que é o que a tela mostra antes
 *    do "Gerar assim";
 * 3. `gerarImagem` (que grava o consumo no livro, `registrarConsumoDaIa`,
 *    finalidade `arte_imagem`, com quem pediu pagando);
 * 4. a ressalva legal carimbada por código ANTES do upload (a peça é sempre
 *    de um imóvel), o upload no mesmo caminho e a linha na galeria
 *    (`registrarImagem`, com o imóvel: é ela que o gatilho da 0214 conta no
 *    limite do mês, e é por ela que a arte aparece no Estúdio).
 *
 * A orquestração está espelhada, não compartilhada, porque a rota é presa
 * por guardas que leem o código dela (`receitas.test.ts`,
 * `limitesNoPontoDeGeracao.test.ts`, `quandoAIaResponde.test.ts`); este
 * arquivo entrou nas mesmas guardas.
 *
 * O imóvel é relido aqui com o grupo de quem pediu: o id veio do `preparar`
 * do central, mas é a chave de serviço que lê, e ela não tem RLS.
 */

const BUCKET = "empreendimentos";

/**
 * A imagem tem MENOS tempo que na tela (45 s lá). Pelo central, a geração
 * pode seguir depois da resposta do webhook (`after`), mas dentro do teto da
 * MESMA função (60 s), que já gastou a identificação, a leitura da ficha e o
 * tradutor. 40 s deixa folga para o upload; `low` mediu 14,5 s.
 */
const TEMPO_DA_IMAGEM_MS = 40_000;

export type QuemPedeAArte = { corretorId: string; grupoId: string };

export type ConferenciaDaArte = { ok: true; restamHoje: number } | { ok: false; erro: string };

/**
 * Pode gerar agora? As travas da rota, sem gastar nada. O `preparar` chama
 * para não propor o que vai ser recusado; a geração chama de novo no "sim"
 * (entre um e outro pode ter passado até 1 hora).
 */
export async function conferirArtePeloCentral(quem: QuemPedeAArte): Promise<ConferenciaDaArte> {
  if (await grupoSuspenso(quem.grupoId)) return { ok: false, erro: MENSAGEM_DE_ARTES_PAUSADAS };
  if (!imagensConfiguradas()) return { ok: false, erro: "A geração de imagens não está configurada neste ambiente." };
  const teto = await getTetoDeHoje(quem.corretorId);
  if (teto.usadasHoje >= teto.teto) return { ok: false, erro: `Você já criou ${teto.teto} imagens hoje. O limite volta amanhã.` };
  const limite = await conferirLimite(quem.grupoId, "arte");
  if (!limite.ok) return { ok: false, erro: limite.erro };
  return { ok: true, restamHoje: teto.teto - teto.usadasHoje };
}

export type ResultadoDaArte =
  | {
      ok: true;
      url: string;
      imagemId: string | null;
      /** `falhou` = a arte saiu SEM a ressalva legal, e quem recebe precisa saber. */
      ressalva: "aplicada" | "falhou";
    }
  | { ok: false; erro: string };

/** O motivo da falha da imagem, numa frase que diz o que fazer (as da rota, sem os botões da tela). */
function fraseDoMotivo(motivo: string): string {
  switch (motivo) {
    case "sem_credito":
      return "A conta de IA da plataforma está sem crédito. Avise o gestor; nada foi cobrado da sua cota.";
    case "recusado":
      return "O gerador recusou esse pedido. Tente descrever de outro jeito no Estúdio do painel.";
    case "timeout":
      return "A imagem demorou demais e foi cancelada. Pode pedir de novo?";
    case "http_429":
      return "Muitos pedidos de uma vez no gerador. Espere um minuto e peça de novo.";
    default:
      return "Não deu para gerar a imagem agora. Tente de novo em instantes.";
  }
}

export async function gerarArtePeloCentral(pedido: QuemPedeAArte & {
  empreendimentoId: string;
  formato: ChaveTamanho;
  /** O pedido em português ("Post do Vitta para o Instagram"); o tradutor o transforma em prompt. */
  texto: string;
}): Promise<ResultadoDaArte> {
  const conferida = await conferirArtePeloCentral(pedido);
  if (!conferida.ok) return conferida;

  const supabase = createServiceClient();
  const { data: linha } = await supabase
    .from("empreendimentos")
    .select(SELECT_EMPREENDIMENTO)
    .eq("id", pedido.empreendimentoId)
    .eq("grupo_id", pedido.grupoId)
    .maybeSingle();
  if (!linha) return { ok: false, erro: "Não achei esse imóvel no catálogo da imobiliária." };
  const imovel = mapEmpreendimento(linha as unknown as LinhaEmpreendimento);

  const quemPaga = { corretorId: pedido.corretorId, grupoId: pedido.grupoId };
  // Sem foto de referência, como o Estúdio quando o corretor não escolhe uma:
  // a ficha entra como fatos e a ressalva diz que é ilustrativa.
  const traduzido = await traduzirPedido({ pedido: pedido.texto, fatos: fatosDoImovelCitado(imovel), dominio: "imovel", quemPaga });
  const prompt = traduzido.prompt.trim() || pedido.texto;
  const formato = TAMANHOS.find((t) => t.chave === pedido.formato) ?? TAMANHOS[0];

  const resultado = await gerarImagem({
    prompt: montarPedido(prompt, receitaPor("livre")),
    textosNaCena: textosEntreAspas(prompt),
    largura: formato.largura,
    altura: formato.altura,
    qualidade: "low",
    timeoutMs: TEMPO_DA_IMAGEM_MS,
    quemPaga,
  });
  if (!resultado.ok) return { ok: false, erro: fraseDoMotivo(resultado.motivo) };

  // Peça de imóvel: a ressalva é obrigatória, por código, antes do arquivo
  // existir. Se o carimbo falhar a arte já foi paga e é entregue, avisando.
  const marcada = await carimbarRessalva(resultado.bytes, resultado.mime);
  const hash = createHash("sha256").update(marcada.bytes).digest("hex").slice(0, 16);
  const caminho = `corretores/${pedido.corretorId}/criacoes/${hash}.png`;
  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, marcada.bytes, { contentType: marcada.mime, upsert: true });
  if (erroUpload) {
    const falha = classificarFalhaDeStorage(erroUpload.message, erroUpload.statusCode);
    console.error("[central] falha ao guardar arte gerada", { motivo: falha.motivo, mensagem: erroUpload.message, caminho });
    return { ok: false, erro: falha.mensagem };
  }

  const url = supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
  const medida = await medirImagem(marcada.bytes);
  const imagem = await registrarImagem({
    corretorId: pedido.corretorId,
    prompt,
    modelo: resultado.modelo,
    url,
    largura: medida?.largura ?? formato.largura,
    altura: medida?.altura ?? formato.altura,
    referenciaUrl: null,
    latenciaMs: resultado.latenciaMs,
    empreendimentoId: imovel.id ?? pedido.empreendimentoId,
  });

  return { ok: true, url, imagemId: imagem?.id ?? null, ressalva: marcada.carimbada ? "aplicada" : "falhou" };
}
