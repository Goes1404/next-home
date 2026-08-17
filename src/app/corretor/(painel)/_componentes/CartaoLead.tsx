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

export function CartaoLead({ lead, mostrarDono = false }: { lead: Lead; mostrarDono?: boolean }) {
  const ehProprietario = lead.tipo === "proprietario";
  const whatsapp = linkWhatsappLead(lead);

  return (
    <article className="rounded-2xl border border-white/10 bg-ink-900/50 p-5">
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

      <div className="mt-5 flex flex-wrap gap-2">
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 min-w-[120px] rounded-xl bg-[#25D366] px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-[#1DA851]"
          >
            WhatsApp
          </a>
        )}
        {lead.telefone && (
          <a
            href={`tel:${lead.telefone}`}
            className="flex-1 min-w-[120px] rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-2.5 text-center text-sm font-medium text-brand-200 transition-colors hover:bg-brand-500/20"
          >
            Ligar
          </a>
        )}
        {lead.email && (
          <a
            href={`mailto:${lead.email}`}
            className="flex-1 min-w-[120px] rounded-xl bg-ink-800 px-4 py-2.5 text-center text-sm font-medium text-mist-200 transition-colors hover:bg-ink-700"
          >
            E-mail
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
