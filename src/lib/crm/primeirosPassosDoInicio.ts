/**
 * Os primeiros passos do cliente novo no Início (29/10/2026) — regras puras.
 *
 * Amplia os passos de cada corretor (`primeirosPassos.ts`, 26/09/2026, que a
 * prontidão da equipe continua usando) com o que é da CONTA, não só da
 * pessoa: avisos no celular, o primeiro imóvel do catálogo, a equipe
 * convidada e o primeiro lead. Tudo calculado de dado real
 * (`estadoDosPrimeirosPassos.ts`); cada passo leva à tela que o faz.
 *
 * Quem vê o quê:
 *   - todos: WhatsApp, perfil, avisos no celular, primeiro lead;
 *   - o primeiro imóvel: quem cuida do catálogo — o gestor, ou o corretor
 *     independente (o grupo de uma pessoa só). O catálogo é do GRUPO
 *     (`empreendimentos.grupo_id`): cada conta tem o seu desde a 0190;
 *   - convidar a equipe: só o gestor de imobiliária (independente não tem
 *     equipe; o corretor não convida).
 *
 * Contagem `null` = a leitura falhou: o passo SAI da lista em vez de
 * aparecer como pendente. "Conecte o WhatsApp" para quem já conectou, por
 * uma piscada do banco, é pior que um passo a menos naquele instante.
 */

import { passosDoCorretor } from "./primeirosPassos";
import { RAMO_PADRAO, lerRamo, temModulo, vocabularioDoRamo, type Ramo } from "@/lib/ramos/ramos";

export type EstadoDoInicio = {
  papel: "gestor" | "corretor";
  tipoDoGrupo: "imobiliaria" | "independente";
  whatsappConectado: boolean | null;
  temFoto: boolean;
  temApresentacao: boolean;
  /** Aparelhos com aviso ligado (`inscricoes_push` do corretor). */
  aparelhosComAviso: number | null;
  /** Imóveis do catálogo do grupo. */
  imoveisDoGrupo: number | null;
  /** Corretores ATIVOS e visíveis do grupo, contando quem vê. */
  corretoresAtivos: number | null;
  /** Leads de quem vê (corretor) ou do grupo (gestor). */
  leads: number | null;
  /**
   * O ramo da conta (30/10/2026, revisão). Sem catálogo de imóveis no ramo,
   * o passo do primeiro imóvel não existe; o texto usa o vocabulário dele.
   * Ausente = imobiliária (o texto de sempre).
   */
  ramo?: Ramo | null;
};

export type IdDoPasso = "whatsapp" | "perfil" | "avisos" | "imovel" | "equipe" | "lead";

export type PassoDoInicio = {
  id: IdDoPasso;
  titulo: string;
  porque: string;
  href: string;
  feito: boolean;
};

/** A âncora do cartão de avisos no perfil (`perfil/page.tsx`). */
export const ANCORA_DOS_AVISOS = "avisos-no-celular";

export function cuidaDoCatalogo(e: Pick<EstadoDoInicio, "papel" | "tipoDoGrupo" | "ramo">): boolean {
  if (!temModulo(e.ramo ?? RAMO_PADRAO, "catalogoDeImoveis")) return false;
  return e.papel === "gestor" || e.tipoDoGrupo === "independente";
}

export function convidaAEquipe(e: Pick<EstadoDoInicio, "papel" | "tipoDoGrupo">): boolean {
  return e.papel === "gestor" && e.tipoDoGrupo === "imobiliaria";
}

export function passosDoInicio(e: EstadoDoInicio): PassoDoInicio[] {
  const doCorretor = passosDoCorretor({
    whatsappConectado: e.whatsappConectado === true,
    temFoto: e.temFoto,
    temApresentacao: e.temApresentacao,
    leads: e.leads ?? 0,
  });
  const whatsapp = doCorretor.find((p) => p.id === "whatsapp")!;
  const imobiliaria = lerRamo(e.ramo) === RAMO_PADRAO;
  const equipe = vocabularioDoRamo(e.ramo).equipe.singular;
  const perfil = doCorretor.find((p) => p.id === "perfil")!;

  const passos: (PassoDoInicio | null)[] = [
    e.whatsappConectado === null ? null : { ...whatsapp, id: "whatsapp", feito: e.whatsappConectado },
    {
      ...perfil,
      id: "perfil",
      titulo: "Completar seu perfil",
      // "Sua página" é o link pessoal do site de imóveis: só existe com ele.
      porque: temModulo(e.ramo ?? RAMO_PADRAO, "siteDeImoveis")
        ? "Foto e uma apresentação curta: é o que o cliente vê na sua página e nos links que você manda."
        : "Foto e uma apresentação curta: é como a equipe e os clientes reconhecem você no atendimento.",
    },
    e.aparelhosComAviso === null
      ? null
      : {
          id: "avisos",
          titulo: "Ligar os avisos no celular",
          porque: "Lead novo e cliente esperando chegam na hora, mesmo com o painel fechado.",
          href: `/corretor/perfil#${ANCORA_DOS_AVISOS}`,
          feito: e.aparelhosComAviso > 0,
        },
    !cuidaDoCatalogo(e) || e.imoveisDoGrupo === null
      ? null
      : {
          id: "imovel",
          titulo: "Cadastrar o primeiro imóvel",
          porque: "A assistente só oferece o que está no catálogo, e o seu site mostra cada um.",
          href: "/corretor/imoveis/novo",
          feito: e.imoveisDoGrupo > 0,
        },
    !convidaAEquipe(e) || e.corretoresAtivos === null
      ? null
      : {
          id: "equipe",
          titulo: "Convidar a equipe",
          porque: imobiliaria
            ? "Cada corretor com o próprio acesso recebe e atende os leads que forem dele."
            : `Cada ${equipe} com o próprio acesso recebe e atende os leads que forem dele.`,
          href: "/corretor/admin/contas",
          feito: e.corretoresAtivos > 1,
        },
    e.leads === null
      ? null
      : {
          id: "lead",
          titulo: "Receber ou importar o primeiro lead",
          porque: "Planilha, contatos ou conversa exportada do WhatsApp. A assistente só responde quem está na carteira.",
          href: "/corretor/importar",
          feito: e.leads > 0,
        },
  ];
  return passos.filter((p): p is PassoDoInicio => p !== null);
}

/** Feitos, total e a fração (0 a 1) para a barra. */
export function progressoDoInicio(passos: readonly PassoDoInicio[]): { feitos: number; total: number; fracao: number } {
  const feitos = passos.filter((p) => p.feito).length;
  const total = passos.length;
  return { feitos, total, fracao: total === 0 ? 1 : feitos / total };
}

/** Some quando tudo o que dá para saber está feito (ou quando não há passo). */
export function inicioConcluido(passos: readonly PassoDoInicio[]): boolean {
  return passos.every((p) => p.feito);
}

/** A chave do "ocultar" no navegador: por pessoa, para dois logins no mesmo aparelho não se misturarem. */
export function chaveDoOcultar(corretorId: string): string {
  return `astro:primeiros-passos-ocultos:${corretorId}`;
}
