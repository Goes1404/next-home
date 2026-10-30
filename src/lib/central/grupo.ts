import { mesmoNumero, numeroDoJid, type ParticipanteDoGrupo } from "@/lib/whatsapp/participantesDoGrupo";
import type { MensagemRecebida, RespostaDoCentral } from "./conversa";
import type { ArquivoDaResposta } from "./executar";
import { ferramenta, ONDA_ATUAL, textoDaAjuda } from "./ferramentas";
import type { Remetente } from "./identificar";
import { hashDoTelefone } from "./telefone";

/**
 * O número central em grupos da equipe (spec 4.1; fase 2b, Frente K).
 *
 * Puro: banco, Evolution e envio entram por `DependenciasDoGrupo`. Só com a
 * onda 2: antes dela, grupo segue ignorado como sempre foi.
 *
 * Ordem (do mais barato ao mais caro, e nada de I/O para mensagem comum de
 * grupo, que é quase tudo o que chega): onda → mensagem lida (`fromMe`,
 * transmissão e status já saem no leitor) → tem menção ou citação? →
 * reentrega → participantes (cache curto) → o central está no grupo e foi
 * ELE o mencionado/citado? → todo participante é da equipe da MESMA
 * imobiliária com o recurso ligado? → quem escreveu → responder → onde
 * mandar (`respostaSoNoPrivado`).
 *
 * Grupo com gente de fora (cliente, corretor inativo, gente de outra
 * imobiliária): silêncio total, e a tentativa fica registrada com o motivo
 * `grupo` (sem texto, telefone em hash), igual a quem não é atendido no
 * privado. O desenho fala em "ele sai do grupo"; sair é decisão do dono
 * (uma vez fora, ninguém o põe de volta sem o celular do chip), então por
 * ora ele só não fala.
 */

export const TEXTOS_DO_GRUPO = {
  noPrivado: "Te mandei no privado.",
  semPrivado: "Essa resposta só vai no privado, e não achei o seu WhatsApp no perfil do painel. Cadastre lá e me peça de novo.",
  privadoFalhou: "Não consegui te mandar no privado agora. Me chame lá ou tente de novo em alguns minutos.",
} as const;

/**
 * ONDE A RESPOSTA PODE APARECER — a regra é uma só, e mora aqui.
 *
 * No grupo vão só as respostas que não carregam dado de cliente nem de
 * pessoa: ajuda, "ainda não sei fazer isso", aviso de cota, "não ouvi o
 * áudio", informação de imóvel do catálogo e simulação de financiamento.
 * Todo o resto vai SÓ no privado de quem pediu, e o grupo recebe "Te mandei
 * no privado":
 * - proposta (o resumo cita o cliente; e o "sim" acontece no privado, onde
 *   mora o estado da pessoa);
 * - qualquer consulta ou ação ligada fora da lista abaixo: dado de lead,
 *   agenda, relatório (inclusive o da equipe: no painel o corretor não vê os
 *   números dos colegas), financeiro, documentos.
 *
 * Por que pela FERRAMENTA, e não pelo texto: o texto é da IA, e a IA não
 * decide o que é sigiloso. Ferramenta desconhecida ou nova cai no privado
 * (falha para o lado seguro); para abrir uma ao grupo é preciso pô-la na
 * lista. Ferramenta de onda que ainda não chegou responde "ainda não sei",
 * sem dado nenhum, e pode ir ao grupo.
 *
 * O cérebro, no grupo, não recebe o histórico do privado nem a proposta
 * pendente (`conversa.ts`): sem isso, uma resposta sem ferramenta poderia
 * repetir no grupo o telefone do cliente dito no privado minutos antes.
 */
export const FERRAMENTAS_QUE_PODEM_IR_AO_GRUPO: ReadonlySet<string> = new Set([
  "ajuda",
  "informacao_de_imovel",
  "simular_financiamento",
]);

export function respostaSoNoPrivado(e: { ferramentas: string[]; proposta: boolean; onda?: number }): boolean {
  if (e.proposta) return true;
  const onda = e.onda ?? ONDA_ATUAL;
  return e.ferramentas.some((nome) => {
    if (FERRAMENTAS_QUE_PODEM_IR_AO_GRUPO.has(nome)) return false;
    const f = ferramenta(nome);
    // Desconhecida: privado. De onda futura: só respondeu "ainda não sei".
    return !f || f.onda <= onda;
  });
}

// ---------------------------------------------------------------------------
// A mensagem do grupo
// ---------------------------------------------------------------------------

export type MensagemDeGrupo = {
  grupoJid: string;
  /** O conteúdo no formato da conversa (texto, áudio, foto, arquivo). */
  mensagem: MensagemRecebida;
  /** Quem escreveu: o número quando o WhatsApp entrega, e o `@lid`. */
  autor: { telefone: string | null; lid: string | null };
  /** `contextInfo.mentionedJid` de todos os lugares onde ele pode vir. */
  mencionados: string[];
  /** O autor da mensagem citada (resposta a uma mensagem), se houver. */
  citado: string | null;
};

/** O central, como aparece no grupo: o número do chip e o `@lid` dele ali. */
type CentralNoGrupo = { telefone: string; lid: string | null };

function ehOCentral(jid: string, central: CentralNoGrupo): boolean {
  const id = jid.trim().toLowerCase();
  if (central.lid && id === central.lid.toLowerCase()) return true;
  const numero = numeroDoJid(id);
  return numero !== null && mesmoNumero(numero, central.telefone);
}

/** O central foi mencionado (`@central`) ou alguém respondeu a uma mensagem dele? */
export function mencionaOCentral(m: Pick<MensagemDeGrupo, "mencionados" | "citado">, central: CentralNoGrupo): boolean {
  return m.mencionados.some((j) => ehOCentral(j, central)) || (m.citado !== null && ehOCentral(m.citado, central));
}

/**
 * Tira do texto o "@5511968671127" (ou "@<lid>") que marcou o central: ao
 * cérebro só interessa o pedido. As outras menções ficam.
 */
export function semAMencao(texto: string, central: CentralNoGrupo): string {
  const alvos = new Set([central.telefone.replace(/\D/g, ""), central.lid?.split("@")[0] ?? ""].filter(Boolean));
  return texto
    .replace(/@(\d{6,})/g, (inteiro, digitos: string) =>
      alvos.has(digitos) || [...alvos].some((a) => mesmoNumero(a, digitos)) ? "" : inteiro,
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// O grupo é só da equipe?
// ---------------------------------------------------------------------------

/** Um corretor ATIVO achado pelo número ou `@lid` de algum participante. */
export type LinhaDaEquipe = {
  id: string;
  nome: string;
  papel: string;
  grupoId: string;
  imobiliaria: string;
  whatsapp: string | null;
  whatsappLid: string | null;
  /** `grupos.central_whatsapp_ativo` da imobiliária dele. */
  ligado: boolean;
};

function mesmaPessoa(p: { numero: string | null; lid: string | null }, l: LinhaDaEquipe): boolean {
  if (p.lid && l.whatsappLid && p.lid.trim().toLowerCase() === l.whatsappLid.trim().toLowerCase()) return true;
  return Boolean(p.numero && l.whatsapp && mesmoNumero(p.numero, l.whatsapp));
}

export type ConferenciaDoGrupo =
  | { tipo: "equipe"; grupoId: string; linhas: LinhaDaEquipe[] }
  | { tipo: "fora" }
  | { tipo: "ambiguo" };

/**
 * Todo participante (o central já fora da lista) tem de ser corretor ativo
 * de uma MESMA imobiliária, com o recurso ligado. Uma pessoa sem cadastro,
 * inativa, ou de outra imobiliária derruba o grupo inteiro: no grupo, a
 * resposta é lida por todos.
 *
 * Quem está em duas imobiliárias conta para as duas; vale a imobiliária
 * comum a todos. Duas comuns (todos estão nas duas): não há como saber de
 * qual o grupo é, e o central não fala.
 */
export function conferirEquipe(outros: ParticipanteDoGrupo[], linhas: LinhaDaEquipe[]): ConferenciaDoGrupo {
  if (outros.length === 0) return { tipo: "fora" };
  const deCada = outros.map((p) => new Set(linhas.filter((l) => l.ligado && mesmaPessoa(p, l)).map((l) => l.grupoId)));
  const grupos = [...deCada[0]].filter((g) => deCada.every((dele) => dele.has(g)));
  if (grupos.length === 0) return { tipo: "fora" };
  if (grupos.length !== 1) return { tipo: "ambiguo" };
  return { tipo: "equipe", grupoId: grupos[0], linhas: linhas.filter((l) => l.grupoId === grupos[0] && l.ligado) };
}

/**
 * Quem escreveu, entre os corretores da imobiliária do grupo. Pelo próprio
 * id da mensagem (número ou `@lid`) ou pelo participante que tem esse id: o
 * WhatsApp pode mandar só o `@lid` na mensagem e o par número↔lid só na
 * lista de participantes.
 */
export function acharAutor(
  autor: MensagemDeGrupo["autor"],
  participantes: ParticipanteDoGrupo[],
  linhas: LinhaDaEquipe[],
): LinhaDaEquipe | null {
  const ids = [autor];
  for (const p of participantes) {
    const porLid = autor.lid && p.lid && p.lid.toLowerCase() === autor.lid.toLowerCase();
    const porNumero = autor.telefone && p.numero && mesmoNumero(p.numero, autor.telefone);
    if (porLid || porNumero) ids.push({ telefone: p.numero, lid: p.lid });
  }
  const achados = linhas.filter((l) => ids.some((i) => mesmaPessoa({ numero: i.telefone, lid: i.lid }, l)));
  return achados.length === 1 ? achados[0] : null;
}

// ---------------------------------------------------------------------------
// Participantes, com cache curto
// ---------------------------------------------------------------------------

/**
 * A lista de participantes custa uma chamada à Evolution, e uma conversa no
 * grupo pode mencionar o central várias vezes seguidas. Um minuto basta para
 * a conversa e ainda pega rápido quem entrou no grupo (um cliente adicionado
 * cala o central em até 60 s). Falha não é guardada.
 */
const VALIDADE_DOS_PARTICIPANTES_MS = 60_000;
const MAXIMO_DE_GRUPOS_GUARDADOS = 200;
const participantesGuardados = new Map<string, { lista: ParticipanteDoGrupo[]; ate: number }>();

export async function participantesComCache(
  grupoJid: string,
  ler: (grupoJid: string) => Promise<ParticipanteDoGrupo[] | null>,
  agora: number = Date.now(),
): Promise<ParticipanteDoGrupo[] | null> {
  const guardado = participantesGuardados.get(grupoJid);
  if (guardado && guardado.ate > agora) return guardado.lista;
  const lista = await ler(grupoJid);
  if (lista === null) return null;
  if (participantesGuardados.size >= MAXIMO_DE_GRUPOS_GUARDADOS) participantesGuardados.clear();
  participantesGuardados.set(grupoJid, { lista, ate: agora + VALIDADE_DOS_PARTICIPANTES_MS });
  return lista;
}

/** Para os testes. */
export function esquecerParticipantes(): void {
  participantesGuardados.clear();
}

// ---------------------------------------------------------------------------
// O fluxo
// ---------------------------------------------------------------------------

export type DependenciasDoGrupo = {
  /** O chip do central (`central_da_plataforma.telefone`). */
  telefoneDoCentral: string;
  jaTratada: (mensagemId: string) => Promise<boolean>;
  /** Participantes do grupo; `null` quando a leitura falhou. */
  participantes: (grupoJid: string) => Promise<ParticipanteDoGrupo[] | null>;
  /** Corretores ATIVOS com estes números ou lids; `null` quando a leitura falhou. */
  equipe: (e: { numeros: string[]; lids: string[] }) => Promise<LinhaDaEquipe[] | null>;
  registrarTentativa: (e: { telefoneHash: string; motivo: "desconhecido" | "grupo"; mensagemId: string }) => Promise<void>;
  /** A conversa do central, com quem escreveu já identificado. */
  responder: (m: MensagemRecebida, remetente: Remetente) => Promise<RespostaDoCentral>;
  enviarNoGrupo: (texto: string) => Promise<boolean>;
  enviarNoPrivado: (telefone: string, texto: string) => Promise<boolean>;
  /**
   * O arquivo da resposta (foto, arte), como mídia nativa. Segue a MESMA
   * regra dos textos (`respostaSoNoPrivado`): o arquivo não é mais público
   * que o texto que o acompanha. Opcionais: sem eles, a resposta é só texto.
   */
  enviarArquivoNoGrupo?: (arquivo: ArquivoDaResposta) => Promise<boolean>;
  enviarArquivoNoPrivado?: (telefone: string, arquivo: ArquivoDaResposta) => Promise<boolean>;
};

export type DecisaoDoGrupo =
  | { tipo: "ignorado"; motivo: string }
  | { tipo: "respondido"; noGrupo: number; noPrivado: number };

const ignorado = (motivo: string): DecisaoDoGrupo => ({ tipo: "ignorado", motivo });

export async function tratarMensagemDoGrupoNoCentral(
  m: MensagemDeGrupo | null,
  deps: DependenciasDoGrupo,
  onda: number = ONDA_ATUAL,
): Promise<DecisaoDoGrupo> {
  // Antes da onda 2, o grupo segue ignorado como sempre: nada é lido.
  if (onda < 2) return ignorado("onda");
  if (!m) return ignorado("sem_mensagem");
  // Mensagem de grupo sem menção nem citação: quase tudo o que chega. Sai
  // antes de qualquer leitura.
  if (m.mencionados.length === 0 && !m.citado) return ignorado("sem_mencao");
  if (await deps.jaTratada(m.mensagem.mensagemId)) return ignorado("repetida");

  const participantes = await participantesComCache(m.grupoJid, deps.participantes);
  if (!participantes) return ignorado("sem_participantes");

  // O central dentro do grupo, pelo número; o `@lid` dele ali sai do mesmo
  // participante (é com ele que a menção chega nos grupos que usam lid).
  const doCentral = participantes.find((p) => p.numero !== null && mesmoNumero(p.numero, deps.telefoneDoCentral));
  if (!doCentral) return ignorado("central_fora_do_grupo");
  const central: CentralNoGrupo = { telefone: deps.telefoneDoCentral, lid: doCentral.lid };
  if (!mencionaOCentral(m, central)) return ignorado("sem_mencao");
  if (
    (m.autor.telefone && mesmoNumero(m.autor.telefone, central.telefone)) ||
    (m.autor.lid && central.lid && m.autor.lid.toLowerCase() === central.lid.toLowerCase())
  ) {
    return ignorado("do_proprio_central");
  }

  const outros = participantes.filter((p) => p !== doCentral && !(p.lid && central.lid && p.lid === central.lid));
  const linhas = await deps.equipe({
    numeros: [...new Set([...outros.map((p) => p.numero), m.autor.telefone].filter((n): n is string => Boolean(n)))],
    lids: [...new Set([...outros.map((p) => p.lid), m.autor.lid].filter((l): l is string => Boolean(l)))],
  });
  if (!linhas) return ignorado("erro_de_leitura");

  const hash = hashDoTelefone(m.autor.telefone ?? m.autor.lid ?? "");
  const conferencia = conferirEquipe(outros, linhas);
  if (conferencia.tipo === "fora") {
    await deps.registrarTentativa({ telefoneHash: hash, motivo: "grupo", mensagemId: m.mensagem.mensagemId });
    return ignorado("grupo_com_gente_de_fora");
  }
  if (conferencia.tipo === "ambiguo") return ignorado("imobiliaria_ambigua");

  const autor = acharAutor(m.autor, participantes, conferencia.linhas);
  if (!autor) {
    await deps.registrarTentativa({ telefoneHash: hash, motivo: "desconhecido", mensagemId: m.mensagem.mensagemId });
    return ignorado("autor_desconhecido");
  }

  // A imobiliária é a do GRUPO, não uma escolha guardada no privado: quem
  // está em duas fala, ali, pela imobiliária daquele grupo.
  const remetente: Remetente = {
    tipo: "pessoa",
    corretorId: autor.id,
    grupoId: autor.grupoId,
    papel: autor.papel === "gestor" ? "gestor" : "corretor",
    nome: autor.nome,
    imobiliaria: autor.imobiliaria,
  };
  const texto = semAMencao(m.mensagem.texto, central);
  // Só "@central", sem pedido: o que ele sabe fazer, sem gastar IA.
  if (m.mensagem.tipo === "texto" && !texto) {
    await deps.enviarNoGrupo(textoDaAjuda(onda));
    return { tipo: "respondido", noGrupo: 1, noPrivado: 0 };
  }
  const resposta = await deps.responder(
    { ...m.mensagem, texto, telefone: autor.whatsapp ?? m.autor.telefone, lid: m.autor.lid },
    remetente,
  );
  if (resposta.textos.length === 0) return { tipo: "respondido", noGrupo: 0, noPrivado: 0 };

  // Arquivo vai depois do texto, que é o contexto dele. `depois` (a entrega
  // que passa do tempo do webhook) não nasce aqui: só sai de um "sim", e o
  // "sim" é no privado.
  const arquivos = resposta.arquivos ?? [];
  if (!resposta.soNoPrivado) {
    for (const t of resposta.textos) await deps.enviarNoGrupo(t);
    let noGrupo = resposta.textos.length;
    if (deps.enviarArquivoNoGrupo) for (const a of arquivos) if (await deps.enviarArquivoNoGrupo(a)) noGrupo += 1;
    return { tipo: "respondido", noGrupo, noPrivado: 0 };
  }

  // Primeiro o privado; o "te mandei" só depois de mandado, para não ser mentira.
  if (!autor.whatsapp) {
    await deps.enviarNoGrupo(TEXTOS_DO_GRUPO.semPrivado);
    return { tipo: "respondido", noGrupo: 1, noPrivado: 0 };
  }
  let enviados = 0;
  for (const t of resposta.textos) if (await deps.enviarNoPrivado(autor.whatsapp, t)) enviados += 1;
  if (deps.enviarArquivoNoPrivado) for (const a of arquivos) if (await deps.enviarArquivoNoPrivado(autor.whatsapp, a)) enviados += 1;
  await deps.enviarNoGrupo(enviados > 0 ? TEXTOS_DO_GRUPO.noPrivado : TEXTOS_DO_GRUPO.privadoFalhou);
  return { tipo: "respondido", noGrupo: 1, noPrivado: enviados };
}
