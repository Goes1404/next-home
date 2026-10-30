import "server-only";

import { SELECT_EMPREENDIMENTO } from "@/lib/catalogo/selects";
import { montarBriefing, problemasDaCopy, type ChaveCanal, type ChaveObjetivo, type Copy } from "@/lib/imagens/marketing";
import { lerEnderecoDoCliente } from "@/lib/marcaDoCrm/ler";
import { MENSAGEM_DE_VIDEOS_PAUSADOS } from "@/lib/planos/cobranca";
import { grupoSuspenso } from "@/lib/planos/cobrancaDoGrupo";
import { conferirLimite } from "@/lib/planos/usoDaIa";
import { linkDeIndicacao } from "@/lib/social/linkDeIndicacao";
import { mapEmpreendimento, type LinhaEmpreendimento } from "@/lib/supabase/mappers";
import { createServiceClient } from "@/lib/supabase/service";
import { acionarRender } from "./acionarRender";
import { enfileirarVideo, getSaldo } from "./fila";
import { montarRoteiro } from "./roteiro";

/**
 * O vídeo do criador da plataforma pedido pelo número central (spec 3.7,
 * capacidade 32; onda 3, Frente M).
 *
 * É o `criarVideo` da tela (`marketing/video/acoes.ts`) sem a sessão, na
 * fonte "catálogo" e sem fotos anexadas: grupo suspenso e limite de vídeos do
 * PLANO antes de tudo, o mesmo briefing, a mesma copy, o mesmo roteiro
 * determinístico (`montarRoteiro`), a mesma régua de publicidade, e a fila
 * de sempre (`enfileirarVideo`, que reserva o crédito do corretor antes de
 * inserir) com o worker acordado na hora (`acionarRender`). Sem foto anexada
 * não há visão (`classificarFotos`): pelo central, o vídeo não chama IA.
 *
 * A única marca nova é `briefing.origem = "central"`: é por ela que a
 * conclusão do job (o worker, fora da Vercel) volta pelo central
 * (`entregaPeloCentral.ts`, no tique dos follow-ups).
 *
 * Tudo é lido com o grupo de quem pediu (chave de serviço, sem RLS).
 */

export type QuemPedeOVideo = { corretorId: string; grupoId: string };

export type ConferenciaDoVideo = { ok: true; disponiveis: number } | { ok: false; erro: string };

/** Pode pedir agora? Sem gastar: o `preparar` mostra o saldo na proposta. */
export async function conferirVideoPeloCentral(quem: QuemPedeOVideo): Promise<ConferenciaDoVideo> {
  if (await grupoSuspenso(quem.grupoId)) return { ok: false, erro: MENSAGEM_DE_VIDEOS_PAUSADOS };
  const limite = await conferirLimite(quem.grupoId, "video");
  if (!limite.ok) return { ok: false, erro: limite.erro };
  // A cota por corretor (`reservar_credito_video`) segue valendo por cima do
  // plano; a reserva de verdade é na fila, aqui só se avisa antes.
  const saldo = await getSaldo(quem.corretorId);
  if (saldo.disponiveis <= 0) return { ok: false, erro: "Seus vídeos do mês acabaram. O limite volta no dia 1º." };
  return { ok: true, disponiveis: saldo.disponiveis };
}

export type ResultadoDoVideo = { ok: true; jobId: string } | { ok: false; erro: string };

export async function criarVideoPeloCentral(pedido: QuemPedeOVideo & {
  empreendimentoId: string;
  objetivo: ChaveObjetivo;
  canal: ChaveCanal;
}): Promise<ResultadoDoVideo> {
  const conferida = await conferirVideoPeloCentral(pedido);
  if (!conferida.ok) return conferida;

  const supabase = createServiceClient();
  const [{ data: linha }, { data: corretor }] = await Promise.all([
    supabase.from("empreendimentos").select(SELECT_EMPREENDIMENTO).eq("id", pedido.empreendimentoId).eq("grupo_id", pedido.grupoId).maybeSingle(),
    supabase.from("corretores").select("nome, slug").eq("id", pedido.corretorId).eq("grupo_id", pedido.grupoId).maybeSingle(),
  ]);
  if (!linha) return { ok: false, erro: "Não achei esse imóvel no catálogo da imobiliária." };
  if (!corretor) return { ok: false, erro: "Não achei o seu cadastro nesta imobiliária." };
  const imovel = mapEmpreendimento(linha as unknown as LinhaEmpreendimento);

  const briefing = montarBriefing({ imovel, objetivo: pedido.objetivo, canal: pedido.canal, publico: "familia" });
  const copy: Copy = { titulo: imovel.nome, apoio: `${imovel.bairro}, ${imovel.cidade}`, cta: briefing.objetivo.ctas[0] };
  const planos = montarRoteiro({ fotos: imovel.galeria, objetivo: pedido.objetivo });
  if (planos.length === 0) {
    return { ok: false, erro: `O ${imovel.nome} não tem foto que sirva ao vídeo. Cadastre as fotos no painel e peça de novo.` };
  }
  const problemas = problemasDaCopy(copy);
  if (problemas.length > 0) return { ok: false, erro: `O texto do vídeo não pode ir assim: ${problemas.join("; ")}.` };

  const r = await enfileirarVideo({
    corretorId: pedido.corretorId,
    empreendimentoId: imovel.id ?? pedido.empreendimentoId,
    briefing: {
      objetivo: pedido.objetivo,
      canal: pedido.canal,
      publico: "familia",
      fonte: "catalogo",
      imovelSlug: imovel.slug,
      imovelNome: imovel.nome,
      corretorId: pedido.corretorId,
      rodape: `${corretor.nome} · ${linkDeIndicacao(corretor.slug, await lerEnderecoDoCliente(pedido.grupoId))}`,
      origem: "central",
      ...copy,
    },
    roteiro: planos,
  });
  if (!r.ok) {
    return {
      ok: false,
      erro: r.motivo === "sem_saldo" ? "Seus vídeos do mês acabaram. O limite volta no dia 1º." : "Não deu para entrar na fila. Tente de novo em instantes.",
    };
  }
  // Sem `await`, como na tela: o `schedule` do workflow varre a fila se isto falhar.
  acionarRender();
  return { ok: true, jobId: r.jobId };
}
