"use server";

import { revalidatePath } from "next/cache";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getEmpreendimentosDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { getParametrosCredito } from "@/lib/credito/parametros";
import { buscarExemplosFewShot } from "@/lib/whatsapp/aprendizadoContinuo";
import {
  carregarConversaDoConsultor,
  conversaDoCorretor,
  criarConversaDoConsultor,
  excluirConversaDoConsultor,
  gravarMensagemDoConsultor,
  listarConversasDoConsultor,
} from "@/lib/consultor/repositorio";
import { turnoDoConsultor } from "@/lib/consultor/turno";
import {
  tituloDaConversa,
  type ConversaDoConsultor,
  type MensagemDoConsultor,
} from "@/lib/consultor/contrato";

/**
 * As ações do consultor imobiliário.
 *
 * Quem pode é sempre decisão da SESSÃO (`getCorretorLogado`,
 * `conversaDoCorretor`, que a RLS recorta); a service key, dentro do
 * repositório, só executa depois. Mesma regra de `admin/acoes.ts`.
 *
 * Nada aqui gasta imagem nem vídeo: o consultor só faz chamada de TEXTO. É a
 * guarda que separa esta tela do Estúdio, onde os dois únicos verbos que
 * gastam continuam sendo dois.
 */

const ROTA = "/corretor/consultor";

export type EstadoDoChatConsultor = {
  conversa: ConversaDoConsultor;
  mensagens: MensagemDoConsultor[];
};

export async function listarConversas(): Promise<ConversaDoConsultor[]> {
  const corretor = await getCorretorLogado();
  if (!corretor) return [];
  return listarConversasDoConsultor();
}

export async function abrirConversaDoConsultor(
  conversaId: string,
): Promise<EstadoDoChatConsultor | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  const c = await carregarConversaDoConsultor(conversaId);
  if (!c) return { erro: "Conversa não encontrada." };
  return c;
}

/**
 * O corretor perguntou. Grava a fala dele, roda o turno, grava a resposta.
 *
 * `conversaId` nulo cria a conversa no primeiro pedido — o título nasce daí.
 * Cria ANTES de chamar a IA: se o motor cair no meio, a pergunta já está
 * salva e ele não digita de novo.
 */
export async function enviarMensagemDoConsultor(params: {
  conversaId: string | null;
  texto: string;
  /** Quando a fala é o toque numa alternativa de pergunta. */
  escolha?: { perguntaId: string; pergunta: string } | null;
}): Promise<EstadoDoChatConsultor | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };

  const texto = params.texto.trim();
  if (!texto) return { erro: "Escreva a sua pergunta." };

  let conversaId = params.conversaId;
  if (conversaId) {
    if (!(await conversaDoCorretor(conversaId))) return { erro: "Conversa não encontrada." };
  } else {
    conversaId = await criarConversaDoConsultor({
      corretorId: corretor.id,
      titulo: tituloDaConversa(texto),
    });
  }

  await gravarMensagemDoConsultor({
    conversaId,
    papel: "corretor",
    conteudo: texto,
    dados: params.escolha
      ? {
          tipo: "escolha",
          perguntaId: params.escolha.perguntaId,
          pergunta: params.escolha.pergunta,
          escolha: texto,
        }
      : null,
  });

  const anterior = await carregarConversaDoConsultor(conversaId);
  // A fala que acabou de entrar já está no histórico: mandá-la de novo como
  // "pedido" faria a última fala pesar duas vezes na leitura do modelo — o
  // defeito que o dossiê teve até alguém reparar na duplicata.
  const historico = (anterior?.mensagens ?? []).slice(0, -1);

  const [catalogo, credito] = await Promise.all([
    getEmpreendimentosDoPainel(),
    getParametrosCredito(),
  ]);
  // O consultor recomenda o que dá para vender: rascunho fica de fora.
  const publicados = catalogo.filter((e) => e.publicado !== false);

  const exemplos = await buscarExemplosFewShot({
    corretorId: corretor.id,
    mensagemAtual: texto,
    catalogo: publicados,
  });

  const r = await turnoDoConsultor({
    pedido: texto,
    historico,
    catalogo: publicados,
    credito,
    exemplos,
  });

  await gravarMensagemDoConsultor({
    conversaId,
    papel: "ia",
    conteudo: r.texto,
    dados: r.dados,
  });

  // O texto pronto para o cliente vira mensagem PRÓPRIA: ele tem botão de
  // copiar e não pode se misturar ao raciocínio que o corretor está lendo.
  if (r.textoCliente) {
    await gravarMensagemDoConsultor({
      conversaId,
      papel: "ia",
      conteudo: "Para mandar pro cliente:",
      dados: { tipo: "texto_cliente", texto: r.textoCliente },
    });
  }

  revalidatePath(ROTA);
  const atual = await carregarConversaDoConsultor(conversaId);
  return atual ?? { erro: "Falha ao recarregar a conversa." };
}

export async function excluirConversa(
  conversaId: string,
): Promise<{ ok: true } | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  const apagou = await excluirConversaDoConsultor(conversaId);
  if (!apagou) return { erro: "Não foi possível apagar." };
  revalidatePath(ROTA);
  return { ok: true };
}
