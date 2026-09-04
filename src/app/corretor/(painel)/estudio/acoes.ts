"use server";

import { revalidatePath } from "next/cache";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getEmpreendimentosDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import {
  carregarConversa,
  conversaDoCorretor,
  criarConversa,
  excluirConversa as excluirNoBanco,
  gravarMensagemDoEstudio,
  listarConversas,
} from "@/lib/estudio/repositorio";
import { turnoDeArte, turnoDeVideo, type RespostaDoTurno } from "@/lib/estudio/turno";
import {
  tituloDaConversa,
  type ConversaDoEstudio,
  type MensagemDoEstudio,
  type PropostaDeVideo,
  type TipoEstudio,
} from "@/lib/estudio/contrato";
import { criarVideo } from "@/app/corretor/(painel)/marketing/video/acoes";

/**
 * As ações do Estúdio em forma de chat.
 *
 * ## Os dois únicos verbos que GASTAM continuam sendo dois
 *
 * Arte: `POST /api/imagens/gerar` — chamada pelo CLIENTE, como a tela antiga
 * fazia, depois que a proposta foi aceita. A rota é quem confere o teto
 * diário, aplica a cláusula anti-invenção e compõe a peça; `arte.test.ts` fixa
 * o caminho dela lendo o código. Este arquivo só grava o VÍNCULO
 * (`registrarArteGerada`) depois que a rota devolveu a imagem.
 *
 * Vídeo: `criarVideo` (a ação que já existia) — reserva crédito, enfileira e
 * acorda o worker. Aqui só se grava o `video_job_id` na conversa.
 *
 * Todo o resto é chamada de texto barata (turno) e leitura/escrita da
 * conversa. Nada aqui importa `gerarImagem` nem toca em `video_jobs`: é a
 * guarda que impede o chat de contornar cláusula e crédito.
 *
 * ## Quem pode
 *
 * A decisão é sempre da SESSÃO (`getCorretorLogado`, `conversaDoCorretor`,
 * que a RLS recorta); a service key só executa depois. Mesma regra de
 * `admin/acoes.ts`.
 */

const ROTAS: Record<TipoEstudio, string> = {
  arte: "/corretor/imoveis/criar-imagem",
  video: "/corretor/marketing/video",
};

export type EstadoDoChat = {
  conversa: ConversaDoEstudio;
  mensagens: MensagemDoEstudio[];
};

export async function listarConversasDoEstudio(tipo: TipoEstudio): Promise<ConversaDoEstudio[]> {
  const corretor = await getCorretorLogado();
  if (!corretor) return [];
  return listarConversas(tipo);
}

export async function abrirConversa(conversaId: string): Promise<EstadoDoChat | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  const c = await carregarConversa(conversaId);
  if (!c) return { erro: "Conversa não encontrada." };
  return c;
}

/**
 * O corretor falou. Grava a fala dele, roda o turno, grava a resposta da IA.
 *
 * `conversaId` nulo cria a conversa no primeiro pedido — o título nasce daí.
 * Cria ANTES de chamar a IA: se o motor cair no meio, o pedido do corretor
 * já está salvo e ele não digita de novo.
 */
export async function enviarMensagemDoEstudio(params: {
  tipo: TipoEstudio;
  conversaId: string | null;
  texto: string;
  /** Quando a fala é o toque numa alternativa de pergunta. */
  escolha?: { perguntaId: string; pergunta: string } | null;
}): Promise<EstadoDoChat | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };

  const texto = params.texto.trim().slice(0, 2000);
  if (!texto) return { erro: "Escreva alguma coisa." };

  let conversaId = params.conversaId;
  if (conversaId) {
    const dona = await conversaDoCorretor(conversaId);
    if (!dona || dona.tipo !== params.tipo) return { erro: "Conversa não encontrada." };
  } else {
    conversaId = await criarConversa({
      corretorId: corretor.id,
      tipo: params.tipo,
      titulo: tituloDaConversa(texto),
    });
  }

  await gravarMensagemDoEstudio({
    conversaId,
    papel: "corretor",
    conteudo: texto,
    dados: params.escolha
      ? { tipo: "escolha", perguntaId: params.escolha.perguntaId, pergunta: params.escolha.pergunta, escolha: texto }
      : null,
  });

  const antes = await carregarConversa(conversaId);
  const historico = antes?.mensagens ?? [];

  let resposta: RespostaDoTurno;
  try {
    resposta =
      params.tipo === "arte"
        ? await turnoDeArte({ historico, mensagem: texto })
        : await turnoDeVideo({ historico, mensagem: texto, imoveis: await getEmpreendimentosDoPainel() });
  } catch (e) {
    console.error("[estudio] turno falhou:", e);
    // Degradação, nunca bloqueio: o pedido está salvo; a IA só não respondeu.
    resposta = {
      tipo: "texto",
      texto: "Não consegui pensar nisso agora. Tenta de novo em instantes — o que você escreveu ficou salvo.",
    };
  }

  await gravarMensagemDoEstudio({
    conversaId,
    papel: "ia",
    conteudo: resposta.texto,
    dados:
      resposta.tipo === "pergunta"
        ? resposta.pergunta
        : resposta.tipo === "proposta"
          ? resposta.proposta
          : null,
  });

  revalidatePath(ROTAS[params.tipo]);
  const depois = await carregarConversa(conversaId);
  return depois ?? { erro: "Não consegui recarregar a conversa." };
}

/**
 * A rota `/api/imagens/gerar` já gerou e registrou a imagem (foi o cliente
 * quem a chamou, com a sessão dele). Aqui só se grava o vínculo e a mensagem
 * de resultado. Sem `imagemId` válido nada é gravado — o vínculo aponta para
 * uma linha que a rota criou, nunca para um id vindo solto da tela.
 */
export async function registrarArteGerada(params: {
  conversaId: string;
  imagemId: string;
  url: string;
}): Promise<EstadoDoChat | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  const dona = await conversaDoCorretor(params.conversaId);
  if (!dona || dona.tipo !== "arte") return { erro: "Conversa não encontrada." };

  await gravarMensagemDoEstudio({
    conversaId: params.conversaId,
    papel: "ia",
    conteudo: "Pronto. Se quiser uma variação, me diz o que mudar.",
    dados: { tipo: "resultado", modo: "arte", url: params.url },
    imagemId: params.imagemId,
  });

  revalidatePath(ROTAS.arte);
  const c = await carregarConversa(params.conversaId);
  return c ?? { erro: "Não consegui recarregar a conversa." };
}

/**
 * O corretor tocou "Gerar assim" numa proposta de vídeo. `criarVideo` é a
 * ação que já existia — reserva crédito, enfileira, acorda o worker — e é o
 * único caminho que gasta. Aqui só se grava o job na conversa.
 */
export async function confirmarPropostaDeVideo(params: {
  conversaId: string;
  proposta: PropostaDeVideo;
}): Promise<EstadoDoChat | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  const dona = await conversaDoCorretor(params.conversaId);
  if (!dona || dona.tipo !== "video") return { erro: "Conversa não encontrada." };

  // Só o que veio de uma proposta gravada pela IA pode ser gerado: a
  // conversa tem de conter uma proposta com este slug/objetivo/canal.
  const atual = await carregarConversa(params.conversaId);
  const propostaValida = (atual?.mensagens ?? []).some(
    (m) =>
      m.papel === "ia" &&
      m.dados?.tipo === "proposta" &&
      m.dados.modo === "video" &&
      m.dados.slug === params.proposta.slug &&
      m.dados.objetivo === params.proposta.objetivo &&
      m.dados.canal === params.proposta.canal,
  );
  if (!propostaValida) return { erro: "Essa proposta não está nesta conversa." };

  const r = await criarVideo({
    fonte: "catalogo",
    slug: params.proposta.slug,
    objetivo: params.proposta.objetivo,
    canal: params.proposta.canal,
  });
  if (r.erro || !r.jobId) return { erro: r.erro ?? "Não deu para entrar na fila." };

  await gravarMensagemDoEstudio({
    conversaId: params.conversaId,
    papel: "ia",
    conteudo: "Entrou na fila. O vídeo aparece aqui quando ficar pronto — costuma levar alguns minutos.",
    dados: { tipo: "resultado", modo: "video", url: null },
    videoJobId: r.jobId,
  });

  revalidatePath(ROTAS.video);
  const c = await carregarConversa(params.conversaId);
  return c ?? { erro: "Não consegui recarregar a conversa." };
}

export async function excluirConversaDoEstudio(conversaId: string): Promise<{ erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  const ok = await excluirNoBanco(conversaId);
  if (!ok) return { erro: "Não deu para apagar. Tente de novo." };
  revalidatePath(ROTAS.arte);
  revalidatePath(ROTAS.video);
  return {};
}
