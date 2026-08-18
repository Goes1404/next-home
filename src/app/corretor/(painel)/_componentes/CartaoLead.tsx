import Link from "next/link";
import { CampoVisita } from "@/app/corretor/(painel)/_componentes/CampoVisita";
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
  return linkWhatsappPara(
    e164,
    `Olá, ${lead.nome.split(" ")[0]}! Aqui é da Next Home, recebi seu contato pelo site.`,
  );
}

/**
 * Cor por etapa, seguindo a temperatura do funil: verde no começo (chegou),
 * azul no meio (em andamento), areia perto do fechamento (dinheiro na mesa),
 * cinza no fim da linha. O corretor precisa ler a coluna de relance, não
 * decorar sete nomes.
 *
 * Só tokens que existem no `@theme` de `globals.css` — em Tailwind v4 uma
 * cor não declarada não gera classe nenhuma e o texto herda a cor do pai,
 * silenciosamente.
 */
const COR_ETAPA: Record<EtapaFunil, string> = {
  novo: "bg-brand-400/25 text-brand-100",
  primeiro_contato: "bg-brand-500/25 text-brand-200",
  visita_agendada: "bg-azure-400/25 text-azure-200",
  proposta_enviada: "bg-sand-400/20 text-sand-300",
  negociacao: "bg-sand-400/30 text-sand-300",
  fechado: "bg-brand-400/40 text-brand-50",
  perdido: "bg-white/10 text-mist-400",
};

export function EtiquetaEtapa({ etapa }: { etapa: EtapaFunil }) {
  return (
    <span
      className={`text-fluid-xs rounded-full px-2.5 py-1 font-medium ${COR_ETAPA[etapa]}`}
    >
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
    <article className="rounded-2xl border border-white/10 bg-ink-900/50 p-5">
      {selecionavel && (
        <label className="mb-3 flex items-center gap-2 text-fluid-xs text-mist-400">
          <input type="checkbox" checked={selecionado} onChange={aoAlternarSelecao} />
          Selecionar
        </label>
      )}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-lg text-mist-50">{lead.nome}</p>
          <p className="text-fluid-xs mt-0.5 text-mist-500">
            {dataHora.format(new Date(lead.criadoEm))}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <EtiquetaEtapa etapa={lead.etapa} />
          <span
            className={
              ehProprietario
                ? "text-fluid-xs rounded-full bg-sand-400/90 px-2.5 py-1 font-medium text-ink-950"
                : "text-fluid-xs rounded-full bg-brand-500/20 px-2.5 py-1 font-medium text-brand-200"
            }
          >
            {ehProprietario ? "Tem imóvel" : "Quer comprar"}
          </span>
        </div>
      </div>

      <dl className="text-fluid-sm mt-4 space-y-1 text-mist-300">
        {mostrarDono && (
          <div>
            <dt className="inline text-mist-500">Corretor </dt>
            <dd className="inline">{lead.corretor?.nome ?? "Sem dono"}</dd>
          </div>
        )}
        {lead.telefone && (
          <div>
            <dt className="inline text-mist-500">Telefone </dt>
            <dd className="inline">{lead.telefone}</dd>
          </div>
        )}
        {lead.email && (
          <div>
            <dt className="inline text-mist-500">E-mail </dt>
            <dd className="inline break-all">{lead.email}</dd>
          </div>
        )}
        {lead.empreendimento && (
          <div>
            <dt className="inline text-mist-500">Interesse </dt>
            <dd className="inline">
              <Link
                href={`/empreendimentos/${lead.empreendimento.slug}`}
                className="text-brand-200 underline-offset-4 hover:underline"
              >
                {lead.empreendimento.nome}
              </Link>
            </dd>
          </div>
        )}
        {lead.detalhes &&
          Object.entries(lead.detalhes).map(([chave, valor]) => (
            <div key={chave}>
              <dt className="inline text-mist-500">{ROTULO_DETALHE[chave] ?? chave} </dt>
              <dd className="inline">{valor}</dd>
            </div>
          ))}
      </dl>

      {lead.etapa === "visita_agendada" && (
        <CampoVisita leadId={lead.id} quando={lead.visitaAgendadaEm} />
      )}

      {lead.mensagem && (
        <p className="text-fluid-sm mt-3 rounded-xl border border-white/5 bg-ink-950/50 px-4 py-3 whitespace-pre-line text-mist-200">
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
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-brand-500/30 bg-brand-500/10 text-brand-200 transition-colors hover:bg-brand-500/20"
            title="Ligar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          </a>
        )}
        {lead.email && (
          <a
            href={`mailto:${lead.email}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-ink-800 text-mist-200 transition-colors hover:bg-ink-700 hover:border-white/20"
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
