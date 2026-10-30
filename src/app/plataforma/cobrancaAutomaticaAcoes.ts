"use server";

import { revalidatePath } from "next/cache";
import { inicioDaAssinatura } from "@/lib/cobranca/assinatura";
import {
  asaasConfigurado,
  buscarOuCriarCliente,
  cancelarAssinatura,
  celularNacional,
  criarAssinatura,
  ErroDoAsaas,
  variaveisDoAsaasFaltando,
} from "@/lib/cobranca/asaas";
import { diaEmSP } from "@/lib/crm/resumoDoDia";
import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import { ehUuid } from "@/lib/plataforma/dadosDoGrupo";
import { ROTULO_DO_PLANO } from "@/lib/plataforma/rotulosDoGrupo";
import { dataCompleta, situacaoDaCobranca } from "@/lib/planos/cobranca";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Liga e desliga a cobrança automática (Asaas) de um grupo (29/10/2026, 0241).
 *
 * Mesma regra de `cobrancaAcoes.ts`: `exigirAdminDaPlataformaNaAcao()` pela
 * sessão, sempre primeiro; a chave de serviço só depois. Cada mudança fica em
 * `admin_eventos` (`cobranca_automatica_ligada` / `_desligada`).
 *
 * Ligar = cliente no Asaas (o que já existe com a referência do grupo, ou um
 * novo) + assinatura mensal com `billingType: UNDEFINED` (o cliente escolhe
 * Pix, boleto ou cartão na fatura). O primeiro vencimento sai de
 * `inicioDaAssinatura` para o pagamento cair na competência certa no webhook.
 *
 * Nada aqui lê conversa, ficha nem lead (§4).
 */

export type ResultadoDaCobrancaAutomatica = { ok: true; aviso?: string } | { ok: false; erro: string };

const ERRO_GENERICO = "Não foi possível falar com o Asaas agora. Tente de novo em instantes.";

function atualizarTelas(grupoId: string) {
  revalidatePath("/plataforma");
  revalidatePath(`/plataforma/grupos/${grupoId}`);
}

function mesEAno(competencia: string): string {
  return `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;
}

export async function ligarCobrancaAutomatica(grupoId: string): Promise<ResultadoDaCobrancaAutomatica> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(grupoId)) return { ok: false, erro: "Grupo não encontrado." };
  if (!asaasConfigurado()) {
    return { ok: false, erro: `Cobrança automática não configurada. Falta: ${variaveisDoAsaasFaltando().join(", ")}.` };
  }

  const servico = createServiceClient();
  const [lido, pagamentos] = await Promise.all([
    servico
      .from("grupos")
      .select(
        "id, nome, plano, situacao, cancelado_em, criado_em, dia_do_vencimento, teste_ate, mensalidade, documento, contato_cobranca_email, contato_cobranca_telefone, asaas_assinatura_id",
      )
      .eq("id", grupoId)
      .maybeSingle(),
    servico.from("pagamentos_do_grupo").select("competencia").eq("grupo_id", grupoId),
  ]);
  if (lido.error || pagamentos.error) {
    console.error(`[asaas] grupo ${grupoId} não lido para ligar a cobrança: ${(lido.error ?? pagamentos.error)?.message}`);
    return { ok: false, erro: "Não foi possível ler o grupo agora. Tente de novo." };
  }
  const g = lido.data;
  if (!g) return { ok: false, erro: "Grupo não encontrado." };
  if (g.plano === "custo") return { ok: false, erro: "O plano de preço de custo não é cobrado." };
  if (g.cancelado_em || g.situacao === "encerrado") return { ok: false, erro: "Grupo cancelado ou encerrado não é cobrado." };
  if (g.asaas_assinatura_id) return { ok: false, erro: "A cobrança automática já está ligada." };
  const mensalidade = g.mensalidade === null ? null : Number(g.mensalidade);
  if (!mensalidade || mensalidade <= 0) return { ok: false, erro: "Defina a mensalidade do grupo antes de ligar a cobrança." };
  if (!g.documento) return { ok: false, erro: "Cadastre o CPF ou CNPJ do grupo (em Dados do grupo): o Asaas exige." };

  const agora = new Date();
  const hoje = diaEmSP(agora);
  const situacao = situacaoDaCobranca({
    plano: g.plano,
    suspensoManual: g.situacao === "suspenso",
    criadoEm: g.criado_em,
    diaDoVencimento: g.dia_do_vencimento,
    competenciasPagas: (pagamentos.data ?? []).map((p) => p.competencia),
    hoje: agora,
    testeAte: g.teste_ate,
  });
  const inicio = inicioDaAssinatura({ situacao, hoje, diaDoVencimento: g.dia_do_vencimento });

  let clienteId: string;
  try {
    const cliente = await buscarOuCriarCliente({
      nome: g.nome,
      cpfCnpj: g.documento,
      email: g.contato_cobranca_email,
      celular: celularNacional(g.contato_cobranca_telefone),
      referencia: g.id,
    });
    clienteId = cliente.id;
  } catch (e) {
    console.error(`[asaas] cliente do grupo ${grupoId} não criado: ${e instanceof Error ? e.message : "erro"}`);
    return { ok: false, erro: e instanceof ErroDoAsaas && e.status === 400 ? `O Asaas recusou o cadastro: ${e.message.split(": ").pop()}` : ERRO_GENERICO };
  }

  // O cliente fica gravado mesmo se a assinatura falhar: a próxima tentativa o reaproveita.
  const { error: erroDoCliente } = await servico.from("grupos").update({ asaas_cliente_id: clienteId }).eq("id", grupoId);
  if (erroDoCliente) {
    console.error(`[asaas] cliente do grupo ${grupoId} não gravado: ${erroDoCliente.message}`);
    return { ok: false, erro: "Não foi possível salvar agora. Tente de novo." };
  }

  let assinaturaId: string;
  try {
    const assinatura = await criarAssinatura({
      clienteId,
      valor: mensalidade,
      proximoVencimento: inicio.proximoVencimento,
      descricao: `Astro Soluções — ${ROTULO_DO_PLANO[g.plano]}`,
      referencia: g.id,
    });
    assinaturaId = assinatura.id;
  } catch (e) {
    console.error(`[asaas] assinatura do grupo ${grupoId} não criada: ${e instanceof Error ? e.message : "erro"}`);
    return { ok: false, erro: e instanceof ErroDoAsaas && e.status === 400 ? `O Asaas recusou a assinatura: ${e.message.split(": ").pop()}` : ERRO_GENERICO };
  }

  // Só grava se ninguém ligou ao mesmo tempo; senão a assinatura recém-criada é cancelada.
  const atualizacao: { asaas_assinatura_id: string; dia_do_vencimento?: number } = { asaas_assinatura_id: assinaturaId };
  if (inicio.novoDiaDoVencimento !== null) atualizacao.dia_do_vencimento = inicio.novoDiaDoVencimento;
  const { data: gravado, error: erroDaAssinatura } = await servico
    .from("grupos")
    .update(atualizacao)
    .eq("id", grupoId)
    .is("asaas_assinatura_id", null)
    .select("id");
  if (erroDaAssinatura || !gravado?.length) {
    console.error(`[asaas] assinatura do grupo ${grupoId} não gravada: ${erroDaAssinatura?.message ?? "já havia outra"}; cancelando no Asaas`);
    try {
      await cancelarAssinatura(assinaturaId);
    } catch (e) {
      console.error(`[asaas] assinatura órfã ${assinaturaId} não cancelada: ${e instanceof Error ? e.message : "erro"}`);
    }
    return { ok: false, erro: erroDaAssinatura ? "Não foi possível salvar agora. Tente de novo." : "A cobrança automática já foi ligada por outra pessoa." };
  }

  const { error: erroDoEvento } = await servico.from("admin_eventos").insert({
    grupo_id: grupoId,
    acao: "cobranca_automatica_ligada",
    ator_id: null,
    ator_plataforma_user_id: guarda.userId,
    alvo_corretor_id: null,
    detalhes: {
      origem: "plataforma",
      asaas_assinatura_id: assinaturaId,
      valor: mensalidade,
      primeiro_vencimento: inicio.proximoVencimento,
      dia_do_vencimento_novo: inicio.novoDiaDoVencimento,
    },
  });
  if (erroDoEvento) console.error(`[asaas] evento da cobrança ligada (${grupoId}) não gravado: ${erroDoEvento.message}`);

  atualizarTelas(grupoId);
  const avisos = [`Primeira cobrança em ${dataCompleta(inicio.proximoVencimento)}.`];
  if (inicio.novoDiaDoVencimento !== null) avisos.push(`O vencimento passou para todo dia ${inicio.novoDiaDoVencimento}.`);
  if (inicio.atrasadasFora.length) {
    avisos.push(
      `Ficaram de fora (o Asaas não cobra para trás): ${inicio.atrasadasFora.map(mesEAno).join(", ")}. Registre esses pagamentos à mão.`,
    );
  }
  return { ok: true, aviso: avisos.join(" ") };
}

export async function desligarCobrancaAutomatica(grupoId: string): Promise<ResultadoDaCobrancaAutomatica> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(grupoId)) return { ok: false, erro: "Grupo não encontrado." };
  if (!asaasConfigurado()) {
    return { ok: false, erro: `Cobrança automática não configurada. Falta: ${variaveisDoAsaasFaltando().join(", ")}.` };
  }

  const servico = createServiceClient();
  const { data: g, error } = await servico.from("grupos").select("asaas_assinatura_id").eq("id", grupoId).maybeSingle();
  if (error) {
    console.error(`[asaas] grupo ${grupoId} não lido para desligar a cobrança: ${error.message}`);
    return { ok: false, erro: "Não foi possível ler o grupo agora. Tente de novo." };
  }
  if (!g) return { ok: false, erro: "Grupo não encontrado." };
  const assinaturaId = g.asaas_assinatura_id;
  if (!assinaturaId) return { ok: false, erro: "A cobrança automática já está desligada." };

  try {
    await cancelarAssinatura(assinaturaId);
  } catch (e) {
    // 404: a assinatura já não existe no Asaas (apagada lá); desligar aqui é o certo.
    if (!(e instanceof ErroDoAsaas && e.status === 404)) {
      console.error(`[asaas] assinatura do grupo ${grupoId} não cancelada: ${e instanceof Error ? e.message : "erro"}`);
      return { ok: false, erro: ERRO_GENERICO };
    }
  }

  const { error: erroDaGravacao } = await servico
    .from("grupos")
    .update({ asaas_assinatura_id: null })
    .eq("id", grupoId)
    .eq("asaas_assinatura_id", assinaturaId);
  if (erroDaGravacao) {
    console.error(`[asaas] assinatura cancelada mas não desligada no grupo ${grupoId}: ${erroDaGravacao.message}`);
    return { ok: false, erro: "A assinatura foi cancelada no Asaas, mas não deu para salvar aqui. Tente de novo." };
  }

  const { error: erroDoEvento } = await servico.from("admin_eventos").insert({
    grupo_id: grupoId,
    acao: "cobranca_automatica_desligada",
    ator_id: null,
    ator_plataforma_user_id: guarda.userId,
    alvo_corretor_id: null,
    detalhes: { origem: "plataforma", asaas_assinatura_id: assinaturaId },
  });
  if (erroDoEvento) console.error(`[asaas] evento da cobrança desligada (${grupoId}) não gravado: ${erroDoEvento.message}`);

  atualizarTelas(grupoId);
  return { ok: true, aviso: "Cobrança automática desligada. Confira no Asaas se ficou alguma fatura em aberto." };
}
