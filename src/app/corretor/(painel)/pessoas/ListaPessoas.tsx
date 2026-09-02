"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { REGUA_ETAPA } from "../_componentes/etapas";
import { ETAPA_LABEL } from "@/lib/types";
import { normalizarTelefoneBr } from "@/lib/whatsapp/telefone";
import { linkWhatsappPara } from "@/lib/site";
import { carregarMaisPessoas } from "./acoes";
// Do módulo PURO, não de `pessoas.ts`: aquele tem `server-only` e uma
// constante importada dele arrasta o servidor inteiro para o cliente.
import { PESSOAS_POR_PAGINA, type PessoaNaLista } from "@/lib/crm/pessoasTipos";

/**
 * A lista de pessoas. Uma linha por ser humano, na ordem de quem falou por
 * último — o formato do WhatsApp, de propósito (ver o comentário da página).
 *
 * A linha inteira é o alvo: tocar abre a conversa, ou a ficha quando ainda
 * não houve conversa. Isso corrige um defeito da lista antiga em que o nome
 * do lead NÃO era link no celular — era um acordeão, e abrir a ficha custava
 * sempre um segundo toque, num lugar diferente do que o desktop usava.
 */
export function ListaPessoas({
  iniciais,
  total,
  busca,
}: {
  iniciais: PessoaNaLista[];
  total: number;
  busca: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pessoas, setPessoas] = useState(iniciais);
  const [pagina, setPagina] = useState(0);
  const [carregando, iniciarCarga] = useTransition();
  const [termo, setTermo] = useState(busca);

  // Reset ao trocar a busca: o servidor manda uma primeira página nova, e
  // acumular por cima dela misturaria dois recortes.
  const [buscaAnterior, setBuscaAnterior] = useState(busca);
  if (busca !== buscaAnterior) {
    setBuscaAnterior(busca);
    setPessoas(iniciais);
    setPagina(0);
  }

  function buscar(valor: string) {
    setTermo(valor);
    const novo = new URLSearchParams(params.toString());
    if (valor) novo.set("busca", valor);
    else novo.delete("busca");
    router.replace(`/corretor/pessoas?${novo}`, { scroll: false });
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="so-para-leitor">Buscar pessoa por nome ou telefone</span>
        <input
          type="search"
          inputMode="search"
          value={termo}
          onChange={(e) => buscar(e.target.value)}
          placeholder="Buscar por nome ou telefone"
          className="border-linha bg-campo text-corpo placeholder:text-tenue focus:border-acento-linha text-fluid-sm h-12 w-full rounded-xl border px-4 outline-none transition-colors"
        />
      </label>

      {pessoas.length === 0 ? (
        <p className="text-fluid-sm text-apoio border-linha bg-superficie rounded-2xl border p-6 text-center">
          {busca
            ? `Ninguém com "${busca}".`
            : "Ninguém por aqui ainda. Quem chegar pelo seu link aparece nesta lista."}
        </p>
      ) : (
        <ul className="border-linha bg-superficie shadow-painel divide-linha divide-y overflow-hidden rounded-2xl border">
          {pessoas.map((p) => (
            <LinhaPessoa key={p.id} pessoa={p} />
          ))}
        </ul>
      )}

      {pessoas.length < total && (
        <button
          type="button"
          disabled={carregando}
          onClick={() =>
            iniciarCarga(async () => {
              const proxima = pagina + 1;
              const novas = await carregarMaisPessoas(busca, proxima);
              // Dedup por id: uma mensagem nova desloca o range entre uma
              // página e a seguinte, e sem isto a mesma pessoa apareceria
              // duas vezes — o mesmo cuidado da lista de leads.
              setPessoas((atuais) => {
                const vistos = new Set(atuais.map((x) => x.id));
                return [...atuais, ...novas.filter((n) => !vistos.has(n.id))];
              });
              setPagina(proxima);
            })
          }
          className="border-linha text-corpo hover:border-acento-linha hover:text-titulo text-fluid-sm min-h-12 w-full cursor-pointer rounded-xl border transition-colors disabled:opacity-60"
        >
          {carregando ? "Carregando…" : `Ver mais ${Math.min(PESSOAS_POR_PAGINA, total - pessoas.length)}`}
        </button>
      )}

      <p className="text-fluid-xs text-tenue text-center tabular-nums">
        {pessoas.length} de {total}
      </p>
    </div>
  );
}

function LinhaPessoa({ pessoa }: { pessoa: PessoaNaLista }) {
  const destino = pessoa.conversaId
    ? `/corretor/conversas?c=${pessoa.conversaId}`
    : `/corretor/leads/${pessoa.leadId}`;
  /*
   * `linkWhatsappLead` monta a mensagem de primeira abordagem a partir do
   * portal de origem, e precisa do `Lead` inteiro — aqui a linha tem só
   * telefone. Este botão é para CONTINUAR uma conversa, não para abrir uma,
   * então vai sem texto pronto; a normalização sai de `normalizarTelefoneBr`,
   * o mesmo ponto único que o provedor usa (foi copiar essa regra na mão que
   * mandou 39% dos leads sem DDI um dia).
   */
  const e164 = normalizarTelefoneBr(pessoa.telefone);
  const zap = e164 ? linkWhatsappPara(e164, "") : null;

  return (
    <li className="flex items-stretch">
      {/* A régua de etapa continua sendo o mesmo gesto de todo o painel: cor à
          esquerda, lida antes do texto. Sem etapa (conversa que ainda não
          virou cadastro) ela fica neutra em vez de sumir — buraco na coluna
          faria a lista parecer desalinhada. */}
      <span
        aria-hidden
        className={`w-1 shrink-0 ${pessoa.etapa ? REGUA_ETAPA[pessoa.etapa] : "bg-linha-forte"}`}
      />

      <Link href={destino} className="hover:bg-vidro min-w-0 flex-1 px-3 py-3 transition-colors">
        <span className="flex items-baseline gap-2">
          <span className="text-fluid-sm text-titulo min-w-0 flex-1 truncate font-medium">
            {pessoa.nome}
          </span>
          <span className="text-fluid-xs text-tenue shrink-0 tabular-nums">
            {quando(pessoa.ultimaAtividade)}
          </span>
        </span>

        <span className="mt-0.5 flex items-center gap-2">
          <span className="text-fluid-xs text-apoio min-w-0 flex-1 truncate">
            {pessoa.previa ?? (pessoa.etapa ? ETAPA_LABEL[pessoa.etapa] : "Sem conversa ainda")}
          </span>
          {/* Verde de estado, não a cor do módulo: o contador vive DENTRO de
              uma linha, e cor de módulo dentro de registro é justamente a
              mistura que a régua de cor deste painel existe para evitar. De
              quebra é a convenção do WhatsApp, que é o modelo emprestado. */}
          {pessoa.naoLidas > 0 && (
            <span className="bg-ok text-sobre-cor flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums">
              {pessoa.naoLidas}
              <span className="so-para-leitor"> mensagens não lidas</span>
            </span>
          )}
        </span>
      </Link>

      {zap && (
        <a
          href={zap}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Chamar ${pessoa.nome} no WhatsApp`}
          className="text-ok hover:bg-ok-lavado flex w-12 shrink-0 items-center justify-center transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm4.52 12.99c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.84-.2-.49-.4-.42-.55-.43h-.47c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.03s.87 2.35.99 2.51c.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z" />
          </svg>
        </a>
      )}
    </li>
  );
}

/**
 * "há 2h", "ontem", "12/08". Relógio relativo perto, data absoluta longe —
 * "há 23 dias" não diz nada que "12/08" não diga melhor.
 */
function quando(iso: string): string {
  const agora = Date.now();
  const then = new Date(iso).getTime();
  const min = Math.round((agora - then) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  if (h < 48) return "ontem";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
