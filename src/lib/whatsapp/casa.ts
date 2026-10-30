// A identidade da casa na conversa do WhatsApp (fase 4 enxuta, 20/10/2026).
//
// Até aqui a assistente de todo grupo falava como a Next Home: o nome da
// casa vinha de `site.nome`, a região de `site.regioes[0]`, e a pergunta do
// funil era "em qual região de Barueri". Agora isso vem do grupo do NÚMERO
// que atende (`grupos.ia_*`, 0199).
//
// O grupo 1 sem configuração reproduz o texto de antes letra por letra (o
// instantâneo de `casaNoPrompt.test.ts` foi gravado antes da mudança). Outro
// grupo sem configuração NUNCA herda a Next Home: cai no nome do próprio
// grupo e numa pergunta de região sem cidade.
//
// Precedência (decisão do construtor, spec §17): nome e tom que o gestor
// fixou para o grupo valem para a equipe toda e ganham do que cada corretor
// escolheu no número dele; campo vazio deixa valer o do corretor.
//
// Módulo puro, sem banco: o eval e os testes usam o mesmo caminho.

import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import type { LinksDoImovel } from "@/lib/imovelPublico/link";
import { site } from "@/lib/site";
import type { TomVozBot } from "./types";
import { lerRamo, limparDescricaoDoRamo, type Ramo } from "@/lib/ramos/ramos";

export const TONS_DA_ASSISTENTE: readonly TomVozBot[] = [
  "consultivo_alto_padrao",
  "formal_direto",
  "descontraido_acolhedor",
];

/** O mesmo rótulo da tela "Minha IA" do corretor. */
export const ROTULO_DO_TOM: Record<TomVozBot, string> = {
  consultivo_alto_padrao: "Consultivo e alto padrão",
  formal_direto: "Formal e direto",
  descontraido_acolhedor: "Descontraído e acolhedor",
};

/** Tetos de tamanho, iguais aos CHECK da 0199. */
export const TAMANHO_MAXIMO = { nomeDaCasa: 60, nomeAssistente: 30, regiao: 60 } as const;

export interface IdentidadeDaCasa {
  /** "consultora de imóveis ... da X". Nulo: a frase sai sem o nome. */
  nomeDaCasa: string | null;
  /** "... em R", na apresentação. */
  regiao: string | null;
  /** "em qual região de R você procura?". Nulo: "em qual cidade ou bairro". */
  regiaoDaPergunta: string | null;
  /** Os exemplos da regra 1 do funil ("outra cidade (Alphaville, ...)"). */
  exemplosDeOutraCidade: string | null;
  /**
   * Os exemplos que vieram das conversas reais da Next Home ("gostei do Dom
   * Barueri", "Centro de Barueri", "Parque Shopping") só entram no prompt do
   * grupo 1. Nos outros, o mesmo exemplo sai sem lugar nem imóvel da Next
   * Home (spec §7: o estilo da Bruna não vai para o prompt de outro grupo).
   */
  exemplosDaNextHome: boolean;
  /** Fixado pelo gestor para a equipe. Nulo: o da instância do corretor. */
  nomeAssistente: string | null;
  /** Fixado pelo gestor para a equipe. Nulo: o da instância do corretor. */
  tom: TomVozBot | null;
  /**
   * Os links de imóvel que o CÓDIGO monta para o cliente do grupo (21/10/2026,
   * `imovelPublico/link.ts`). Ausente = a Next Home de sempre (`site.url`):
   * o grupo 1 nunca preenche, e o prompt dele fica byte a byte o mesmo.
   */
  links?: LinksDoImovel;
  /**
   * O ramo do negócio do grupo (0244, 29/10/2026) — SÓ quando não é
   * imobiliária. Ausente = imobiliária, e o prompt é o de sempre, byte a
   * byte (`construirPromptSistema`); presente, o prompt é o do ramo
   * (`promptDoRamo.ts`).
   */
  ramo?: Exclude<Ramo, "imobiliaria">;
  /** O texto do ramo "outro" ("Clínica veterinária"). */
  ramoDescricao?: string | null;
}

/** As colunas de `grupos` que a casa lê. */
export interface LinhaDaCasa {
  nome: string | null;
  ia_nome_da_casa: string | null;
  ia_nome_assistente: string | null;
  ia_regiao: string | null;
  ia_tom: string | null;
  /** 0244: ausente (banco antes dela) = imobiliária. */
  ramo?: string | null;
  ramo_descricao?: string | null;
}

/**
 * A Next Home de antes da fase 4: o texto que o prompt do grupo 1 tinha. A
 * pergunta de região era "Barueri" e a apresentação "Alphaville" — dois
 * valores diferentes de propósito, e os dois ficam.
 */
export const CASA_NEXT_HOME: IdentidadeDaCasa = {
  nomeDaCasa: site.nome,
  regiao: site.regioes[0] ?? null,
  regiaoDaPergunta: "Barueri",
  exemplosDeOutraCidade: "Alphaville, Osasco, Tamboré",
  exemplosDaNextHome: true,
  nomeAssistente: null,
  tom: null,
};

/**
 * Texto que vai para o prompt: uma linha só (quebra de linha no nome viraria
 * uma instrução nova no meio do prompt), sem espaço sobrando, com teto.
 */
export function limparCampoDaCasa(valor: string | null | undefined, maximo: number): string | null {
  const limpo = (valor ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximo)
    .trim();
  return limpo ? limpo : null;
}

function tomValido(valor: string | null | undefined): TomVozBot | null {
  return TONS_DA_ASSISTENTE.includes(valor as TomVozBot) ? (valor as TomVozBot) : null;
}

/**
 * A casa de um grupo a partir da linha de `grupos`. `linha` nula (leitura que
 * falhou) também tem resposta: o padrão do grupo, que para outro grupo é sem
 * nome — nunca o da Next Home.
 */
export function casaDoGrupo(linha: LinhaDaCasa | null, grupoId: string): IdentidadeDaCasa {
  const padrao: IdentidadeDaCasa =
    grupoId === GRUPO_NEXT_HOME_ID
      ? CASA_NEXT_HOME
      : {
          nomeDaCasa: limparCampoDaCasa(linha?.nome, TAMANHO_MAXIMO.nomeDaCasa),
          regiao: null,
          regiaoDaPergunta: null,
          exemplosDeOutraCidade: null,
          exemplosDaNextHome: false,
          nomeAssistente: null,
          tom: null,
        };
  if (!linha) return padrao;

  const nomeDaCasa = limparCampoDaCasa(linha.ia_nome_da_casa, TAMANHO_MAXIMO.nomeDaCasa);
  const regiao = limparCampoDaCasa(linha.ia_regiao, TAMANHO_MAXIMO.regiao);
  // O ramo só entra na casa quando NÃO é imobiliária (e nunca na Next Home):
  // a casa da imobiliária fica com as mesmas chaves de antes da 0244.
  const ramo = grupoId === GRUPO_NEXT_HOME_ID ? "imobiliaria" : lerRamo(linha.ramo);
  const doRamo =
    ramo === "imobiliaria"
      ? {}
      : { ramo, ramoDescricao: ramo === "outro" ? limparDescricaoDoRamo(linha.ramo_descricao) : null };
  return {
    ...doRamo,
    nomeDaCasa: nomeDaCasa ?? padrao.nomeDaCasa,
    // A região configurada troca as três frases de uma vez: sobrar o
    // exemplo "Alphaville, Osasco" com outra região seria pior que nada.
    ...(regiao
      ? { regiao, regiaoDaPergunta: regiao, exemplosDeOutraCidade: null }
      : {
          regiao: padrao.regiao,
          regiaoDaPergunta: padrao.regiaoDaPergunta,
          exemplosDeOutraCidade: padrao.exemplosDeOutraCidade,
        }),
    exemplosDaNextHome: padrao.exemplosDaNextHome,
    nomeAssistente: limparCampoDaCasa(linha.ia_nome_assistente, TAMANHO_MAXIMO.nomeAssistente),
    tom: tomValido(linha.ia_tom),
  };
}

/**
 * O que a tela "Minha IA" do corretor sabe do nome e do tom fixados pelo
 * gestor, a partir da leitura de `grupos`.
 *
 * Só a coluna ausente (42703, banco antes da 0199) é tratada como "nada
 * fixado". Qualquer outro erro vira `naoConferido`: esconder o aviso faria o
 * corretor mudar o nome achando que vale, enquanto a IA usa o do gestor
 * (revisão da fase 4, 20/10/2026).
 */
export function fixadoPeloGrupoDaLeitura(leitura: {
  data: { ia_nome_assistente: string | null; ia_tom: string | null } | null;
  error: { code?: string; message: string } | null;
}): { nomeAssistente: string | null; tom: TomVozBot | null; naoConferido: boolean } {
  if (leitura.error) {
    return { nomeAssistente: null, tom: null, naoConferido: leitura.error.code !== "42703" };
  }
  return {
    nomeAssistente: limparCampoDaCasa(leitura.data?.ia_nome_assistente, TAMANHO_MAXIMO.nomeAssistente),
    tom: tomValido(leitura.data?.ia_tom),
    naoConferido: false,
  };
}

/** Nome e tom que valem nesta conversa (precedência grupo × instância). */
export function assistenteDaConversa(
  instancia: { nomeAssistente: string; tomVoz: string },
  casa: IdentidadeDaCasa,
): { nomeAssistente: string; tomVoz: string } {
  return {
    nomeAssistente: casa.nomeAssistente ?? instancia.nomeAssistente,
    tomVoz: casa.tom ?? instancia.tomVoz,
  };
}

/** " da Next Home em Alphaville" — o pedaço da apresentação. */
export function apresentacaoDaCasa(casa: IdentidadeDaCasa): string {
  return `${casa.nomeDaCasa ? ` da ${casa.nomeDaCasa}` : ""}${casa.regiao ? ` em ${casa.regiao}` : ""}`;
}

/** "em qual região de Barueri" — o começo da pergunta de região do funil. */
export function perguntaDeRegiao(casa: IdentidadeDaCasa): string {
  return casa.regiaoDaPergunta ? `em qual região de ${casa.regiaoDaPergunta}` : "em qual cidade ou bairro";
}

/**
 * Os exemplos das regras 13b (piso), 22 (alternativa) e do pitch.
 *
 * No grupo 1 são imóveis e lugares reais da Next Home (Terra Alta, Viva,
 * Vitra, Empresarial), medidos e mantidos letra por letra. Em outro grupo,
 * citar o Terra Alta ou o piso dele como exemplo convida o modelo a falar de
 * um imóvel que esse grupo não tem: o exemplo vira molde, sem nome nem número.
 */
export function exemplosDasRegras(casa: IdentidadeDaCasa): { piso: string; alternativa: string; pitch: string } {
  if (casa.exemplosDaNextHome) {
    return {
      piso: '"o Terra Alta começa em R$ 470.000"',
      alternativa: '"o Terra Alta é de 1 dormitório, não fecha com o que você precisa — o Viva tem 3, quer ver?"',
      pitch: '"para quem trabalha no Empresarial, o Vitra economiza uns 40 minutos de trânsito por dia"',
    };
  }
  return {
    piso: '"o [nome do imóvel] começa em [o valor de \'a partir de\' da ficha]"',
    alternativa:
      '"o [imóvel que ele recusou] é de 1 dormitório, não fecha com o que você precisa — o [outro imóvel da ficha] tem 3, quer ver?"',
    pitch: '"para quem trabalha no centro, o [nome do imóvel] fica a poucos minutos do trabalho"',
  };
}

/** O exemplo da regra 23 (imóvel de outra imobiliária). */
export function exemplosDeImovelAlheio(casa: IdentidadeDaCasa): string {
  return casa.exemplosDaNextHome ? '"gostei do Dom Barueri", "vi o Manacá"' : '"gostei do Residencial das Flores", "vi aquele do anúncio"';
}
