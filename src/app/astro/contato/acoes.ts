"use server";

import { headers } from "next/headers";
import { linkDoWhatsAppDaAstro } from "@/lib/marcaDaPlataforma";
import { avisarAtendimento } from "@/lib/notificacoes/avisosDaPlataforma";
import {
  corpoDoAviso,
  ROTULO_DO_ASSUNTO,
  TEMPO_MINIMO_NO_FORMULARIO_MS,
  validarContato,
  type ContatoLimpo,
  type DadosDoContato,
  type ErrosDoContato,
} from "@/lib/plataforma/chamadoDeSuporte";
import { mascararParaLog, primeiroNome } from "@/lib/plataforma/pedidoDeContratacao";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * O envio do "Fale com a Astro" (`/astro/contato`, 29/10/2026).
 *
 * Porta PÚBLICA, com as mesmas defesas do assistente de contratação
 * (`../contratar/acoes.ts`), nesta ordem:
 *
 * 1. Limite por IP, em memória do processo (best-effort, por instância).
 * 2. Robô: campo-isca preenchido ou envio antes do tempo mínimo com o
 *    formulário aberto. Responde como sucesso, sem gravar nem avisar.
 * 3. Consentimento da LGPD marcado.
 * 4. Validação no servidor com as MESMAS regras do navegador
 *    (`validarContato`).
 * 5. Limite por WhatsApp, no banco (vale entre instâncias): o mesmo número
 *    com 3 contatos nas últimas 24 h não grava outro; a pessoa recebe a
 *    mesma confirmação.
 *
 * Grava pela chave de serviço porque a tabela não tem grant para o `anon`
 * (0240). Log nunca leva o dado pessoal inteiro (`mascararParaLog`).
 *
 * Depois da resposta, o aviso no celular dos administradores da plataforma:
 * "Novo contato pelo site", o assunto e o começo da mensagem (é a própria
 * pessoa falando com a Astro). Sem nome, telefone nem e-mail.
 */

export type EnvioDoContato = DadosDoContato & {
  consentimento: boolean;
  /** Campo-isca: invisível para gente; só robô preenche. */
  site: string;
  /** Há quanto tempo o formulário está aberto na tela (ms). */
  abertoHaMs: number;
};

export type RespostaDoContato =
  | { ok: true; primeiroNome: string; assunto: string; whatsappDaAstro: string | null }
  | { ok: false; erro: string; erros?: ErrosDoContato };

const JANELA_DO_IP_MS = 10 * 60 * 1000;
const LIMITE_POR_IP = 5;
const JANELA_DO_WHATSAPP_MS = 24 * 60 * 60 * 1000;
const LIMITE_POR_WHATSAPP = 3;

const ENVIOS_POR_IP = new Map<string, number[]>();

function ipLimitado(ip: string, agora: number): boolean {
  const envios = (ENVIOS_POR_IP.get(ip) ?? []).filter((t) => agora - t < JANELA_DO_IP_MS);
  envios.push(agora);
  ENVIOS_POR_IP.set(ip, envios);
  if (ENVIOS_POR_IP.size > 5000) ENVIOS_POR_IP.clear();
  return envios.length > LIMITE_POR_IP;
}

function confirmacao(c: ContatoLimpo): RespostaDoContato {
  return {
    ok: true,
    primeiroNome: primeiroNome(c.nome),
    assunto: ROTULO_DO_ASSUNTO[c.assunto],
    whatsappDaAstro: linkDoWhatsAppDaAstro(
      undefined,
      `Olá! Acabei de mandar uma mensagem pelo site da Astro (${ROTULO_DO_ASSUNTO[c.assunto].toLowerCase()}). Sou ${c.nome}.`,
    ),
  };
}

export async function enviarContato(envio: EnvioDoContato): Promise<RespostaDoContato> {
  const agora = Date.now();
  const cabecalhos = await headers();
  const ip = cabecalhos.get("x-forwarded-for")?.split(",")[0]?.trim() || cabecalhos.get("x-real-ip") || "desconhecido";
  if (ipLimitado(ip, agora)) {
    return { ok: false, erro: "Muitos envios seguidos. Espere alguns minutos e tente de novo." };
  }

  const corpo = (envio ?? {}) as Partial<EnvioDoContato>;
  const robo =
    (typeof corpo.site === "string" && corpo.site.trim() !== "") ||
    typeof corpo.abertoHaMs !== "number" ||
    !Number.isFinite(corpo.abertoHaMs) ||
    corpo.abertoHaMs < TEMPO_MINIMO_NO_FORMULARIO_MS;

  if (corpo.consentimento !== true) {
    return { ok: false, erro: "Para enviar, confirme que leu e concorda com a Política de Privacidade." };
  }

  const validado = validarContato(corpo);
  if (!validado.ok) return { ok: false, erro: "Confira os dados destacados.", erros: validado.erros };
  const contato = validado.contato;

  if (robo) {
    console.warn("[contato] envio descartado como robô (campo-isca ou rápido demais)");
    return confirmacao(contato);
  }

  const gravado = await gravarContato(contato, agora);
  if (gravado === "falhou") {
    return { ok: false, erro: "Não conseguimos registrar sua mensagem agora. Tente de novo em instantes." };
  }
  if (gravado === "repetido") return confirmacao(contato);

  avisarAtendimento({
    titulo: "Novo contato pelo site",
    corpo: corpoDoAviso(contato.assunto, contato.mensagem),
    url: "/plataforma/suporte",
    // Uma tag por contato: dois contatos seguidos não se apagam na tela.
    tag: `contato-${agora}`,
  });
  return confirmacao(contato);
}

/**
 * Grava o contato, a não ser que o mesmo WhatsApp já tenha 3 nas últimas
 * 24 h. Nunca lança: sem a chave ou com o banco fora, devolve "falhou".
 */
async function gravarContato(contato: ContatoLimpo, agora: number): Promise<"gravado" | "repetido" | "falhou"> {
  try {
    const servico = createServiceClient();

    const { count, error: erroDoLimite } = await servico
      .from("chamados_de_suporte")
      .select("id", { count: "exact", head: true })
      .eq("origem", "site")
      .eq("whatsapp", contato.whatsapp)
      .gte("criado_em", new Date(agora - JANELA_DO_WHATSAPP_MS).toISOString());
    if (erroDoLimite) {
      // Sem conseguir conferir, grava: perder o contato é pior que repeti-lo.
      console.error(`[contato] limite por WhatsApp não conferido: ${erroDoLimite.message}`);
    } else if ((count ?? 0) >= LIMITE_POR_WHATSAPP) {
      console.warn(`[contato] ${mascararParaLog(contato.whatsapp)} passou de ${LIMITE_POR_WHATSAPP} contatos em 24 h; não gravado`);
      return "repetido";
    }

    const { error } = await servico.from("chamados_de_suporte").insert({
      // A hora do servidor da action, a mesma do limite por WhatsApp acima.
      criado_em: new Date(agora).toISOString(),
      origem: "site",
      assunto: contato.assunto,
      mensagem: contato.mensagem,
      nome: contato.nome,
      email: contato.email,
      whatsapp: contato.whatsapp,
      consentimento_em: new Date(agora).toISOString(),
    });
    if (error) {
      console.error(`[contato] contato de ${mascararParaLog(contato.whatsapp)} não gravado: ${error.message}`);
      return "falhou";
    }
    return "gravado";
  } catch (e) {
    console.error(
      `[contato] contato de ${mascararParaLog(contato.whatsapp)} não gravado:`,
      e instanceof Error ? e.message : e,
    );
    return "falhou";
  }
}
