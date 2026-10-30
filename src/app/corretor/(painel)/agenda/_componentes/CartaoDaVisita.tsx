import Link from "next/link";
import { linkWhatsappPara } from "@/lib/site";
import type { ItemDaAgenda } from "@/lib/agenda/itens";
import { podePedirConfirmacao } from "@/lib/agenda/confirmacaoDaVisita";
import { PedirConfirmacao } from "./PedirConfirmacao";
import {
  etiquetasDoPreparo,
  objecaoEmAberto,
  resumoCurto,
  temPreparo,
  type DadosDoPreparo,
} from "@/lib/crm/preparoDaVisita";

export type VisitaDaAgenda = Extract<ItemDaAgenda, { tipo: "visita" }>;

/** A hora SEMPRE no fuso de São Paulo: o servidor roda em UTC. */
const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const DIA_CURTO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

const BOTAO =
  "min-w-32 flex-1 rounded-xl border border-linha-forte bg-superficie px-4 py-2.5 text-center text-sm font-medium text-titulo transition-colors hover:bg-elevado";

/**
 * O cartão da visita, extraído da antiga tela de Visitas (27/10/2026) como
 * estava: o endereço por extenso (no dia da visita a rua é a informação, não
 * o link), o PREPARO só quando há o que mostrar, e os atalhos de WhatsApp,
 * GPS, ligação e ficha. `comDia` acrescenta o dia, para a lista de próximas.
 */
export function CartaoDaVisita({
  visita,
  preparo,
  comDia = false,
  vistaDe,
  semFicha = false,
  semMoldura = false,
  agoraIso,
}: {
  visita: VisitaDaAgenda;
  preparo: DadosDoPreparo;
  comDia?: boolean;
  /** Quem olha (corretor da sessão): decide o "feita por" e para onde vai a ficha (0225). */
  vistaDe?: string;
  /** Na própria página da visita recebida, sem o atalho da ficha. */
  semFicha?: boolean;
  /** Dentro da gaveta ou da coluna de detalhe da Agenda, que já são a moldura. */
  semMoldura?: boolean;
  /** O "agora" da página: com ele, o cartão oferece "Pedir confirmação" (0246). */
  agoraIso?: string;
}) {
  const quando = new Date(visita.inicio);
  const hora = HORA.format(quando);
  const endereco = visita.imovel?.endereco ?? visita.imovel?.nome;
  const linkMaps = endereco
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`
    : null;
  const etiquetas = etiquetasDoPreparo(preparo);
  // Visita passada pelo gestor: o dono vê quem faz; quem recebeu abre a ficha DA VISITA (sem a conversa).
  const feitaPorOutro = vistaDe !== undefined && visita.corretorId !== undefined && visita.corretorId !== vistaDe;
  const leadDeOutro = vistaDe !== undefined && Boolean(visita.donoDoLeadId) && visita.donoDoLeadId !== vistaDe;
  const linkDaFicha = leadDeOutro ? `/corretor/agenda/visita/${visita.id}` : `/corretor/leads/${visita.leadId}`;
  /*
   * Confirmação pelo WhatsApp (0246): o pedido sai do número do DONO do lead,
   * então o botão só aparece para quem faz a visita E é o dono. A régua de
   * quando pode é a mesma do servidor (`podePedirConfirmacao`).
   */
  const ehMinhaEDoMeuLead = vistaDe !== undefined && visita.corretorId === vistaDe && visita.donoDoLeadId === vistaDe;
  const podePedir =
    agoraIso !== undefined &&
    ehMinhaEDoMeuLead &&
    podePedirConfirmacao(
      {
        inicio: visita.inicio,
        status: visita.status ?? "marcada",
        confirmadaPeloCliente: visita.confirmadaPeloCliente,
        confirmacaoPedidaEm: visita.confirmacaoPedidaEm ?? null,
        remarcacaoPedidaEm: visita.remarcacaoPedidaEm ?? null,
      },
      new Date(agoraIso),
    ).pode;

  return (
    <article className={semMoldura ? undefined : "cartao p-5"}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-lg text-titulo">
            {comDia ? `${DIA_CURTO.format(quando)} · ` : ""}
            {hora} — {visita.nome}
          </p>
          {visita.imovel?.nome && <p className="text-fluid-sm mt-0.5 text-apoio">{visita.imovel.nome}</p>}
          {feitaPorOutro && visita.corretorNome && (
            <p className="text-fluid-xs mt-0.5 font-medium text-alerta">Feita por {visita.corretorNome}</p>
          )}
          {leadDeOutro && !feitaPorOutro && (
            <p className="text-fluid-xs mt-0.5 font-medium text-acento">Visita recebida do gestor</p>
          )}
        </div>
        {visita.remarcacaoPedidaEm ? (
          <span className="text-fluid-xs rounded-full bg-alerta-lavado px-2.5 py-1 font-semibold text-alerta">
            Pediu para remarcar
          </span>
        ) : visita.confirmadaPeloCliente ? (
          <span className="text-fluid-xs rounded-full bg-ok-lavado px-2.5 py-1 font-semibold text-ok">
            Confirmada pelo cliente
          </span>
        ) : visita.confirmacaoPedidaEm ? (
          <span className="text-fluid-xs rounded-full bg-etapa-visita-lavado px-2.5 py-1 font-medium text-etapa-visita">
            Confirmação pedida
          </span>
        ) : (
          <span className="text-fluid-xs rounded-full bg-etapa-visita-lavado px-2.5 py-1 font-medium text-etapa-visita">
            Visita
          </span>
        )}
      </div>

      {visita.imovel?.endereco && <p className="text-fluid-sm mt-2 text-corpo">{visita.imovel.endereco}</p>}

      {temPreparo(preparo) && (
        <div className="mt-3 border-t border-linha pt-3">
          {etiquetas.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {etiquetas.map((etiqueta) => (
                <span key={etiqueta} className="text-fluid-xs rounded-full bg-elevado px-2.5 py-1 text-corpo">
                  {etiqueta}
                </span>
              ))}
            </div>
          )}
          {objecaoEmAberto(preparo) && (
            <p className="text-fluid-xs mt-2 text-apoio">
              <span className="font-medium text-alerta">Atenção:</span> {objecaoEmAberto(preparo)}
            </p>
          )}
          {resumoCurto(preparo.resumoExecutivo) && (
            <p className="text-fluid-xs mt-2 text-apoio">{resumoCurto(preparo.resumoExecutivo)}</p>
          )}
        </div>
      )}

      {podePedir && (
        <div className="mt-4">
          <PedirConfirmacao visitaId={visita.id} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {visita.telefone && (
          <a
            href={linkWhatsappPara(
              visita.telefone.replace(/\D/g, ""),
              `Oi, ${visita.nome.split(" ")[0]}! Passando para confirmar nossa visita às ${hora}.`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-32 flex-1 rounded-xl border border-acento-linha bg-acento-lavado px-4 py-2.5 text-center text-sm font-medium text-acento-suave transition-colors hover:opacity-85"
          >
            WhatsApp
          </a>
        )}
        {linkMaps && (
          <a href={linkMaps} target="_blank" rel="noopener noreferrer" className={BOTAO}>
            Ir (GPS)
          </a>
        )}
        {visita.telefone && (
          <a href={`tel:${visita.telefone}`} className={BOTAO}>
            Ligar
          </a>
        )}
        {!semFicha && (
          <Link href={linkDaFicha} className={BOTAO}>
            Abrir ficha
          </Link>
        )}
      </div>
    </article>
  );
}
