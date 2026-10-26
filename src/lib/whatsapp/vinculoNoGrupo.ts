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
};

/**
 * Casa cada corretor com o grupo do nome dele. Dois corretores no mesmo
 * grupo (nomes que se confundem) são recusados juntos: sem saber quem é
 * quem, o retorno de um poderia ser lido como do outro.
 */
export function planejarVinculos(
  corretores: CorretorParaVincular[],
  gruposPorNome: Map<string, GrupoEncontrado>,
  chaveDoNome: (nome: string) => string,
): PlanoDeVinculos {
  const porJid = new Map<string, { grupo: GrupoEncontrado; corretores: CorretorParaVincular[] }>();
  const semGrupo: CorretorParaVincular[] = [];

  for (const corretor of corretores) {
    const grupo = gruposPorNome.get(chaveDoNome(corretor.nome));
    if (!grupo) {
      semGrupo.push(corretor);
      continue;
    }
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
  return { vinculos, semGrupo, repetidos };
}

export type LidDoCorretor =
  /** Achou o corretor na lista e ele tem `@lid`: este é o par número↔lid. */
  | { achou: "lid"; lid: string }
  /** Achou o corretor, mas o id dele é o próprio número: não há `@lid` a guardar. */
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
  const id = dele[0].id;
  return id.endsWith("@lid") ? { achou: "lid", lid: id } : { achou: "sem_lid" };
}

/** Texto para o gestor depois de sincronizar, sem jargão. */
export function mensagemDaSincronizacao(resumo: {
  vinculados: number;
  semGrupo: number;
  repetidos: Array<{ grupoNome: string }>;
}): string {
  const partes: string[] = [];
  if (resumo.vinculados) {
    partes.push(
      `${resumo.vinculados} grupo(s) vinculado(s)${resumo.semGrupo ? `; ${resumo.semGrupo} sem grupo no padrão.` : "."}`,
    );
  } else if (!resumo.repetidos.length) {
    partes.push("Nenhum grupo no padrão NOME & ARETZ foi encontrado.");
  }
  for (const r of resumo.repetidos) {
    partes.push(`O grupo ${r.grupoNome} serve a mais de um corretor; renomeie para ter um grupo por corretor.`);
  }
  return partes.join(" ");
}
