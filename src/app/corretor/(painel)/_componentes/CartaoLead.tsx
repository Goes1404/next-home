import { ETIQUETA_ETAPA } from "@/app/corretor/(painel)/_componentes/etapas";
import { linkWhatsappPara } from "@/lib/site";
import { ETAPA_LABEL, type EtapaFunil, type Lead } from "@/lib/types";

/**
 * Utilidades de lead compartilhadas entre a tabela de `/corretor/leads`
 * (TabelaLeads), o quadro do funil e a página de equipe: etiqueta de etapa,
 * chip de portal, link de WhatsApp e formatadores de data. Um lugar só,
 * para nada disso existir em duas versões que divergem com o tempo.
 *
 * Pasta `_componentes` (com underscore) porque o App Router a ignora como
 * rota — do contrário `/corretor/_componentes` viraria uma página.
 */

export const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

/**
 * Link de WhatsApp para o telefone que o próprio lead informou. O número vem
 * digitado à mão num formulário, então pode chegar com ou sem código do país;
 * `wa.me` só aceita E.164.
 */
export function linkWhatsappLead(lead: Lead): string | null {
  if (!lead.telefone) return null;
  const digitos = lead.telefone.replace(/\D/g, "");
  if (digitos.length < 10) return null;
  const e164 = digitos.length <= 11 ? `55${digitos}` : digitos;
  const primeiroNome = lead.nome.split(" ")[0];

  let textoOrigem = "pelo site da Next Home";
  if (lead.portalOrigem === "zap_imoveis") textoOrigem = "pelo Zap Imóveis";
  else if (lead.portalOrigem === "vivareal") textoOrigem = "pelo VivaReal";
  else if (lead.portalOrigem === "olx") textoOrigem = "pela OLX";
  else if (lead.portalOrigem === "imovelweb") textoOrigem = "pelo Imovelweb";
  else if (lead.portalOrigem === "meta_ads" || lead.origem?.includes("meta")) textoOrigem = "pelo anúncio no Instagram/Facebook";

  const imovel = lead.empreendimento?.nome || lead.anuncioOrigem;
  const textoImovel = imovel ? ` sobre o ${imovel}` : "";

  return linkWhatsappPara(
    e164,
    `Olá, ${primeiroNome}! Aqui é da Next Home, recebi seu contato ${textoOrigem}${textoImovel}. Como posso te ajudar?`,
  );
}

/**
 * De onde o lead veio. Um ponto na cor do portal e o nome em texto neutro,
 * em vez de seis pílulas coloridas.
 *
 * A versão anterior pintava o rótulo com a cor da marca do portal — um
 * `#4da6ff` claro, pensado para fundo escuro. No tema claro isso vira texto
 * pastel sobre branco. O ponto mantém o reconhecimento imediato da origem e
 * o rótulo fica legível nos dois temas; de quebra, uma lista com dez leads
 * de portais diferentes para de parecer uma caixa de lápis de cor.
 */
const PORTAL: Record<string, { label: string; cor: string }> = {
  zap_imoveis: { label: "Zap Imóveis", cor: "#0f5bd7" },
  vivareal: { label: "VivaReal", cor: "#e84c3d" },
  olx: { label: "OLX", cor: "#6e0ad6" },
  imovelweb: { label: "Imovelweb", cor: "#e67e22" },
  meta_ads: { label: "Meta Ads", cor: "#0066ff" },
  site_direto: { label: "Site direto", cor: "#00806c" },
};

export function BadgePortal({ portal, origem }: { portal?: string | null; origem?: string | null }) {
  const chave = portal || (origem?.includes("meta") ? "meta_ads" : null);
  const dados = chave ? PORTAL[chave] : undefined;

  if (!dados) {
    if (origem?.startsWith("inbound/")) {
      return <Chip cor="#6d827c">E-mail</Chip>;
    }
    return null;
  }

  return <Chip cor={dados.cor}>{dados.label}</Chip>;
}

function Chip({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span className="border-linha bg-vidro text-corpo inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap">
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cor }} />
      {children}
    </span>
  );
}

export function EtiquetaEtapa({ etapa }: { etapa: EtapaFunil }) {
  return (
    <span className={`text-fluid-xs rounded-full px-2.5 py-1 font-medium ${ETIQUETA_ETAPA[etapa]}`}>
      {ETAPA_LABEL[etapa]}
    </span>
  );
}

/**
 * Há quantos dias este lead não se mexe. Devolve `null` para menos de um dia
 * — "parado há 0 dias" é ruído, e o número só vira informação a partir de
 * 24h. Vira o alerta de inatividade na Fase 2.
 */
export function diasParado(lead: Lead): number | null {
  const dias = Math.floor(
    (Date.now() - new Date(lead.etapaAlteradaEm).getTime()) / 86_400_000,
  );
  return dias >= 1 ? dias : null;
}

/** Data curta para o cartão compacto do quadro, onde não cabe hora. */
export function dataDoCartao(lead: Lead): string {
  return dataCurta.format(new Date(lead.criadoEm));
}
