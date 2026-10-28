"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, MessageCircle, Plus, Shuffle, Users } from "lucide-react";
import { useNomeDaCasa } from "@/app/corretor/(painel)/_componentes/NomeDaCasa";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { alternarPausa } from "@/app/corretor/actions";
import { salvarRoleta, type ModoAviso } from "./roletaAcoes";
import { TEXTO_ABERTURA_PADRAO, TEXTO_PASSAGEM_PADRAO, preencherTexto } from "@/lib/whatsapp/roletaTextos";
import { primeiroNome } from "@/lib/format";
import { Interruptor } from "./Interruptor";
import { RegraDoNumeroConectado } from "./RegraDoNumeroConectado";

export type ConfigDaRoleta = {
  corretorId: string;
  ligada: boolean;
  destinos: string[];
  textoPassagem: string;
  textoAbertura: string;
  modoAviso: ModoAviso;
};

/**
 * `temGrupo`: tem grupo de leads mapeado, que é o que importa no aviso no grupo (o WhatsApp dele não entra).
 * `naEscala`: fora de pausa na distribuição geral; `null` sem cadastro publicável (a distribuição pula).
 */
export type Membro = { id: string; nome: string; conectado: boolean; temGrupo: boolean; naEscala: boolean | null };

const AVISO_ENVIO_DESLIGADO = "O envio de leads para os grupos está desligado; peça ao gestor para ligar.";

/** Subir, descer: quadrado com contorno, nunca ícone solto (26/10/2026). */
const BOTAO_QUADRADO =
  "botao-solido inline-flex h-10 w-10 shrink-0 items-center justify-center text-acento disabled:cursor-not-allowed disabled:opacity-40";

// A mesma grade no cabeçalho e nas linhas. Do tablet para cima vira tabela;
// no celular cada linha quebra em duas ou três.
const GRADE_GESTOR = "md:grid-cols-[7.5rem_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1.3fr)_8.5rem_8rem]";
const GRADE_CORRETOR = "md:grid-cols-[7.5rem_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1.3fr)_8.5rem]";

const SELO_OK = "inline-flex items-center gap-1.5 rounded-full bg-ok-lavado px-2.5 py-1 text-fluid-xs font-semibold text-ok";
const SELO_NEUTRO = "inline-flex items-center rounded-full border border-linha bg-vidro px-2.5 py-1 text-fluid-xs font-semibold text-apoio";
const SELO_ALERTA =
  "inline-flex items-center rounded-full border border-alerta-linha bg-alerta-lavado px-2.5 py-1 text-fluid-xs font-semibold text-alerta";

/**
 * Editor da roleta dos anúncios (0204). O corretor edita a do próprio
 * número; o ADM escolhe de quem é a roleta no seletor do topo.
 *
 * Desde 26/10/2026 uma tabela só mostra cada corretor: posição na roleta,
 * WhatsApp, grupo e, para o gestor, a escala geral (pausa). Ordem e quem
 * recebe só valem ao salvar; pausa e a regra do WhatsApp salvam na hora.
 */
export function EditorDaRoleta({
  configs,
  equipe,
  meuId,
  gestor,
  grupoTemEnvio,
  soConectados,
}: {
  configs: ConfigDaRoleta[];
  equipe: Membro[];
  meuId: string;
  gestor: boolean;
  grupoTemEnvio: boolean;
  /** A regra do grupo: só entrega lead a quem está com o WhatsApp conectado. */
  soConectados: boolean;
}) {
  // Sempre a roleta do próprio número (28/10/2026): o seletor de dono saiu.
  const donoId = (configs.find((c) => c.corretorId === meuId) ?? configs[0]).corretorId;
  const [rascunhos, setRascunhos] = useState<Record<string, ConfigDaRoleta>>(
    () => Object.fromEntries(configs.map((c) => [c.corretorId, c])),
  );
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, iniciar] = useTransition();
  const [escala, setEscala] = useState<Record<string, boolean | null>>(
    () => Object.fromEntries(equipe.map((m) => [m.id, m.naEscala])),
  );
  const [pausando, iniciarPausa] = useTransition();
  const { falhar } = useAvisos();
  const nomeDaCasa = useNomeDaCasa();

  const c = rascunhos[donoId];
  const salvo = configs.find((cfg) => cfg.corretorId === donoId);
  const nomeDe = useMemo(() => new Map(equipe.map((m) => [m.id, m])), [equipe]);
  // O que o servidor tem salvo (e o webhook usa) para este número. Com o envio
  // para grupos desligado, "grupo" só aparece se já estava salvo: aí o corretor
  // precisa poder voltar para "mensagem". Nunca se troca o valor sozinho.
  const salvoEmGrupo = salvo?.modoAviso === "grupo";
  const mostraEscolha = grupoTemEnvio || salvoEmGrupo;
  // Os campos de texto e as dicas seguem o modo escolhido agora no rascunho.
  const modo: ModoAviso = mostraEscolha ? c.modoAviso : "mensagem";
  const noGrupo = modo === "grupo";

  function mudar(parcial: Partial<ConfigDaRoleta>) {
    setAviso(null);
    setRascunhos((r) => ({ ...r, [donoId]: { ...r[donoId], ...parcial } }));
  }

  function alternar(id: string) {
    mudar({ destinos: c.destinos.includes(id) ? c.destinos.filter((d) => d !== id) : [...c.destinos, id] });
  }

  function mover(id: string, passo: -1 | 1) {
    const lista = [...c.destinos];
    const i = lista.indexOf(id);
    const j = i + passo;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    mudar({ destinos: lista });
  }

  function descartar() {
    if (!salvo) return;
    setAviso(null);
    setRascunhos((r) => ({ ...r, [donoId]: salvo }));
  }

  function salvar() {
    iniciar(async () => {
      try {
        const r = await salvarRoleta({ ...c, corretorId: donoId });
        setAviso(r.erro ? { tipo: "erro", texto: r.erro } : { tipo: "ok", texto: "Roleta salva." });
      } catch {
        setAviso({ tipo: "erro", texto: "Não foi possível salvar agora. Recarregue a página e tente de novo." });
      }
    });
  }

  function pausar(id: string, naEscala: boolean) {
    setEscala((e) => ({ ...e, [id]: !naEscala }));
    iniciarPausa(async () => {
      try {
        const r = await alternarPausa(id, naEscala);
        if (r.erro) {
          setEscala((e) => ({ ...e, [id]: naEscala }));
          falhar(r.erro);
        }
      } catch {
        setEscala((e) => ({ ...e, [id]: naEscala }));
        falhar("Não foi possível mudar a escala agora. Tente novamente.");
      }
    });
  }

  const primeiro = c.destinos[0] ? primeiroNome(nomeDe.get(c.destinos[0])?.nome ?? "") : "Bruna";
  const exemplo = { corretor: primeiro, cliente: "Ana", imovel: "Dom Parque", imobiliaria: nomeDaCasa };
  const foraDaLista = equipe.filter((m) => !c.destinos.includes(m.id));
  const grade = gestor ? GRADE_GESTOR : GRADE_CORRETOR;
  const mudou = salvo !== undefined && JSON.stringify(salvo) !== JSON.stringify(c);

  // Função de render, não componente: componente declarado aqui dentro
  // nasceria de novo a cada render e remontaria as linhas.
  function linha(m: Membro, posicao: number | null) {
    const naRoleta = posicao !== null;
    const pulado = naRoleta && (noGrupo ? !m.temGrupo : !m.conectado);
    const naEscala = escala[m.id];
    return (
      <li
        key={m.id}
        className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-3 py-2.5 md:grid md:gap-3 ${grade} ${
          naRoleta ? "border border-linha bg-vidro" : "border border-dashed border-linha"
        }`}
      >
        <span className="flex items-center gap-1.5">
          {naRoleta ? (
            <>
              <span className="w-5 text-center text-fluid-sm font-bold text-titulo tabular-nums">{posicao + 1}</span>
              <button type="button" onClick={() => mover(m.id, -1)} disabled={posicao === 0} aria-label={`Subir ${m.nome}`} className={BOTAO_QUADRADO}>
                <ArrowUp aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => mover(m.id, 1)}
                disabled={posicao === c.destinos.length - 1}
                aria-label={`Descer ${m.nome}`}
                className={BOTAO_QUADRADO}
              >
                <ArrowDown aria-hidden className="size-4" />
              </button>
            </>
          ) : (
            <span aria-hidden className="w-5 text-center text-fluid-sm text-apoio">
              —
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2.5 md:flex-none">
          <span
            aria-hidden
            className={`flex size-10 shrink-0 items-center justify-center rounded-full font-bold ${
              naEscala === false ? "bg-vidro-forte text-titulo" : "bg-acento text-sobre-cor"
            }`}
          >
            {m.nome.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <span className="min-w-0 break-words text-fluid-sm font-semibold text-titulo">
            {m.nome}
            {m.id === meuId ? " (eu)" : ""}
          </span>
        </span>
        <span>
          <span className={m.conectado ? SELO_OK : SELO_NEUTRO}>{m.conectado ? "Conectado" : "Desconectado"}</span>
        </span>
        <span className="flex flex-col items-start gap-1">
          <span className={m.temGrupo ? SELO_OK : SELO_ALERTA}>{m.temGrupo ? "Com grupo" : "Sem grupo"}</span>
          {pulado && (
            <span className="text-fluid-xs text-titulo">
              {noGrupo ? "É pulado na roleta até vincular o grupo" : "É pulado na roleta: WhatsApp fora do ar"}
            </span>
          )}
        </span>
        <span>
          <button
            type="button"
            role="switch"
            aria-checked={naRoleta}
            aria-label={`${m.nome} recebe os leads do anúncio`}
            onClick={() => alternar(m.id)}
            className={
              naRoleta
                ? "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-acento-linha bg-acento-lavado px-3.5 text-fluid-xs font-semibold text-acento"
                : "botao-solido inline-flex min-h-11 items-center gap-1.5 px-3.5 text-fluid-xs font-semibold text-acento"
            }
          >
            {naRoleta ? <Check aria-hidden className="size-4" /> : <Plus aria-hidden className="size-4" />}
            {naRoleta ? "Recebe" : "Incluir"}
          </button>
        </span>
        {gestor && (
          <span className="md:text-right">
            {naEscala === null ? (
              <span className="text-fluid-xs text-apoio">Sem cadastro público</span>
            ) : (
              <button
                type="button"
                role="switch"
                aria-checked={naEscala}
                aria-label={naEscala ? `Colocar ${m.nome} em pausa` : `Tirar ${m.nome} da pausa`}
                disabled={pausando}
                onClick={() => pausar(m.id, naEscala)}
                className={`inline-flex min-h-11 items-center rounded-xl border px-3.5 text-fluid-xs font-semibold shadow-sm disabled:opacity-60 ${
                  naEscala ? "border-linha-forte bg-superficie text-corpo" : "border-alerta-linha bg-alerta-lavado text-alerta"
                }`}
              >
                {naEscala ? "Na escala" : "Em pausa"}
              </button>
            )}
          </span>
        )}
      </li>
    );
  }

  return (
    <section id="roleta" className="cartao scroll-mt-28 space-y-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-acento-lavado text-acento">
            <Shuffle aria-hidden className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-fluid-lg font-semibold text-titulo">Roleta dos anúncios</h3>
            <p className="mt-1 max-w-2xl text-fluid-sm text-apoio">
              Cliente novo do anúncio de WhatsApp vai para o próximo da lista, um para cada. A IA não responde lead de
              anúncio.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-linha bg-vidro px-4 py-2.5">
          <span className="text-fluid-sm font-semibold text-titulo">
            {c.ligada ? "Ligada" : "Desligada"}
          </span>
          <Interruptor ligado={c.ligada} aoMudar={(v) => mudar({ ligada: v })} rotulo="Roleta ligada" />
        </div>
      </div>

      {!grupoTemEnvio && salvoEmGrupo && (
        <p role="note" className="rounded-xl border border-alerta-linha bg-alerta-lavado p-3 text-fluid-sm text-alerta">
          {AVISO_ENVIO_DESLIGADO}
        </p>
      )}

      {mostraEscolha && (
        <fieldset className="min-w-0 space-y-2.5">
          <legend className="text-fluid-sm font-semibold text-titulo">Como o corretor fica sabendo</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["mensagem", MessageCircle, "Mensagem do número do corretor", "O número dele manda a primeira mensagem ao cliente. Precisa do WhatsApp dele conectado."],
                ["grupo", Users, "Aviso no grupo para o corretor ligar", "O aviso chega no grupo dele e ele liga. Não precisa de WhatsApp conectado, só do grupo."],
              ] as const
            ).map(([valor, Icone, titulo, ajuda]) => {
              // Sem o envio para grupos só se pode sair do "grupo", não escolher.
              const indisponivel = valor === "grupo" && !grupoTemEnvio;
              return (
                <label
                  key={valor}
                  className={`flex items-start gap-3 rounded-2xl border border-linha-forte bg-vidro p-4 has-[:checked]:border-acento has-[:checked]:bg-superficie has-[:checked]:shadow-sm has-[:checked]:ring-1 has-[:checked]:ring-acento ${
                    indisponivel ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                  }`}
                >
                  <input
                    type="radio"
                    name={`modo-aviso-${donoId}`}
                    checked={c.modoAviso === valor}
                    disabled={indisponivel}
                    onChange={() => mudar({ modoAviso: valor })}
                    className="mt-0.5 size-5 shrink-0 accent-[var(--color-acento)]"
                  />
                  <span className="min-w-0 text-fluid-sm">
                    <span className="flex items-center gap-2 font-semibold text-titulo">
                      <Icone aria-hidden className="size-4 text-acento" />
                      {titulo}
                    </span>
                    <span className="mt-1 block break-words text-apoio">{ajuda}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div id="corretores" className="scroll-mt-28 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-fluid-sm font-semibold text-titulo">Corretores: quem recebe e em que ordem</h4>
          <p className="text-fluid-xs text-apoio">
            A ordem vale para a roleta dos anúncios.{gestor ? " A escala vale para todo lead da equipe." : ""}
          </p>
        </div>
        {gestor && <RegraDoNumeroConectado ligada={soConectados} />}
        <div
          aria-hidden
          className={`hidden px-3 text-fluid-xs font-semibold tracking-wider text-apoio uppercase md:grid md:gap-3 ${grade}`}
        >
          <span>Ordem</span>
          <span>Corretor</span>
          <span>WhatsApp</span>
          <span>Grupo</span>
          <span>Roleta dos anúncios</span>
          {gestor && <span className="text-right">Escala</span>}
        </div>
        {c.destinos.length === 0 && (
          <p className="rounded-2xl border border-dashed border-linha px-4 py-3 text-fluid-sm text-corpo">
            Ninguém na roleta ainda. Toque em <b className="text-titulo">Incluir</b> nos corretores abaixo.
          </p>
        )}
        <ol className="space-y-2">
          {c.destinos.map((id, i) => {
            const m = nomeDe.get(id);
            return m ? linha(m, i) : null;
          })}
        </ol>
        {foraDaLista.length > 0 && (
          <>
            <p className="px-3 pt-1 text-fluid-xs font-semibold text-apoio">
              Fora da roleta dos anúncios{gestor ? " (continuam recebendo os outros leads)" : ""}
            </p>
            <ul className="space-y-2">
              {foraDaLista.map((m) => (
                linha(m, null)
              ))}
            </ul>
          </>
        )}
        {gestor && (
          <p className="text-fluid-xs text-apoio">
            Para passar a carteira de um corretor para outro, use{" "}
            <Link href="/corretor/admin/leads" className="link-acao text-acento">
              Leads da equipe
            </Link>
            .
          </p>
        )}
      </div>

      {!noGrupo && (
        <details className="group rounded-2xl border border-linha bg-vidro px-4 py-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-fluid-sm font-semibold text-titulo">
            Mensagens que o cliente recebe
          </summary>
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <label className="block space-y-2 text-fluid-sm">
              <span className="text-apoio">Do seu número ao cliente</span>
              <textarea
                rows={2}
                value={c.textoPassagem}
                onChange={(e) => mudar({ textoPassagem: e.target.value })}
                className="block w-full rounded-xl border border-linha-forte bg-superficie p-3 text-titulo"
              />
              <Balao texto={preencherTexto(c.textoPassagem || TEXTO_PASSAGEM_PADRAO, exemplo)} />
            </label>
            <label className="block space-y-2 text-fluid-sm">
              <span className="text-apoio">Primeira mensagem do corretor que recebe</span>
              <textarea
                rows={3}
                value={c.textoAbertura}
                onChange={(e) => mudar({ textoAbertura: e.target.value })}
                className="block w-full rounded-xl border border-linha-forte bg-superficie p-3 text-titulo"
              />
              <Balao texto={preencherTexto(c.textoAbertura || TEXTO_ABERTURA_PADRAO, exemplo)} />
            </label>
          </div>
          <p className="mt-3 text-fluid-xs text-apoio">
            Use {"{corretor}"}, {"{cliente}"}, {"{imovel}"} e {"{imobiliaria}"}. O que não for conhecido some da frase.
          </p>
        </details>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linha pt-4">
        {aviso ? (
          <p role="status" className={aviso.tipo === "erro" ? "text-fluid-sm text-perigo" : "text-fluid-sm text-ok"}>
            {aviso.texto}
          </p>
        ) : (
          <p className="text-fluid-xs text-apoio">
            {mudou ? "Há mudanças na roleta ainda não salvas." : "Ordem e quem recebe só valem depois de salvar."}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={descartar}
            disabled={!mudou || salvando}
            className="botao-solido min-h-11 px-4 text-fluid-sm font-semibold text-acento disabled:cursor-not-allowed disabled:opacity-50"
          >
            Descartar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={salvando}
            className="inline-flex min-h-11 items-center rounded-xl bg-acento px-5 text-fluid-sm font-semibold text-sobre-cor disabled:opacity-60"
          >
            {salvando ? "Salvando…" : "Salvar roleta"}
          </button>
        </div>
      </div>
    </section>
  );
}

/** A prévia da mensagem como o cliente vê: um balão de conversa. */
function Balao({ texto }: { texto: string }) {
  return (
    <span className="block max-w-md rounded-2xl rounded-bl-md border border-linha bg-superficie px-3 py-2 break-words text-titulo shadow-sm">
      {texto}
    </span>
  );
}
