"use server";

import { revalidatePath } from "next/cache";
import { sondarProvedor } from "@/lib/whatsapp/sonda";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getEmpreendimentos } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { PROMPT_VERSAO } from "@/lib/whatsapp/aiAgent";
import type { MotivoFalhaLlm } from "@/lib/whatsapp/llmTipos";
import { executarTurnoDeAtendimento } from "@/lib/whatsapp/turnoDeAtendimento";
import { registrarInteracao } from "@/lib/whatsapp/telemetria";
import { extrairDossieCliente } from "@/lib/whatsapp/dossierExtractor";
import { desconectarInstancia, obterQrCodeInstancia, provedorConfigurado, type DesfechoPareamento } from "@/lib/whatsapp/provider";
import { sincronizarConexaoInstancia } from "@/lib/whatsapp/repositorio";
import { normalizarWhatsapp } from "@/lib/whatsapp";
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
    .select("nome_assistente, tom_voz")
    .eq("corretor_id", corretor.id)
    .maybeSingle();

  let catalogo: Awaited<ReturnType<typeof getEmpreendimentos>> = [];
  try {
    catalogo = await getEmpreendimentos();
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
    identidade: {
      nomeCorretor: corretor.nome,
      slugCorretor: corretor.slug ?? undefined,
      creciCorretor: corretor.creci,
      telefoneCorretor: corretor.whatsapp,
      nomeAssistente: instancia?.nome_assistente ?? "Sofia",
      tomVoz: instancia?.tom_voz ?? "consultivo_alto_padrao",
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
  const dossie = await extrairDossieCliente(conversaCompleta, `playground-${corretor.id}`);

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
}): Promise<{ ok?: string; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const nome = params.nomeAssistente.trim();
  if (nome.length < 2 || nome.length > 40) {
    return { erro: "O nome da assistente precisa ter entre 2 e 40 caracteres." };
  }

  const palavraChave = params.palavraChaveAtivacao?.trim() || null;
  const palavraTeste = params.palavraChaveTeste?.trim() || null;
  const frasesEntrada = params.palavrasEntradaCliente?.trim() || null;

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

  for (const [rotulo, valor] of [
    ["A palavra-chave", palavraChave],
    ["A palavra de teste", palavraTeste],
  ] as const) {
    /*
     * O mínimo existe porque o casamento é por substring: a palavra
     * cadastrada em produção era "Teste", e "testei"/"testando" abriam a
     * porta. Três caracteres é pouco, mas é o piso que já existia.
     */
    if (valor && valor.length < 3) {
      return { erro: `${rotulo} precisa ter pelo menos 3 caracteres, para não disparar por acaso.` };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("corretor_whatsapp_instancias")
    .upsert(
      {
        corretor_id: corretor.id,
        instance_name: nomeInstanciaDe(corretor.slug),
        nome_assistente: nome,
        tom_voz: params.tomVoz,
        palavras_entrada_cliente: frasesEntrada,
        modo_bot: params.modoBot,
        palavra_chave_ativacao: palavraChave,
        palavra_chave_teste: palavraTeste,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "corretor_id" },
    )
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

  const numero = telefone?.trim() ? normalizarWhatsapp(telefone) : null;
  if (telefone?.trim() && !numero) {
    return { configurado: true, erro: "Número inválido. Use DDD + número, ex.: 11 99999-8888." };
  }

  const instanceName = nomeInstanciaDe(corretor.slug);
  const resultado = await obterQrCodeInstancia(instanceName, numero);

  if (!resultado.ok) {
    return { configurado: true, erro: resultado.detalhe || "Falha ao falar com o provedor." };
  }

  const supabase = await createClient();
  await supabase.from("corretor_whatsapp_instancias").upsert(
    {
      corretor_id: corretor.id,
      instance_name: instanceName,
      status_conexao: resultado.jaConectado ? "conectado" : "conectando",
      // No pareamento por número não há QR para ninguém ler: guardar um
      // seria o mesmo lixo de 13 KB que já estava no banco, envelhecendo
      // sem nunca ser exibido.
      qrcode_base64: numero ? null : resultado.qrcodeBase64,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "corretor_id" },
  );

  /*
   * Carimba o marco do pareamento — é dele que sai a curva de aquecimento
   * anti-ban e, sem ele, `reservarCotaCampanha` recusa TODO disparo de
   * campanha (era o que deixava a fila inteira parada em 'pendente' sem
   * erro nenhum). O webhook `connection.update` também carimba; este
   * caminho cobre quem já estava pareado antes deste código existir.
   *
   * `is("conectado_em", null)` é o que impede uma reconexão (queda de
   * internet, troca de aparelho, clique repetido no botão) de zerar a curva
   * de um número que já vinha maduro.
   */
  if (resultado.jaConectado) {
    await supabase
      .from("corretor_whatsapp_instancias")
      .update({ conectado_em: new Date().toISOString() })
      .eq("corretor_id", corretor.id)
      .is("conectado_em", null);
  }

  revalidatePath("/corretor/whatsapp");
  return {
    configurado: true,
    qrcodeBase64: resultado.qrcodeBase64,
    codigoPareamento: resultado.codigoPareamento,
    jaConectado: resultado.jaConectado,
    desfecho: resultado.desfecho,
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
export async function verificarConexaoWhatsapp(): Promise<{
  conectado: boolean;
  estado: string;
  telefone?: string | null;
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

  const supabase = await createClient();
  await supabase
    .from("corretor_whatsapp_instancias")
    .update({
      status_conexao: "desconectado",
      conectado_em: null,
      telefone_conectado: null,
      qrcode_base64: null,
      updated_at: new Date().toISOString(),
    })
    .eq("corretor_id", corretor.id);

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
