import Link from "next/link";
import { CampoVisita } from "@/app/corretor/(painel)/_componentes/CampoVisita";
import { ETIQUETA_ETAPA } from "@/app/corretor/(painel)/_componentes/etapas";
import { linkWhatsappPara } from "@/lib/site";
import { ETAPA_LABEL, type EtapaFunil, type Lead } from "@/lib/types";

/**
 * Cartão de lead da lista `/corretor/leads`, mais o punhado de utilidades que
 * o quadro do funil também usa. Ficam juntos aqui para que a etiqueta de
 * etapa e o link de WhatsApp não existam em duas versões que divergem com o
 * tempo.
 *
 * Pasta `_componentes` (com underscore) porque o App Router a ignora como
 * rota — do contrário `/corretor/_componentes` viraria uma página.
 */

const ROTULO_DETALHE: Record<string, string> = {
  imovelTipo: "Tipo",
  imovelCidade: "Cidade",
  imovelBairro: "Bairro",
  intencao: "Intenção",
};

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
    <span className="border-linha bg-vidro text-corpo inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium">
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

export function CartaoLead({
  lead,
  mostrarDono = false,
  selecionavel = false,
  selecionado = false,
  aoAlternarSelecao,
}: {
  lead: Lead;
  mostrarDono?: boolean;
  selecionavel?: boolean;
  selecionado?: boolean;
  aoAlternarSelecao?: () => void;
}) {
  const ehProprietario = lead.tipo === "proprietario";
  const whatsapp = linkWhatsappLead(lead);

  return (
    <article className="rounded-2xl border border-linha bg-superficie p-5">
      {selecionavel && (
        // -my-2 devolve o espaço que o alvo de 44px acrescenta: a caixa
        // ganha área de toque sem empurrar o resto do cartão para baixo.
        <label className="text-fluid-xs text-apoio -my-2 mb-1 flex min-h-11 cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={selecionado}
            onChange={aoAlternarSelecao}
            className="accent-acento h-4.5 w-4.5 cursor-pointer"
          />
          {selecionado ? "Selecionado" : "Selecionar"}
        </label>
      )}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-display text-lg text-titulo">{lead.nome}</p>
            <BadgePortal portal={lead.portalOrigem} origem={lead.origem} />
          </div>
          <p className="text-fluid-xs mt-0.5 text-tenue">
            {dataHora.format(new Date(lead.criadoEm))}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <EtiquetaEtapa etapa={lead.etapa} />
          <span
            className={
              // `text-ink-950` literal: contrasta com o chip de areia, que é
              // claro nos dois temas.
              ehProprietario
                ? "text-fluid-xs rounded-full border border-etapa-areia-linha bg-etapa-areia-lavado px-2.5 py-1 font-medium text-etapa-areia"
                : "text-fluid-xs rounded-full bg-acento-lavado px-2.5 py-1 font-medium text-acento-suave"
            }
          >
            {ehProprietario ? "Tem imóvel" : "Quer comprar"}
          </span>
        </div>
      </div>

      <dl className="text-fluid-sm mt-4 space-y-1 text-corpo">
        {mostrarDono && (
          <div>
            <dt className="inline text-tenue">Corretor </dt>
            <dd className="inline">{lead.corretor?.nome ?? "Sem dono"}</dd>
          </div>
        )}
        {lead.telefone && (
          <div>
            <dt className="inline text-tenue">Telefone </dt>
            <dd className="inline">{lead.telefone}</dd>
          </div>
        )}
        {lead.email && (
          <div>
            <dt className="inline text-tenue">E-mail </dt>
            <dd className="inline break-all">{lead.email}</dd>
          </div>
        )}
        {lead.empreendimento && (
          <div>
            <dt className="inline text-tenue">Interesse </dt>
            <dd className="inline">
              <Link
                href={`/empreendimentos/${lead.empreendimento.slug}`}
                className="text-acento-suave underline-offset-4 hover:underline"
              >
                {lead.empreendimento.nome}
              </Link>
            </dd>
          </div>
        )}
        {lead.detalhes &&
          Object.entries(lead.detalhes).map(([chave, valor]) => (
            <div key={chave}>
              <dt className="inline text-tenue">{ROTULO_DETALHE[chave] ?? chave} </dt>
              <dd className="inline">{valor}</dd>
            </div>
          ))}
      </dl>

      {lead.etapa === "visita_agendada" && (
        <CampoVisita leadId={lead.id} quando={lead.visitaAgendadaEm} />
      )}

      {lead.mensagem && (
        <p className="text-fluid-sm mt-3 rounded-xl border border-linha bg-elevado px-4 py-3 whitespace-pre-line text-corpo">
          {lead.mensagem}
        </p>
      )}

      <div className="mt-5 flex items-center gap-2">
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#1DA851]"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
            WhatsApp
          </a>
        )}
        {lead.telefone && (
          <a
            href={`tel:${lead.telefone}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-acento-linha bg-acento-lavado text-acento-suave transition-colors hover:opacity-85"
            title="Ligar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          </a>
        )}
        {lead.email && (
          <a
            href={`mailto:${lead.email}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-linha bg-elevado text-corpo transition-colors hover:bg-vidro-forte hover:border-linha-forte"
            title="E-mail"
          >
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
          </a>
        )}
      </div>
    </article>
  );
}

/** Data curta para o cartão compacto do quadro, onde não cabe hora. */
export function dataDoCartao(lead: Lead): string {
  return dataCurta.format(new Date(lead.criadoEm));
}
