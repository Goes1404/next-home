// Vínculo do corretor com o grupo de WhatsApp dele (spec 6.4): quem serve a
// qual grupo e qual é o `@lid` dele lá dentro. Puro, para a sincronização de
// grupos ficar testável sem rede nem banco.

import { mesmoNumero, type ParticipanteDoGrupo } from "./participantesDoGrupo";

export type CorretorParaVincular = { id: string; nome: string; whatsapp: string | null };
export type GrupoEncontrado = { jid: string; nome: string };

export type PlanoDeVinculos = {
  /** Um corretor, um grupo só dele. */
  vinculos: Array<{ corretor: CorretorParaVincular; grupo: GrupoEncontrado }>;
  /** Corretores para os quais não existe grupo no padrão. */
  semGrupo: CorretorParaVincular[];
  /** Grupos que caíram em mais de um corretor: nenhum deles é vinculado. */
  repetidos: Array<{ grupo: GrupoEncontrado; corretores: CorretorParaVincular[] }>;
  /** Mais de um grupo do WhatsApp com o nome do corretor: nenhum é vinculado. */
  gruposComMesmoNome: Array<{ grupos: GrupoEncontrado[]; corretores: CorretorParaVincular[] }>;
};

/**
 * Casa cada corretor com o grupo do nome dele. Dois corretores no mesmo
 * grupo (nomes que se confundem) são recusados juntos: sem saber quem é
 * quem, o retorno de um poderia ser lido como do outro.
 */
export function planejarVinculos(
  corretores: CorretorParaVincular[],
  grupos: GrupoEncontrado[],
  chaveDoCorretor: (nome: string) => string,
  chaveDoGrupo: (nome: string) => string,
): PlanoDeVinculos {
  // Dois grupos com o mesmo nome: não há como saber qual é o do corretor.
  const gruposPorChave = new Map<string, GrupoEncontrado[]>();
  for (const grupo of grupos) {
    const chave = chaveDoGrupo(grupo.nome);
    gruposPorChave.set(chave, [...(gruposPorChave.get(chave) ?? []), grupo]);
  }

  const porJid = new Map<string, { grupo: GrupoEncontrado; corretores: CorretorParaVincular[] }>();
  const semGrupo: CorretorParaVincular[] = [];
  const nomesRepetidos = new Map<string, { grupos: GrupoEncontrado[]; corretores: CorretorParaVincular[] }>();

  for (const corretor of corretores) {
    const chave = chaveDoCorretor(corretor.nome);
    const candidatos = gruposPorChave.get(chave) ?? [];
    if (candidatos.length === 0) {
      semGrupo.push(corretor);
      continue;
    }
    if (candidatos.length > 1) {
      const atual = nomesRepetidos.get(chave);
      if (atual) atual.corretores.push(corretor);
      else nomesRepetidos.set(chave, { grupos: candidatos, corretores: [corretor] });
      continue;
    }
    const grupo = candidatos[0];
    const atual = porJid.get(grupo.jid);
    if (atual) atual.corretores.push(corretor);
    else porJid.set(grupo.jid, { grupo, corretores: [corretor] });
  }

  const vinculos: PlanoDeVinculos["vinculos"] = [];
  const repetidos: PlanoDeVinculos["repetidos"] = [];
  for (const { grupo, corretores: doGrupo } of porJid.values()) {
    if (doGrupo.length === 1) vinculos.push({ corretor: doGrupo[0], grupo });
    else repetidos.push({ grupo, corretores: doGrupo });
  }
  return { vinculos, semGrupo, repetidos, gruposComMesmoNome: [...nomesRepetidos.values()] };
}

export type LidDoCorretor =
  /** Achou o corretor na lista e ele tem `@lid`: este é o par número↔lid. */
  | { achou: "lid"; lid: string }
  /** Achou o corretor, mas a lista não traz `@lid` dele: não há o que guardar. */
  | { achou: "sem_lid" }
  /** Não está na lista, ou o número bate com mais de um id: não se adivinha. */
  | { achou: "nao" };

/**
 * O `@lid` do corretor na lista de participantes, achado pelo NÚMERO dele.
 * Só vale o par número↔lid que a própria lista traz; nunca "o primeiro que
 * falou". Número batendo com mais de um participante é ambíguo e não grava.
 */
export function lidDoCorretor(participantes: ParticipanteDoGrupo[], whatsappDoCorretor: string | null): LidDoCorretor {
  if (!whatsappDoCorretor) return { achou: "nao" };
  const dele = participantes.filter((p) => p.numero !== null && mesmoNumero(p.numero, whatsappDoCorretor));
  if (dele.length !== 1) return { achou: "nao" };
  const lid = dele[0].lid;
  return lid ? { achou: "lid", lid } : { achou: "sem_lid" };
}

/** Texto para o gestor depois de sincronizar, sem jargão. */
export function mensagemDaSincronizacao(resumo: {
  vinculados: number;
  semGrupo: number;
  repetidos: Array<{ grupoNome: string }>;
  gruposComMesmoNome?: Array<{ grupoNome: string }>;
}): string {
  const partes: string[] = [];
  if (resumo.vinculados) {
    partes.push(
      `${resumo.vinculados} grupo(s) vinculado(s)${resumo.semGrupo ? `; ${resumo.semGrupo} sem grupo no padrão.` : "."}`,
    );
  } else if (!resumo.repetidos.length && !resumo.gruposComMesmoNome?.length) {
    partes.push("Nenhum grupo no padrão NOME & ARETZ foi encontrado.");
  }
  for (const r of resumo.repetidos) {
    partes.push(`O grupo ${r.grupoNome} serve a mais de um corretor; renomeie para ter um grupo por corretor.`);
  }
  for (const r of resumo.gruposComMesmoNome ?? []) {
    partes.push(`Há mais de um grupo chamado ${r.grupoNome}; deixe um só por corretor para ele ser vinculado.`);
  }
  return partes.join(" ");
}
