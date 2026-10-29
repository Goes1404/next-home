import "server-only";

import { emailConfigurado } from "@/lib/email";
import { diaEmSP } from "@/lib/crm/resumoDoDia";
import { validarSlugDoGrupo } from "@/lib/grupos/slugDoGrupo";
import { avisarAtendimento } from "@/lib/notificacoes/avisosDaPlataforma";
import { diaDoVencimentoValido, fimDoTesteGratis } from "@/lib/planos/cobranca";
import { createServiceClient } from "@/lib/supabase/service";
import { codigoDeIndicacaoDoVisitante } from "@/lib/indicacoes/cookieDoVisitante";
import { registrarIndicacaoDoPedido } from "@/lib/indicacoes/indicacao";
import { criarContaComPrimeiroAcesso, emailEmFicha } from "./criarConta";
import { padraoDoEmail, validarNovoGrupo } from "./dadosDoGrupo";
import { mascararParaLog, totalMensal, type PedidoLimpo } from "./pedidoDeContratacao";
import { slugSugerido } from "./tiposDeConta";
import { documentoProfissionalDaFicha, vocabularioDoRamo } from "@/lib/ramos/ramos";

/**
 * O teste grátis de 7 dias do assistente `/astro/contratar` (29/10/2026,
 * 0241). Regra do dono: a conta nasce na hora; "sem pagar em 7 dias,
 * suspende sozinha" (`cobranca.ts`, estado `teste` e suspensão imediata no
 * fim).
 *
 * Ordem:
 *
 * 1. Sem envio de e-mail configurado (`RESEND_API_KEY`), NÃO há teste
 *    automático: o link do convite é a confirmação do e-mail, e ele nunca
 *    volta para a tela de um visitante (quem digitasse o e-mail de outra
 *    pessoa entraria na conta dela).
 * 2. Um teste por e-mail, WhatsApp e CPF/CNPJ: conferido aqui (para dar a
 *    frase certa) e TRAVADO no banco pelos índices únicos parciais de
 *    `pedidos_de_contratacao` (0241) — dois envios ao mesmo tempo não
 *    passam os dois. E-mail que já tem ficha (`emailEmFicha`) recusa com
 *    `MENSAGEM_EMAIL_EM_USO`; documento ou telefone que já são de um grupo
 *    também recusam.
 * 3. O pedido é gravado com `teste_gratis = true`, e ele é a PROVA que o
 *    núcleo (`criarContaComPrimeiroAcesso`, origem `teste-gratis`) relê
 *    antes de criar: nada de pular a guarda da plataforma.
 * 4. Conta criada: pedido `convertido` com `grupo_criado_id`, evento
 *    `teste_gratis_iniciado` e aviso "Teste grátis iniciado: <conta>" aos
 *    administradores. Falhou: o pedido perde a marca de teste (a pessoa pode
 *    tentar de novo) e fica `novo`, com a observação, para a Astro chamar.
 *
 * Teste não confirmado (o convite não aceito em 48 h): o grupo FICA, e nada
 * é marcado. Ele não custa nada parado (sem número de WhatsApp, a IA não
 * responde ninguém), e no fim do teste a cobrança o suspende sozinha. A
 * Astro vê na plataforma ("convite pendente") e decide; a rotina de
 * cancelamento (0202) é o caminho para apagar.
 *
 * Log sem dado pessoal inteiro (`mascararParaLog`).
 */

type Servico = ReturnType<typeof createServiceClient>;

export type ResultadoDoTeste =
  | { ok: true; grupoId: string; fimDoTeste: string; emailEnviado: boolean }
  | { ok: false; erro: string; campo?: "email" | "whatsapp" | "documento" };

export const MENSAGEM_TESTE_INDISPONIVEL =
  "O teste grátis automático está indisponível agora. Envie o pedido pelo botão \"Falar com a Astro\" e a gente libera para você.";
export const MENSAGEM_TESTE_JA_USADO =
  "Já existe um teste grátis para este e-mail, WhatsApp ou CPF/CNPJ. Fale com a Astro para assinar.";
export const MENSAGEM_DOCUMENTO_COM_CONTA = "Este CPF/CNPJ já tem uma conta na Astro. Entre pelo login ou fale com a Astro.";
export const MENSAGEM_WHATSAPP_COM_CONTA = "Este WhatsApp já é o contato de uma conta na Astro. Fale com a Astro.";

const ERRO_GENERICO = "Não foi possível começar o teste agora. Tente de novo em instantes.";

/** O primeiro endereço de grupo livre a partir do nome ("silva", "silva-2", ...). */
async function slugDeGrupoLivre(servico: Servico, nome: string): Promise<string | null> {
  let base = slugSugerido(nome).slice(0, 55).replace(/-+$/, "");
  if (base.length < 3) base = `conta-${base}`.replace(/-+$/, "");
  for (let n = 1; n <= 30; n++) {
    const candidato = n === 1 ? base : `${base}-${n}`;
    if (!validarSlugDoGrupo(candidato).ok) continue;
    const { count, error } = await servico
      .from("grupos")
      .select("id", { count: "exact", head: true })
      .eq("slug", candidato);
    if (error) {
      console.error(`[teste grátis] endereço livre não conferido: ${error.message}`);
      return null;
    }
    if ((count ?? 0) === 0) return candidato;
  }
  const sorteado = `${base.slice(0, 50)}-${Date.now().toString(36)}`;
  return validarSlugDoGrupo(sorteado).ok ? sorteado : null;
}

/** As travas de "um teste por pessoa", antes de gravar (a do banco vale de qualquer jeito). */
async function conferirRepetido(servico: Servico, p: PedidoLimpo): Promise<ResultadoDoTeste | null> {
  if (await emailEmFicha(servico, p.email)) {
    return { ok: false, erro: "Este e-mail já tem acesso à Astro. Entre pelo login ou use outro e-mail.", campo: "email" };
  }

  const consultas = [
    servico
      .from("pedidos_de_contratacao")
      .select("id", { count: "exact", head: true })
      .eq("teste_gratis", true)
      .ilike("email", padraoDoEmail(p.email)),
    servico
      .from("pedidos_de_contratacao")
      .select("id", { count: "exact", head: true })
      .eq("teste_gratis", true)
      .eq("whatsapp", p.whatsapp),
    servico.from("grupos").select("id", { count: "exact", head: true }).eq("contato_cobranca_telefone", p.whatsapp),
    ...(p.documento
      ? [
          servico
            .from("pedidos_de_contratacao")
            .select("id", { count: "exact", head: true })
            .eq("teste_gratis", true)
            .eq("documento", p.documento),
          servico.from("grupos").select("id", { count: "exact", head: true }).eq("documento", p.documento),
        ]
      : []),
  ];
  const [porEmail, porWhatsapp, grupoPorWhatsapp, porDocumento, grupoPorDocumento] = await Promise.all(consultas);
  const falha = [porEmail, porWhatsapp, grupoPorWhatsapp, porDocumento, grupoPorDocumento].find((r) => r?.error);
  if (falha?.error) {
    // "Não sei" não libera teste: o índice único seguraria o repetido, mas
    // o grupo por documento/telefone não tem índice que o segure.
    console.error(`[teste grátis] repetição não conferida: ${falha.error.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if ((porEmail.count ?? 0) > 0) return { ok: false, erro: MENSAGEM_TESTE_JA_USADO, campo: "email" };
  if ((porWhatsapp.count ?? 0) > 0) return { ok: false, erro: MENSAGEM_TESTE_JA_USADO, campo: "whatsapp" };
  if ((porDocumento?.count ?? 0) > 0) return { ok: false, erro: MENSAGEM_TESTE_JA_USADO, campo: "documento" };
  if ((grupoPorDocumento?.count ?? 0) > 0) return { ok: false, erro: MENSAGEM_DOCUMENTO_COM_CONTA, campo: "documento" };
  if ((grupoPorWhatsapp.count ?? 0) > 0) return { ok: false, erro: MENSAGEM_WHATSAPP_COM_CONTA, campo: "whatsapp" };
  return null;
}

/**
 * Começa o teste grátis do pedido (já validado por `validarPedido` e
 * `errosDoTesteGratis`). Nunca lança: erro vira a frase para a tela.
 */
export async function iniciarTesteGratis(
  p: PedidoLimpo,
  consentimentoEm: Date,
  agora: Date = new Date(),
): Promise<ResultadoDoTeste> {
  if (!emailConfigurado()) return { ok: false, erro: MENSAGEM_TESTE_INDISPONIVEL };
  // O documento do ramo (0244): CRECI obrigatório na imobiliária; nos ramos
  // sem registro obrigatório, a ficha leva o marcador "Não informado".
  const documentoDaFicha = documentoProfissionalDaFicha(p.ramo, p.creci);
  if (!documentoDaFicha) {
    return { ok: false, erro: `Para começar o teste grátis, informe o ${vocabularioDoRamo(p.ramo).documento.rotulo}.` };
  }

  try {
    const servico = createServiceClient();
    const repetido = await conferirRepetido(servico, p);
    if (repetido) return repetido;

    const imobiliaria = p.plano === "imobiliaria";
    const nomeDaConta = imobiliaria && p.imobiliaria ? p.imobiliaria : p.nome;
    const slug = await slugDeGrupoLivre(servico, nomeDaConta);
    if (!slug) return { ok: false, erro: ERRO_GENERICO };

    const grupo = validarNovoGrupo({
      nome: nomeDaConta,
      slug,
      tipo: imobiliaria ? "imobiliaria" : "independente",
      plano: p.plano,
      // A imobiliária: quem pediu é o contato de cobrança. O autônomo: em
      // branco, e `validarNovoGrupo` usa o primeiro acesso.
      contatoNome: imobiliaria ? p.nome : "",
      contatoEmail: imobiliaria ? p.email : "",
      contatoTelefone: imobiliaria ? p.whatsapp : "",
      primeiroNome: p.nome,
      primeiroCreci: documentoDaFicha,
      primeiroWhatsapp: p.whatsapp,
      primeiroEmail: p.email,
    });
    if (!grupo.ok) return { ok: false, erro: grupo.erro };

    // Indique e ganhe (0247, 29/10/2026): o código que o visitante trouxe
    // (cookie de `/i/<codigo>` ou de `?indicacao=`) fica no pedido.
    const codigoDeIndicacao = await codigoDeIndicacaoDoVisitante();

    // O pedido com a marca do teste: a trava do banco e a prova do núcleo.
    const { data: pedido, error: erroDoPedido } = await servico
      .from("pedidos_de_contratacao")
      .insert({
        ramo: p.ramo,
        ramo_descricao: p.ramoDescricao,
        plano: p.plano,
        usuarios: p.usuarios,
        nome: p.nome,
        whatsapp: p.whatsapp,
        email: p.email,
        imobiliaria: p.imobiliaria,
        creci: p.creci,
        documento: p.documento,
        cidade: p.cidade,
        uf: p.uf,
        consentimento_em: consentimentoEm.toISOString(),
        teste_gratis: true,
        codigo_de_indicacao: codigoDeIndicacao,
      })
      .select("id")
      .single();
    if (erroDoPedido || !pedido) {
      if (erroDoPedido?.code === "23505") return { ok: false, erro: MENSAGEM_TESTE_JA_USADO };
      console.error(`[teste grátis] pedido de ${mascararParaLog(p.whatsapp)} não gravado: ${erroDoPedido?.message ?? "sem linha"}`);
      return { ok: false, erro: ERRO_GENERICO };
    }

    const fim = fimDoTesteGratis(agora);
    const fimDoTeste = diaEmSP(fim);
    const conta = await criarContaComPrimeiroAcesso(
      { origem: "teste-gratis", pedidoId: pedido.id },
      grupo.dados,
      {
        // O ramo escolhido no assistente (0244): é ele que personaliza o CRM.
        ramo: p.ramo,
        ramo_descricao: p.ramoDescricao,
        razao_social: null,
        documento: p.documento,
        creci: p.creci,
        creci_tipo: p.creci ? (imobiliaria ? "J" : "F") : null,
        mensalidade: totalMensal(p.plano, p.usuarios),
        // As faturas seguintes caem no dia do fim do teste (até 28).
        dia_do_vencimento: diaDoVencimentoValido(Number(fimDoTeste.slice(8, 10))),
        teste_ate: fim.toISOString(),
      },
      agora,
    );

    if (!conta.ok) {
      // O pedido fica `novo` para a Astro chamar, sem a marca: a pessoa pode tentar de novo.
      const { error } = await servico
        .from("pedidos_de_contratacao")
        .update({
          teste_gratis: false,
          observacao: `Teste grátis não iniciado: ${conta.erro}`.slice(0, 2000),
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", pedido.id);
      if (error) console.error(`[teste grátis] pedido ${pedido.id} não desmarcado: ${error.message}`);
      return { ok: false, erro: conta.erro };
    }

    const { error: erroDaConversao } = await servico
      .from("pedidos_de_contratacao")
      .update({ status: "convertido", grupo_criado_id: conta.grupoId, atualizado_em: new Date().toISOString() })
      .eq("id", pedido.id);
    if (erroDaConversao) console.error(`[teste grátis] pedido ${pedido.id} não marcado convertido: ${erroDaConversao.message}`);

    // A conta nasceu: liga à conta que indicou (0247). Nunca derruba o teste.
    const indicacao = await registrarIndicacaoDoPedido(servico, {
      pedidoId: pedido.id,
      grupoIndicadoId: conta.grupoId,
      codigoDoVisitante: codigoDeIndicacao,
    });
    if (indicacao.resultado === "falhou") {
      console.error(`[teste grátis] indicação do grupo ${conta.grupoId} não registrada: ${indicacao.motivo}`);
    }

    const { error: erroDoEvento } = await servico.from("admin_eventos").insert({
      grupo_id: conta.grupoId,
      acao: "teste_gratis_iniciado",
      ator_id: null,
      ator_plataforma_user_id: null,
      alvo_corretor_id: null,
      detalhes: {
        origem: "teste-gratis",
        pedido_id: pedido.id,
        plano: p.plano,
        ramo: p.ramo,
        teste_ate: fim.toISOString(),
        convite_enviado: conta.enviado,
      },
    });
    if (erroDoEvento) console.error(`[teste grátis] evento do grupo ${conta.grupoId} não gravado: ${erroDoEvento.message}`);

    avisarAtendimento({
      titulo: "Teste grátis iniciado",
      corpo: `Teste grátis iniciado: ${grupo.dados.nome}.${conta.enviado ? "" : " O e-mail do convite NÃO saiu: reenvie pela plataforma."}`,
      url: `/plataforma/grupos/${conta.grupoId}`,
      tag: `teste-gratis-${conta.grupoId}`,
    });

    // O link do convite NUNCA volta para a tela pública (`conta.url` fica aqui).
    return { ok: true, grupoId: conta.grupoId, fimDoTeste, emailEnviado: conta.enviado };
  } catch (e) {
    console.error(`[teste grátis] ${mascararParaLog(p.whatsapp)}: ${e instanceof Error ? e.message : "erro"}`);
    return { ok: false, erro: ERRO_GENERICO };
  }
}
