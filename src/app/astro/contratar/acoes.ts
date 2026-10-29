"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { linkDoWhatsAppDaAstro } from "@/lib/marcaDaPlataforma";
import { notificarAdminsDaPlataforma } from "@/lib/notificacoes/push";
import { iniciarTesteGratis } from "@/lib/plataforma/testeGratis";
import {
  errosDoTesteGratis,
  mascararParaLog,
  mensagemDoPedidoParaAstro,
  primeiroNome,
  resumoDoPlano,
  TEMPO_MINIMO_NO_FORMULARIO_MS,
  validarPedido,
  type DadosDoPedido,
  type ErrosDoPedido,
  type PedidoLimpo,
} from "@/lib/plataforma/pedidoDeContratacao";
import { createServiceClient } from "@/lib/supabase/service";
import { nomeDoRamo } from "@/lib/ramos/ramos";
import { codigoDeIndicacaoDoVisitante } from "@/lib/indicacoes/cookieDoVisitante";

/**
 * O envio do assistente de contratação (`/astro/contratar`, 29/10/2026).
 *
 * Porta PÚBLICA: qualquer um na internet chama. Por isso, nesta ordem:
 *
 * 1. Limite por IP, em memória do processo (o mesmo best-effort do
 *    formulário de lead, `api/leads`): barra o visitante martelando a mesma
 *    instância quente. Não substitui um rate limit distribuído.
 * 2. Robô: campo-isca preenchido ou envio antes do tempo mínimo com o
 *    formulário aberto. Responde como sucesso, sem gravar, para não ensinar
 *    o robô a driblar.
 * 3. Consentimento da LGPD marcado.
 * 4. Validação no servidor com as MESMAS regras do navegador
 *    (`validarPedido`): o que vem do navegador nunca é confiado.
 * 5. Limite por WhatsApp, no banco (vale entre instâncias): o mesmo número
 *    com pedido nas últimas 24 h não grava outro; a pessoa recebe a mesma
 *    confirmação.
 *
 * Grava pela chave de serviço porque a tabela não tem grant para o `anon`
 * (0238). Log nunca leva o dado pessoal inteiro (`mascararParaLog`).
 *
 * Depois da resposta (`after`), avisa no celular os administradores da
 * plataforma que têm ficha de corretor com aparelho inscrito. O aviso leva o
 * plano e a cidade, nunca o nome nem o telefone.
 *
 * Teste grátis (29/10/2026, 0241): com `modo: "teste"`, os passos 1 a 4 são
 * os mesmos, o CRECI passa a ser obrigatório (só na imobiliária desde a
 * 0244: nos outros ramos o registro profissional é opcional), e no lugar do 5 a conta nasce
 * na hora (`iniciarTesteGratis`: um teste por e-mail, WhatsApp e CPF/CNPJ,
 * travado no banco). O link de criar a senha vai SÓ por e-mail.
 */

export type EnvioDoPedido = DadosDoPedido & {
  consentimento: boolean;
  /** Campo-isca: invisível para gente; só robô preenche. */
  site: string;
  /** Há quanto tempo o assistente está aberto na tela (ms). */
  abertoHaMs: number;
  /** `teste`: começa o teste grátis de 7 dias; ausente ou `pedido`: só o pedido. */
  modo?: "pedido" | "teste";
};

export type RespostaDoPedido =
  | {
      ok: true;
      primeiroNome: string;
      resumo: string;
      whatsappDaAstro: string | null;
      /** O teste grátis começou: até quando, e se o e-mail do convite saiu (para onde). */
      teste?: { fimDoTeste: string; emailEnviado: boolean; email: string };
    }
  | { ok: false; erro: string; erros?: ErrosDoPedido };

const JANELA_DO_IP_MS = 10 * 60 * 1000;
const LIMITE_POR_IP = 5;
const JANELA_DO_WHATSAPP_MS = 24 * 60 * 60 * 1000;

const ENVIOS_POR_IP = new Map<string, number[]>();

function ipLimitado(ip: string, agora: number): boolean {
  const envios = (ENVIOS_POR_IP.get(ip) ?? []).filter((t) => agora - t < JANELA_DO_IP_MS);
  envios.push(agora);
  ENVIOS_POR_IP.set(ip, envios);
  // O mapa não cresce sem fim numa instância que vive muito.
  if (ENVIOS_POR_IP.size > 5000) ENVIOS_POR_IP.clear();
  return envios.length > LIMITE_POR_IP;
}

function confirmacao(p: PedidoLimpo): Extract<RespostaDoPedido, { ok: true }> {
  return {
    ok: true,
    primeiroNome: primeiroNome(p.nome),
    resumo: resumoDoPlano(p.plano, p.usuarios, p.ramo),
    whatsappDaAstro: linkDoWhatsAppDaAstro(undefined, mensagemDoPedidoParaAstro(p)),
  };
}

export async function enviarPedidoDeContratacao(envio: EnvioDoPedido): Promise<RespostaDoPedido> {
  const agora = Date.now();
  const cabecalhos = await headers();
  const ip = cabecalhos.get("x-forwarded-for")?.split(",")[0]?.trim() || cabecalhos.get("x-real-ip") || "desconhecido";
  if (ipLimitado(ip, agora)) {
    return { ok: false, erro: "Muitos envios seguidos. Espere alguns minutos e tente de novo." };
  }

  const corpo = (envio ?? {}) as Partial<EnvioDoPedido>;
  const robo =
    (typeof corpo.site === "string" && corpo.site.trim() !== "") ||
    typeof corpo.abertoHaMs !== "number" ||
    !Number.isFinite(corpo.abertoHaMs) ||
    corpo.abertoHaMs < TEMPO_MINIMO_NO_FORMULARIO_MS;

  if (corpo.consentimento !== true) {
    return { ok: false, erro: "Para enviar, confirme que leu e concorda com a Política de Privacidade e os Termos." };
  }

  const validado = validarPedido(corpo);
  if (!validado.ok) return { ok: false, erro: "Confira os dados destacados.", erros: validado.erros };
  const pedido = validado.pedido;

  if (robo) {
    console.warn("[contratar] envio descartado como robô (campo-isca ou rápido demais)");
    return confirmacao(pedido);
  }

  if (corpo.modo === "teste") {
    const errosDoTeste = errosDoTesteGratis(pedido);
    if (Object.keys(errosDoTeste).length > 0) {
      return { ok: false, erro: "Confira os dados destacados.", erros: errosDoTeste };
    }
    const teste = await iniciarTesteGratis(pedido, new Date(agora));
    if (!teste.ok) {
      return teste.campo ? { ok: false, erro: teste.erro, erros: { [teste.campo]: teste.erro } } : { ok: false, erro: teste.erro };
    }
    return {
      ...confirmacao(pedido),
      teste: { fimDoTeste: teste.fimDoTeste, emailEnviado: teste.emailEnviado, email: pedido.email },
    };
  }

  const gravado = await gravarPedido(pedido, agora);
  if (gravado === "falhou") {
    return { ok: false, erro: "Não conseguimos registrar o pedido agora. Tente de novo em instantes." };
  }
  if (gravado === "repetido") return confirmacao(pedido);

  after(() => avisarAdministradores(pedido));
  return confirmacao(pedido);
}

/**
 * Grava o pedido, a não ser que o mesmo WhatsApp já tenha um nas últimas
 * 24 h. Nunca lança: sem a chave ou com o banco fora, devolve "falhou" e a
 * pessoa vê um aviso para tentar de novo (não um erro de servidor).
 */
async function gravarPedido(pedido: PedidoLimpo, agora: number): Promise<"gravado" | "repetido" | "falhou"> {
  try {
    const servico = createServiceClient();

    const { count, error: erroDoLimite } = await servico
      .from("pedidos_de_contratacao")
      .select("id", { count: "exact", head: true })
      .eq("whatsapp", pedido.whatsapp)
      .gte("criado_em", new Date(agora - JANELA_DO_WHATSAPP_MS).toISOString());
    if (erroDoLimite) {
      // Sem conseguir conferir, grava: perder o pedido é pior que repeti-lo.
      console.error(`[contratar] limite por WhatsApp não conferido: ${erroDoLimite.message}`);
    } else if ((count ?? 0) > 0) {
      console.warn(`[contratar] pedido repetido de ${mascararParaLog(pedido.whatsapp)} em 24 h; não gravado de novo`);
      return "repetido";
    }

    const codigoDeIndicacao = await codigoDeIndicacaoDoVisitante();
    const { error } = await servico.from("pedidos_de_contratacao").insert({
      // Quem indicou (0247): a plataforma registra a indicação ao converter o pedido.
      codigo_de_indicacao: codigoDeIndicacao,
      // O ramo do negócio (0244): a plataforma cria a conta já nele.
      ramo: pedido.ramo,
      ramo_descricao: pedido.ramoDescricao,
      plano: pedido.plano,
      usuarios: pedido.usuarios,
      nome: pedido.nome,
      whatsapp: pedido.whatsapp,
      email: pedido.email,
      imobiliaria: pedido.imobiliaria,
      creci: pedido.creci,
      documento: pedido.documento,
      cidade: pedido.cidade,
      uf: pedido.uf,
      consentimento_em: new Date(agora).toISOString(),
    });
    if (error) {
      console.error(`[contratar] pedido de ${mascararParaLog(pedido.whatsapp)} não gravado: ${error.message}`);
      return "falhou";
    }
    return "gravado";
  } catch (e) {
    console.error(
      `[contratar] pedido de ${mascararParaLog(pedido.whatsapp)} não gravado:`,
      e instanceof Error ? e.message : e,
    );
    return "falhou";
  }
}

/**
 * Push para quem administra a plataforma (29/10/2026: "todos os atendimentos
 * caem na conta do ADM"). Os aparelhos do ADM moram em
 * `inscricoes_push_da_plataforma` (0239). O texto leva só plano e cidade.
 * Bônus: falha só vai ao log.
 */
async function avisarAdministradores(pedido: PedidoLimpo): Promise<void> {
  try {
    await notificarAdminsDaPlataforma(createServiceClient(), {
      titulo: "Novo pedido de contratação",
      corpo: `${resumoDoPlano(pedido.plano, pedido.usuarios, pedido.ramo)} · ${nomeDoRamo(pedido.ramo, pedido.ramoDescricao)} · ${pedido.cidade}/${pedido.uf}`,
      url: "/plataforma/pedidos",
      tag: "pedido-de-contratacao",
    });
  } catch (e) {
    console.warn("[contratar] aviso aos administradores não enviado:", e instanceof Error ? e.message : e);
  }
}
