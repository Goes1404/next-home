"use server";

import { problemasDasPalavrasChave } from "@/lib/whatsapp/palavraChaveDiscreta";
import { FRASE_RECUSADO_PELO_WHATSAPP, pareamentoRecusado } from "@/lib/whatsapp/pareamentoRecusado";
import { site } from "@/lib/site";
import { revalidatePath } from "next/cache";
import { sondarProvedor } from "@/lib/whatsapp/sonda";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getEmpreendimentos } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PROMPT_VERSAO } from "@/lib/whatsapp/aiAgent";
import type { MotivoFalhaLlm } from "@/lib/whatsapp/llmTipos";
import { executarTurnoDeAtendimento } from "@/lib/whatsapp/turnoDeAtendimento";
import { lerCasaDoGrupo } from "@/lib/whatsapp/casaDoGrupo";
import { registrarInteracao } from "@/lib/whatsapp/telemetria";
import { extrairDossieCliente } from "@/lib/whatsapp/dossierExtractor";
import { desconectarInstancia, obterQrCodeInstancia, provedorConfigurado, type DesfechoPareamento } from "@/lib/whatsapp/provider";
import { sincronizarConexaoInstancia } from "@/lib/whatsapp/repositorio";
import { normalizarWhatsapp } from "@/lib/whatsapp";
import { FRASE_NUMERO_EM_OUTRO_GRUPO, numeroEmOutroGrupo } from "@/lib/whatsapp/numeroDeUmGrupo";
import type { ModoBotWhatsapp, TomVozBot } from "@/lib/whatsapp/types";

/**
 * Ações do painel de WhatsApp do corretor.
 *
 * O playground precisa exercitar o MESMO caminho que atende o cliente lá na
 * ponta (`aiAgent` + `dossierExtractor` sobre o catálogo real) — um
 * simulador com respostas escritas à mão não valida tom de voz nem
 * recomendação de imóvel, que é justamente para o que ele serve.
 */

/** Nome da instância no provedor — derivado do slug, estável e único por corretor. */
function nomeInstanciaDe(slug: string): string {
  return `nexthome-${slug}`;
}

export type RespostaPlayground = {
  texto: string;
  anexos: { tipo: string; url: string; titulo: string }[];
  sugerirVisita: boolean;
  transferirHumano: boolean;
  score: number;
  temperatura: string;
  resumoDossie: string;
  /** false = respondido pelo fallback, sem passar pelo motor de IA. */
  iaAtiva: boolean;
  /** Por que caiu no fallback — a tela usa isto para dizer a verdade. */
  motivoFalha?: MotivoFalhaLlm | null;
  /** Qual modelo respondeu. É o A/B mais barato entre os provedores. */
  modelo?: string | null;
};

export async function testarAgenteIA(
  mensagem: string,
  historico: { remetente: "cliente" | "bot" | "corretor"; texto: string }[] = [],
): Promise<RespostaPlayground | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };
  if (!mensagem.trim()) return { erro: "Digite uma mensagem para testar." };

  const supabase = await createClient();
  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("nome_assistente, tom_voz, regras_da_ia")
    .eq("corretor_id", corretor.id)
    .maybeSingle();

  let catalogo: Awaited<ReturnType<typeof getEmpreendimentos>> = [];
  try {
    // O catálogo do grupo do corretor, como no atendimento de verdade (L15).
    catalogo = await getEmpreendimentos(corretor.grupoId);
  } catch {
    // Catálogo indisponível não impede testar o tom de voz.
  }

  /*
   * Playground = produção, e agora por CONSTRUÇÃO e não por disciplina: é
   * a mesma função que o webhook chama (`turnoDeAtendimento.ts`). A versão
   * anterior remontava o preparo aqui, e foi assim que ela já divergiu uma
   * vez — pulava few-shot e ranking, então o corretor aprovava um
   * comportamento no teste e recebia outro na rua.
   */
  const turno = await executarTurnoDeAtendimento({
    quemPaga: { corretorId: corretor.id, grupoId: corretor.grupoId },
    identidade: {
      nomeCorretor: corretor.nome,
      slugCorretor: corretor.slug ?? undefined,
      creciCorretor: corretor.creci,
      telefoneCorretor: corretor.whatsapp,
      nomeAssistente: instancia?.nome_assistente ?? site.assistente,
      tomVoz: instancia?.tom_voz ?? "consultivo_alto_padrao",
      regrasDaIa: instancia?.regras_da_ia ?? null,
      // A casa do grupo do corretor, como no atendimento de verdade (fase 4).
      casa: await lerCasaDoGrupo(corretor.grupoId),
    },
    catalogo,
    historico: [...historico, { remetente: "cliente" as const, texto: mensagem }],
    fewShot: { corretorId: corretor.id },
  });

  const resposta = turno.resposta;

  // Playground também entra na telemetria — com origem própria, para as
  // métricas de produção nunca se misturarem com testes do corretor.
  await registrarInteracao({
    corretorId: corretor.id,
    origem: "playground",
    promptVersao: PROMPT_VERSAO,
    latenciaMs: resposta.meta.latenciaMs,
    fallback: resposta.meta.fallback,
    acao: "respondida",
    sugeriuVisita: resposta.sugerirVisita,
    transferiuHumano: resposta.transferirHumano,
    anexosBloqueados: turno.bloqueios,
    tokensEntrada: resposta.meta.tokensEntrada,
    tokensSaida: resposta.meta.tokensSaida,
    modelo: resposta.meta.modelo,
  });

  const conversaCompleta = [...historico.map((h) => h.texto), mensagem].join("\n");
  const dossie = await extrairDossieCliente(conversaCompleta, `playground-${corretor.id}`, {
    corretorId: corretor.id,
    grupoId: corretor.grupoId,
  });

  return {
    texto: resposta.textoResposta,
    anexos: turno.anexos,
    sugerirVisita: resposta.sugerirVisita,
    transferirHumano: resposta.transferirHumano,
    score: dossie.temperaturaScore,
    temperatura: dossie.temperaturaLabel,
    resumoDossie: dossie.resumoExecutivo,
    /*
     * O sinal honesto é o `meta.fallback` — o mesmo que já vai para a
     * telemetria. A versão anterior procurava a palavra "Fallback" dentro
     * de `motivoTransferencia`: um texto livre, que a IA de verdade também
     * pode escrever, decidindo se a IA estava ativa ou não.
     */
    iaAtiva: !resposta.meta.fallback,
    motivoFalha: resposta.meta.motivoFalha,
    modelo: resposta.meta.modelo,
  };
}

export async function salvarConfiguracaoWhatsapp(params: {
  nomeAssistente: string;
  tomVoz: TomVozBot;
  modoBot: ModoBotWhatsapp;
  /** Frase que, digitada pelo próprio corretor no chat, "liga" a IA na conversa. Vazio = recurso desligado. */
  palavraChaveAtivacao?: string;
  palavraChaveTeste?: string;
  /** Frases que o CLIENTE escreve e que liberam a IA na hora (0056). */
  palavrasEntradaCliente?: string;
  /** O expediente do corretor (0148). */
  expedienteInicio?: number;
  expedienteFim?: number;
  /** As regras do corretor para a IA (0154). Vazio = sem regras. */
  regrasDaIa?: string;
}): Promise<{ ok?: string; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const nome = params.nomeAssistente.trim();
  if (nome.length < 2 || nome.length > 40) {
    return { erro: "O nome da assistente precisa ter entre 2 e 40 caracteres." };
  }

  const expedienteInicio = Number.isInteger(params.expedienteInicio) ? Number(params.expedienteInicio) : 9;
  const expedienteFim = Number.isInteger(params.expedienteFim) ? Number(params.expedienteFim) : 21;
  if (expedienteInicio < 0 || expedienteInicio > 23 || expedienteFim < 1 || expedienteFim > 24) {
    return { erro: "Escolha um horário de expediente válido." };
  }
  if (expedienteInicio >= expedienteFim) {
    return { erro: "O expediente precisa terminar depois de começar." };
  }

  const palavraChave = params.palavraChaveAtivacao?.trim() || null;
  const palavraTeste = params.palavraChaveTeste?.trim() || null;
  const frasesEntrada = params.palavrasEntradaCliente?.trim() || null;
  const regrasDaIa = params.regrasDaIa?.trim() || null;
  if (regrasDaIa && regrasDaIa.length > 1500) {
    return { erro: "As regras para a IA passam de 1500 caracteres. Encurte um pouco." };
  }

  /*
   * Duas palavras iguais fariam a de teste vencer sempre (ela é conferida
   * primeiro) e o corretor perderia o modo normal sem entender por quê.
   */
  if (palavraChave && palavraTeste && palavraChave.toLowerCase() === palavraTeste.toLowerCase()) {
    return { erro: "A palavra de teste precisa ser diferente da de ativação." };
  }
  /*
   * A porta de entrada do cliente é a ÚNICA que afrouxa a trava, então a
   * validação dela é por FRASE, não pelo campo inteiro: "vim pelo anúncio,
   * oi" tem uma frase legítima e uma que abriria a conversa para qualquer
   * pessoa que cumprimenta.
   */
  for (const frase of (frasesEntrada ?? "").split(",").map((f) => f.trim()).filter(Boolean)) {
    if (frase.length < 3) {
      return {
        erro: `"${frase}" é curta demais para liberar a IA sozinha — use uma frase que só quem viu sua divulgação escreveria.`,
      };
    }
  }

  const supabase = await createClient();

  /*
   * A palavra-chave tem que ser DISCRETA (regra N8, 03/10/2026): o cliente lê
   * a mensagem em que ela aparece, e desde a 0146 ela também cadastra o
   * número como lead. A régua vale só para palavra NOVA: a que já estava
   * salva continua valendo, para a regra não desligar de surpresa o que o
   * corretor usa hoje (a tela avisa e pede a troca).
   */
  const { data: atual } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("palavra_chave_ativacao, palavra_chave_teste")
    .eq("corretor_id", corretor.id)
    .maybeSingle();
  for (const [rotulo, valor, antigo] of [
    ["Palavra-chave", palavraChave, atual?.palavra_chave_ativacao],
    ["Palavra de teste", palavraTeste, atual?.palavra_chave_teste],
  ] as const) {
    const problema = problemasDasPalavrasChave(valor, antigo)[0];
    if (problema) return { erro: `${rotulo}: ${problema}` };
  }

  /*
   * Desde a 0175 a sessão do corretor só altera as colunas de configuração.
   * A linha do número nasce pelo servidor: o nome da instância é o que liga
   * o webhook da Evolution a ESTE corretor, e escolhido pelo navegador
   * poderia ser o de um colega que ainda não conectou. Linha que já existe
   * mantém o nome, porque é com ele que a instância foi criada na Evolution.
   */
  if (!atual) {
    const { error: erroLinha } = await createServiceClient()
      .from("corretor_whatsapp_instancias")
      .upsert(
        { corretor_id: corretor.id, instance_name: nomeInstanciaDe(corretor.slug) },
        { onConflict: "corretor_id", ignoreDuplicates: true },
      );
    if (erroLinha) {
      console.error("[whatsapp] não consegui criar a linha do número:", erroLinha.message);
      return { erro: "Não foi possível salvar agora. Tente novamente." };
    }
  }

  const { data, error } = await supabase
    .from("corretor_whatsapp_instancias")
    .update({
      nome_assistente: nome,
      tom_voz: params.tomVoz,
      palavras_entrada_cliente: frasesEntrada,
      modo_bot: params.modoBot,
      palavra_chave_ativacao: palavraChave,
      palavra_chave_teste: palavraTeste,
      expediente_inicio: expedienteInicio,
      expediente_fim: expedienteFim,
      regras_da_ia: regrasDaIa,
      updated_at: new Date().toISOString(),
    })
    .eq("corretor_id", corretor.id)
    .select("id");

  // Sem o `.select()` de conferência, uma policy que negasse a escrita
  // devolveria zero linhas sem erro e a tela diria "salvo" sem ter salvado.
  if (error) return { erro: "Não foi possível salvar agora. Tente novamente." };
  if (!data || data.length === 0) {
    return { erro: "Sem permissão para salvar esta configuração." };
  }

  revalidatePath("/corretor/whatsapp");
  return { ok: "Configurações salvas." };
}

export type EstadoConexao = {
  configurado: boolean;
  qrcodeBase64?: string | null;
  /** Código de 8 caracteres para digitar no celular, quando o corretor pareia por número. */
  codigoPareamento?: string | null;
  jaConectado?: boolean;
  /**
   * O que de fato saiu do provedor. A tela precisa disto para nunca mais
   * cair no desfecho antigo: sem código e sem erro, ela não tinha o que
   * dizer e devolvia o formulário vazio como se nada tivesse acontecido.
   */
  desfecho?: DesfechoPareamento;
  /** Quando o código chegou, no relógio do servidor: a tela devolve isto ao perguntar se conectou. */
  iniciadoEm?: string;
  erro?: string;
};

/**
 * Inicia o pareamento. Sem `telefone`, devolve o QR Code de sempre; com
 * ele, o código digitável — o caminho de quem está no painel PELO celular
 * e não tem uma segunda tela para apontar a câmera.
 */
export async function conectarWhatsapp(telefone?: string): Promise<EstadoConexao> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { configurado: false, erro: "Sessão expirada. Entre novamente." };

  if (!provedorConfigurado()) {
    return {
      configurado: false,
      erro: "Nenhum provedor de WhatsApp está conectado a este ambiente. Configure WHATSAPP_API_URL e WHATSAPP_API_KEY para parear um número.",
    };
  }

  // O risco do número é do corretor (L44): sem o aceite da versão vigente
  // dos termos, nada de conectar. O layout já leva aos termos; isto cobre a
  // action chamada direto.
  const numero = telefone?.trim() ? normalizarWhatsapp(telefone) : null;
  if (telefone?.trim() && !numero) {
    return { configurado: true, erro: "Número inválido. Use DDD + número, ex.: 11 99999-8888." };
  }

  // Um número, um grupo (0198). No pareamento por código o número vem
  // digitado, então dá para recusar antes de falar com o provedor. No QR o
  // número só aparece quando conecta, e quem recusa é a sincronização.
  const servico = createServiceClient();
  if (numero && (await numeroEmOutroGrupo(servico, corretor.grupoId, numero)) === true) {
    return { configurado: true, erro: FRASE_NUMERO_EM_OUTRO_GRUPO };
  }

  const instanceName = nomeInstanciaDe(corretor.slug);
  const resultado = await obterQrCodeInstancia(instanceName, numero);

  if (!resultado.ok) {
    return { configurado: true, erro: resultado.detalhe || "Falha ao falar com o provedor." };
  }

  /*
   * Estado da conexão é do servidor (0175): a sessão do corretor não altera
   * status, carimbos nem o nome da instância. O corretor vem da sessão e o
   * estado vem da resposta do provedor; nada aqui sai do navegador.
   *
   * "Já conectado" NÃO é gravado direto como conectado (0198): o número que
   * está no ar pode ser de outra conta (o mesmo que foi recusado antes, com
   * o logout que falhou). Quem marca conectado, carimba `conectado_em` e
   * apaga o marco da queda é a sincronização logo abaixo, que confere o
   * número antes.
   */
  const { error: erroEstado } = await servico.from("corretor_whatsapp_instancias").upsert(
    {
      corretor_id: corretor.id,
      instance_name: instanceName,
      status_conexao: "conectando",
      // No pareamento por número não há QR para ninguém ler: guardar um
      // seria o mesmo lixo de 13 KB que já estava no banco, envelhecendo
      // sem nunca ser exibido.
      qrcode_base64: numero ? null : resultado.qrcodeBase64,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "corretor_id" },
  );
  if (erroEstado) console.error("[whatsapp] não consegui gravar o estado da conexão:", erroEstado.message);

  if (resultado.jaConectado) {
    const { data: linha } = await servico
      .from("corretor_whatsapp_instancias")
      .select("id, conectado_em, telefone_conectado")
      .eq("corretor_id", corretor.id)
      .maybeSingle();
    if (linha) {
      const estado = await sincronizarConexaoInstancia({
        instanciaId: linha.id,
        instanceName,
        conectadoEmAtual: linha.conectado_em,
        telefoneAtual: linha.telefone_conectado,
      });
      if (estado.estado === "numero_de_outro_grupo") {
        revalidatePath("/corretor/whatsapp");
        return { configurado: true, erro: estado.detalhe ?? FRASE_NUMERO_EM_OUTRO_GRUPO };
      }
    }
  }

  revalidatePath("/corretor/whatsapp");
  return {
    configurado: true,
    qrcodeBase64: resultado.qrcodeBase64,
    codigoPareamento: resultado.codigoPareamento,
    jaConectado: resultado.jaConectado,
    desfecho: resultado.desfecho,
    // Depois de recomeçar a instância e de o código chegar: o que cair a
    // partir daqui (com folga) é o WhatsApp recusando o aparelho.
    iniciadoEm: new Date().toISOString(),
  };
}

/**
 * Pergunta ao provedor se o pareamento terminou.
 *
 * O pareamento acaba fora do nosso alcance — o corretor digita o código no
 * celular e quem descobre isso é a Evolution. Sem esta pergunta, a tela
 * ficava em "Aguardando Leitura" mesmo depois de conectar, e o corretor
 * concluía que não tinha funcionado. O `connection.update` do webhook
 * atualiza o banco, mas chega uma vez só e ninguém estava escutando.
 *
 * Reusa `sincronizarConexaoInstancia`, que já carimba `conectado_em` — a
 * coluna de que depende TODO disparo de campanha.
 */
export async function verificarConexaoWhatsapp(desde?: string): Promise<{
  conectado: boolean;
  estado: string;
  telefone?: string | null;
  /** O número pareou mas é de outra conta da plataforma (0198): a frase para a tela. */
  recusado?: string;
  /** O WhatsApp recusou o aparelho depois de o código aparecer: a frase para a tela. */
  recusadoPeloWhatsapp?: string;
}> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { conectado: false, estado: "sem_sessao" };

  const supabase = await createClient();
  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("id, instance_name, conectado_em, telefone_conectado")
    .eq("corretor_id", corretor.id)
    .maybeSingle();

  if (!instancia?.instance_name) return { conectado: false, estado: "sem_instancia" };

  const estado = await sincronizarConexaoInstancia({
    instanciaId: instancia.id,
    instanceName: instancia.instance_name,
    conectadoEmAtual: instancia.conectado_em,
    telefoneAtual: instancia.telefone_conectado,
  });

  if (estado.estado === "numero_de_outro_grupo") {
    revalidatePath("/corretor/whatsapp");
    return { conectado: false, estado: estado.estado, recusado: estado.detalhe ?? FRASE_NUMERO_EM_OUTRO_GRUPO };
  }

  if (estado.conectado) {
    revalidatePath("/corretor/whatsapp");
    // A faixa de "número fora do ar" vive no LAYOUT do painel, e layout não
    // re-executa ao navegar entre rotas irmãs: sem revalidar a camada de
    // layout, o corretor reconecta e o aviso continua na tela até um
    // recarregamento completo — "consertei e o alerta não sumiu" é a pior
    // leitura possível de um alerta.
    revalidatePath("/corretor", "layout");
  }

  const { data: atualizada } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("telefone_conectado")
    .eq("id", instancia.id)
    .maybeSingle();

  // A queda depois do código, pela chave de serviço: o motivo da queda é
  // estado do número (0175), fora do que a sessão do corretor lê. A linha
  // é a desta sessão, achada acima.
  if (!estado.conectado && desde) {
    const { data: queda } = await createServiceClient()
      .from("corretor_whatsapp_instancias")
      .select("motivo_queda_codigo, motivo_queda_em")
      .eq("id", instancia.id)
      .maybeSingle();
    if (pareamentoRecusado({ pedidoEm: desde, quedaCodigo: queda?.motivo_queda_codigo, quedaEm: queda?.motivo_queda_em })) {
      return { conectado: false, estado: estado.estado, recusadoPeloWhatsapp: FRASE_RECUSADO_PELO_WHATSAPP };
    }
  }

  return {
    conectado: estado.conectado,
    estado: estado.estado,
    telefone: atualizada?.telefone_conectado ?? instancia.telefone_conectado,
  };
}

/**
 * Desliga o número pelo painel.
 *
 * Antes disso só dava para desconectar PELO CELULAR (WhatsApp → Aparelhos
 * conectados → sair): quem trocou de aparelho, perdeu o telefone ou saiu da
 * empresa deixava o número preso à instância, sem saída pelo sistema.
 *
 * O carimbo de conexão é zerado junto: `conectado_em` é a base da curva de
 * aquecimento anti-ban (antiBan.ts), e um número novo herdando a maturidade
 * do anterior sairia disparando em volume alto no primeiro dia — o padrão
 * clássico de banimento.
 */
export async function desconectarWhatsapp(): Promise<{ ok?: string; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const instanceName = nomeInstanciaDe(corretor.slug);
  const resultado = await desconectarInstancia(instanceName);

  if (!resultado.ok) {
    return { erro: resultado.detalhe || "Não foi possível desconectar agora. Tente novamente." };
  }

  // Pela chave de serviço, como no conectar: estado da conexão é do servidor (0175).
  const { error } = await createServiceClient()
    .from("corretor_whatsapp_instancias")
    .update({
      status_conexao: "desconectado",
      conectado_em: null,
      telefone_conectado: null,
      qrcode_base64: null,
      updated_at: new Date().toISOString(),
    })
    .eq("corretor_id", corretor.id);
  if (error) console.error("[whatsapp] não consegui gravar a desconexão:", error.message);

  revalidatePath("/corretor/whatsapp");
  // Desconectar por vontade própria também muda a faixa do layout.
  revalidatePath("/corretor", "layout");
  return { ok: "Número desconectado. A IA para de responder até você conectar de novo." };
}

/**
 * Roda a sonda de diagnóstico do provedor e guarda a resposta crua.
 *
 * TEMPORÁRIA — existe para o caso de 27/08/2026, em que a Evolution
 * confirmava envio (devolvia `key.id`) sem que mensagem nenhuma chegasse,
 * enquanto continuava recebendo normalmente. Some junto com o botão quando
 * a causa aparecer. Ver `lib/whatsapp/sonda.ts`.
 */
export async function diagnosticarProvedorWhatsapp(): Promise<{ ok?: string; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const supabase = await createClient();
  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("instance_name, telefone_conectado")
    .eq("corretor_id", corretor.id)
    .maybeSingle();

  if (!instancia?.instance_name) return { erro: "Nenhum número conectado para diagnosticar." };

  // O teste manda para o PRÓPRIO número conectado: não incomoda cliente
  // nenhum, não gasta reputação com terceiro, e dá para conferir na hora
  // abrindo o WhatsApp — se a mensagem não aparecer nem para si mesmo, o
  // problema não é do destinatário.
  const destino = instancia.telefone_conectado;
  if (!destino) return { erro: "O provedor não informa qual número está pareado." };

  const resultado = await sondarProvedor(instancia.instance_name, destino);
  if ("erro" in resultado) return { erro: resultado.erro };

  return {
    ok: "Diagnóstico gravado. Confira se a mensagem de teste chegou no seu WhatsApp e avise.",
  };
}
