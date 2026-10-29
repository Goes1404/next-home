"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, MessageCircle, Minus, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition, type CSSProperties } from "react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { mascararCnpj, mascararCpf, soDigitos } from "@/lib/plataforma/documentos";
import {
  DADOS_VAZIOS,
  errosDoPasso,
  errosDoTesteGratis,
  limitarUsuarios,
  mascararWhatsapp,
  PLANO_CONTRATAVEL,
  PLANOS_CONTRATAVEIS,
  planoParaORamo,
  reais,
  resumoDoPlano,
  totalMensal,
  UFS,
  USUARIOS_MAXIMO,
  USUARIOS_MINIMO,
  validarPedido,
  type CampoDoPedido,
  type DadosDoPedido,
  type ErrosDoPedido,
  type PlanoContratavel,
} from "@/lib/plataforma/pedidoDeContratacao";
import { IconeDoRamo } from "@/lib/ramos/IconeDoRamo";
import {
  CONFIG_DOS_RAMOS,
  ehRamo,
  nomeDoRamo,
  RAMO_DESCRICAO_MAXIMO,
  RAMOS,
  vocabularioDoRamo,
  type Ramo,
} from "@/lib/ramos/ramos";
import s from "../astro.module.css";
import { enviarPedidoDeContratacao, type RespostaDoPedido } from "./acoes";
import c from "./contratar.module.css";

/**
 * O assistente de contratação em três passos numa página só (29/10/2026):
 * Ramo e plano → Seus dados → Revisão, e a confirmação.
 *
 * - O ramo (29/10/2026, 0244) vem antes do plano, no mesmo passo: o CRM não
 *   é só de imobiliária, e é o ramo que dá o nome do plano de equipe
 *   ("Imobiliária" ou "Empresa"), o documento pedido (CRECI só na
 *   imobiliária) e, depois, o vocabulário e os módulos do painel.
 *
 * - Cada passo só avança com os campos dele válidos (`errosDoPasso`, as
 *   mesmas regras que a action aplica no servidor). O erro aparece no campo,
 *   e o foco vai para o primeiro campo com erro.
 * - Ao trocar de passo, o foco vai para o título do passo novo (quem usa
 *   leitor de tela ouve onde está) e o passo entra do lado para onde a pessoa
 *   andou; com "menos movimento", entra parado (CSS).
 * - Campo-isca (`site`) e o tempo com o assistente aberto vão junto no envio:
 *   a action descarta robô sem avisar.
 * - Na revisão, duas saídas (29/10/2026, 0241): "Começar teste grátis de 7
 *   dias" (a conta nasce na hora e o link de criar a senha vai por e-mail;
 *   pede o CRECI) e "Falar com a Astro" (só o pedido, como antes).
 */

type Passo = 1 | 2 | 3;

const PASSOS: { numero: Passo; nome: string }[] = [
  { numero: 1, nome: "Ramo e plano" },
  { numero: 2, nome: "Seus dados" },
  { numero: 3, nome: "Revisão" },
];

type Confirmado = Extract<RespostaDoPedido, { ok: true }>;
type Modo = "teste" | "pedido";

/** CPF enquanto cabe em 11 dígitos; daí em diante, CNPJ. */
function mascararDocumento(texto: string): string {
  return soDigitos(texto).length > 11 ? mascararCnpj(texto) : mascararCpf(texto);
}

/**
 * Foca o campo e o traz para o MEIO da tela: no celular a barra de ações
 * gruda no pé, e o foco simples deixaria o campo (e o erro embaixo dele)
 * escondido atrás dela.
 */
function focarNoMeio(el: HTMLElement | null) {
  if (!el) return;
  el.focus({ preventScroll: true });
  const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "center", behavior: suave ? "smooth" : "auto" });
}

/** Erro em qualquer destes campos leva de volta ao passo 1. */
const doPasso1 = (e: ErrosDoPedido) => Boolean(e.ramo || e.ramoDescricao || e.plano || e.usuarios);

export function AssistenteDeContratacao({
  planoInicial,
  ramoInicial = null,
}: {
  planoInicial: PlanoContratavel | null;
  /** `?ramo=` dos cartões "Para quem é" de `/astro` (0244). */
  ramoInicial?: Ramo | null;
}) {
  const [passo, setPasso] = useState<Passo>(1);
  const [direcao, setDirecao] = useState<"avanca" | "volta" | null>(null);
  const [dados, setDados] = useState<DadosDoPedido>({ ...DADOS_VAZIOS, plano: planoInicial ?? "", ramo: ramoInicial ?? "" });
  const [erros, setErros] = useState<ErrosDoPedido>({});
  const [consentimento, setConsentimento] = useState(false);
  const [erroDoConsentimento, setErroDoConsentimento] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<Confirmado | null>(null);
  const [enviando, iniciar] = useTransition();
  const [modoEnviando, setModoEnviando] = useState<Modo>("teste");
  const abertoEm = useRef<number | null>(null);
  const isca = useRef<HTMLInputElement>(null);
  const tituloDoPasso = useRef<HTMLHeadingElement>(null);
  const folha = useRef<HTMLElement>(null);

  useEffect(() => {
    abertoEm.current = Date.now();
  }, []);

  // Foco e rolagem a cada troca de passo (não na abertura da página).
  useEffect(() => {
    if (direcao === null) return;
    tituloDoPasso.current?.focus({ preventScroll: true });
    const topo = folha.current?.getBoundingClientRect().top ?? 0;
    if (topo < 0) {
      const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      folha.current?.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
    }
  }, [passo, direcao, confirmado]);

  const plano = dados.plano ? (dados.plano as PlanoContratavel) : null;
  const ramo: Ramo | null = ehRamo(dados.ramo) ? dados.ramo : null;
  const total = plano ? totalMensal(plano, dados.usuarios) : null;

  function mudar<K extends keyof DadosDoPedido>(campo: K, valor: DadosDoPedido[K]) {
    setDados((d) => ({ ...d, [campo]: valor }));
    if (erros[campo]) setErros((e) => ({ ...e, [campo]: undefined }));
  }

  function irPara(novo: Passo) {
    setErroGeral(null);
    setDirecao(novo > passo ? "avanca" : "volta");
    setPasso(novo);
  }

  function focarPrimeiroErro(e: ErrosDoPedido) {
    const primeiro = (Object.keys(e) as CampoDoPedido[])[0];
    if (!primeiro) return;
    // Depois da pintura: o campo com erro pode ter acabado de aparecer.
    requestAnimationFrame(() => focarNoMeio(document.getElementById(`pedido-${primeiro}`)));
  }

  function continuar() {
    if (passo === 3) return enviar("teste");
    const e = errosDoPasso(passo, dados);
    setErros(e);
    if (Object.keys(e).length > 0) return focarPrimeiroErro(e);
    irPara((passo + 1) as Passo);
  }

  function enviar(modo: Modo) {
    if (!consentimento) {
      setErroDoConsentimento(true);
      focarNoMeio(document.getElementById("pedido-consentimento"));
      return;
    }
    const local = validarPedido(dados);
    if (!local.ok) {
      setErros(local.erros);
      const voltarPara: Passo = doPasso1(local.erros) ? 1 : 2;
      irPara(voltarPara);
      return;
    }
    if (modo === "teste") {
      const doTeste = errosDoTesteGratis(local.pedido);
      if (Object.keys(doTeste).length > 0) {
        setErros(doTeste);
        irPara(2);
        focarPrimeiroErro(doTeste);
        return;
      }
    }
    setModoEnviando(modo);
    iniciar(async () => {
      setErroGeral(null);
      try {
        const r = await enviarPedidoDeContratacao({
          ...dados,
          consentimento,
          site: isca.current?.value ?? "",
          abertoHaMs: abertoEm.current === null ? 0 : Date.now() - abertoEm.current,
          modo,
        });
        if (r.ok) {
          setDirecao("avanca");
          setConfirmado(r);
          return;
        }
        setErroGeral(r.erro);
        requestAnimationFrame(() => document.getElementById("pedido-erro-geral")?.scrollIntoView({ block: "center" }));
        if (r.erros && Object.keys(r.erros).length > 0) {
          setErros(r.erros);
          irPara(doPasso1(r.erros) ? 1 : 2);
        }
      } catch (e) {
        requestAnimationFrame(() => document.getElementById("pedido-erro-geral")?.scrollIntoView({ block: "center" }));
        setErroGeral(
          ehActionDeOutroBuild(e)
            ? avisoDePaginaVelha()
            : "Não foi possível falar com o servidor. Confira a internet e tente de novo.",
        );
      }
    });
  }

  const classeDoPasso = direcao === "avanca" ? c.passoAvanca : direcao === "volta" ? c.passoVolta : "";

  if (confirmado) {
    return (
      <section ref={folha} className={`${c.folha} ${c.passoAvanca} scroll-mt-4 px-5 py-8 sm:px-9 sm:py-10`} aria-labelledby="titulo-confirmado">
        <Confirmacao confirmado={confirmado} titulo={tituloDoPasso} />
      </section>
    );
  }

  return (
    <section ref={folha} className={`${c.folha} scroll-mt-4 px-5 pt-6 pb-5 sm:px-9 sm:pt-8 sm:pb-9`} aria-label="Contratação">
      <ol
        className={c.etapas}
        aria-label={`Passo ${passo} de 3`}
        style={{ "--progresso": (passo - 1) / 2 } as CSSProperties}
      >
        {PASSOS.map((p) => {
          const feito = p.numero < passo;
          const atual = p.numero === passo;
          return (
            <li
              key={p.numero}
              aria-current={atual ? "step" : undefined}
              className={`${c.etapa} ${atual ? c.etapaAtual : ""} ${feito ? c.etapaFeita : ""}`}
            >
              <span aria-hidden className={c.bolinha} key={atual ? `atual-${passo}` : p.numero}>
                {feito ? <Check className="size-4" strokeWidth={3} /> : p.numero}
              </span>
              {p.nome}
              {feito && <span className="sr-only"> (feito)</span>}
            </li>
          );
        })}
      </ol>

      <form
        noValidate
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          continuar();
        }}
      >
        {/* Campo-isca: gente não vê nem alcança pelo teclado; robô preenche. */}
        <div className={c.isca} aria-hidden="true">
          <label htmlFor="pedido-site">Site da empresa</label>
          <input ref={isca} id="pedido-site" name="site" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </div>

        <div key={passo} className={classeDoPasso}>
          {passo === 1 && (
            <PassoPlano
              titulo={tituloDoPasso}
              ramo={ramo}
              ramoDescricao={dados.ramoDescricao ?? ""}
              plano={plano}
              usuarios={dados.usuarios}
              erros={erros}
              aoEscolherRamo={(r) => mudar("ramo", r)}
              aoMudarRamoDescricao={(t) => mudar("ramoDescricao", t)}
              aoEscolher={(p) => mudar("plano", p)}
              aoMudarUsuarios={(n) => mudar("usuarios", n)}
            />
          )}
          {passo === 2 && <PassoDados titulo={tituloDoPasso} dados={dados} erros={erros} mudar={mudar} />}
          {passo === 3 && plano && (
            <PassoRevisao
              titulo={tituloDoPasso}
              dados={dados}
              plano={plano}
              consentimento={consentimento}
              erroDoConsentimento={erroDoConsentimento}
              aoConsentir={(v) => {
                setConsentimento(v);
                if (v) setErroDoConsentimento(false);
              }}
              alterar={irPara}
              enviando={enviando}
              aoFalarComAAstro={() => enviar("pedido")}
            />
          )}
        </div>

        {erroGeral && (
          <p id="pedido-erro-geral" role="alert" className={`${c.avisoDeErro} mt-6`}>
            {erroGeral}
          </p>
        )}

        <div className={`${c.acoes} mt-8`}>
          {passo > 1 ? (
            <button type="button" className={c.voltar} onClick={() => irPara((passo - 1) as Passo)} disabled={enviando}>
              <ArrowLeft aria-hidden className="size-4" />
              Voltar
            </button>
          ) : (
            <p className="min-w-0 text-sm leading-tight text-[var(--tinta-suave)]" aria-live="polite">
              {total !== null ? (
                <>
                  Total por mês
                  <span className={`${s.titulo} ${c.total} block text-xl font-extrabold text-[var(--tinta)]`}>
                    {reais(total)}
                  </span>
                </>
              ) : (
                "Escolha o ramo e o plano"
              )}
            </p>
          )}
          <button
            type="submit"
            disabled={enviando}
            aria-busy={enviando}
            className={`${s.botao} ${s.botaoPrincipal} ml-auto min-w-[9.5rem] disabled:opacity-80`}
          >
            {enviando ? (
              <>
                <span aria-hidden className={c.giro} />
                {modoEnviando === "teste" ? "Criando sua conta…" : "Enviando…"}
              </>
            ) : passo === 3 ? (
              <>
                Começar teste grátis de 7 dias
                <Check aria-hidden className="size-4" strokeWidth={3} />
              </>
            ) : (
              <>
                Continuar
                <ArrowRight aria-hidden className="size-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
}

// ── Passo 1 ────────────────────────────────────────────────────────────────

function PassoPlano({
  titulo,
  ramo,
  ramoDescricao,
  plano,
  usuarios,
  erros,
  aoEscolherRamo,
  aoMudarRamoDescricao,
  aoEscolher,
  aoMudarUsuarios,
}: {
  titulo: React.RefObject<HTMLHeadingElement | null>;
  ramo: Ramo | null;
  ramoDescricao: string;
  plano: PlanoContratavel | null;
  usuarios: number;
  erros: ErrosDoPedido;
  aoEscolherRamo: (r: Ramo) => void;
  aoMudarRamoDescricao: (t: string) => void;
  aoEscolher: (p: PlanoContratavel) => void;
  aoMudarUsuarios: (n: number) => void;
}) {
  const erroId = useId();
  const erroDoRamoId = useId();
  const v = vocabularioDoRamo(ramo);
  // O que a pessoa digita no contador fica como texto até sair do campo:
  // apagar para digitar "12" não pode virar "1" no meio do caminho.
  const [digitado, setDigitado] = useState<string | null>(null);

  return (
    <div>
    <fieldset aria-describedby={erros.ramo ? erroDoRamoId : undefined}>
      <legend className="contents">
        <h2 ref={titulo} tabIndex={-1} className={`${s.titulo} text-2xl font-bold outline-none`}>
          Qual é o seu ramo?
        </h2>
      </legend>
      <p className="mt-1.5 text-[var(--tinta-suave)]">O CRM chega com o vocabulário e a IA do seu negócio.</p>
      {erros.ramo && (
        <p id={erroDoRamoId} className={c.erro} role="alert">
          {erros.ramo}
        </p>
      )}
      <div className={`${c.ramos} mt-4`}>
        {RAMOS.map((id) => (
          <label key={id} className={c.ramo}>
            <input
              id={id === RAMOS[0] ? "pedido-ramo" : undefined}
              type="radio"
              name="ramo"
              value={id}
              checked={ramo === id}
              onChange={() => aoEscolherRamo(id)}
              className="sr-only"
            />
            <IconeDoRamo ramo={id} className={c.iconeDoRamo} />
            <span className="min-w-0">{CONFIG_DOS_RAMOS[id].rotulo}</span>
          </label>
        ))}
      </div>
      {ramo === "outro" && (
        <div className={`${c.aparece} mt-3`}>
          <Campo
            campo="ramoDescricao"
            rotulo="Qual é o seu ramo?"
            valor={ramoDescricao}
            erro={erros.ramoDescricao}
            aoMudar={aoMudarRamoDescricao}
            dica={`Em poucas palavras, até ${RAMO_DESCRICAO_MAXIMO} caracteres. Ex.: clínica veterinária.`}
          />
        </div>
      )}
    </fieldset>

    <fieldset className="mt-8" aria-describedby={erros.plano ? erroId : undefined}>
      <legend className="contents">
        <h3 className={`${s.titulo} text-xl font-bold`}>Qual plano é o seu?</h3>
      </legend>
      <p className="mt-1.5 text-[var(--tinta-suave)]">Todos com a IA no WhatsApp, o funil, a agenda e as vendas.</p>

      {/* O erro vem ANTES das opções: embaixo, ficaria atrás da barra de ações no celular. */}
      {erros.plano && (
        <p id={erroId} className={c.erro} role="alert">
          {erros.plano}
        </p>
      )}
      <div className={`${c.opcoes} mt-5`}>
        {PLANOS_CONTRATAVEIS.map((id) => {
          // Sem ramo escolhido ainda, o nome neutro ("Empresa"): a página não é só de imobiliária.
          const p = planoParaORamo(id, ramo ?? "outro");
          return (
            <label key={id} className={c.opcao}>
              <input
                id={id === PLANOS_CONTRATAVEIS[0] ? "pedido-plano" : undefined}
                type="radio"
                name="plano"
                value={id}
                checked={plano === id}
                onChange={() => aoEscolher(id)}
                className="sr-only"
              />
              <span aria-hidden className={c.radio} />
              <span className="min-w-0">
                <span className={`${s.titulo} block text-lg leading-snug font-bold`}>
                  {p.nome}
                  {id === "imobiliaria" && <span className={c.selo}>Equipe</span>}
                </span>
                <span className="mt-0.5 block text-sm leading-snug text-[var(--tinta-suave)]">{p.resumo}</span>
              </span>
              <span className={c.precoDaOpcao}>
                <span className={`${s.titulo} block text-xl font-extrabold`}>{reais(p.preco)}</span>
                <span className="block text-xs text-[var(--tinta-suave)]">{p.porUsuario ? "por usuário/mês" : "por mês"}</span>
              </span>
            </label>
          );
        })}
      </div>

      {plano === "imobiliaria" && (
        <div className={`${c.usuarios} ${c.aparece} mt-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <label htmlFor="pedido-usuarios" className="font-semibold">
                Quantos usuários?
              </label>
              <p className="text-sm text-[var(--tinta-suave)]">Cada {v.equipe.singular} ou gestor com login conta como um.</p>
            </div>
            <div className={c.contador}>
              <button
                type="button"
                aria-label="Menos um usuário"
                disabled={usuarios <= USUARIOS_MINIMO}
                onClick={() => {
                  setDigitado(null);
                  aoMudarUsuarios(limitarUsuarios(usuarios - 1));
                }}
              >
                <Minus aria-hidden className="size-4" strokeWidth={2.5} />
              </button>
              <input
                id="pedido-usuarios"
                type="number"
                inputMode="numeric"
                min={USUARIOS_MINIMO}
                max={USUARIOS_MAXIMO}
                value={digitado ?? String(usuarios)}
                aria-invalid={erros.usuarios ? true : undefined}
                onChange={(e) => {
                  setDigitado(e.target.value);
                  const n = Number(e.target.value);
                  if (e.target.value !== "" && Number.isFinite(n)) aoMudarUsuarios(limitarUsuarios(n));
                }}
                onBlur={() => setDigitado(null)}
              />
              <button
                type="button"
                aria-label="Mais um usuário"
                disabled={usuarios >= USUARIOS_MAXIMO}
                onClick={() => {
                  setDigitado(null);
                  aoMudarUsuarios(limitarUsuarios(usuarios + 1));
                }}
              >
                <Plus aria-hidden className="size-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>
          <p className="mt-3 text-sm text-[var(--tinta-suave)]" aria-live="polite">
            {limitarUsuarios(usuarios)} × {reais(PLANO_CONTRATAVEL.imobiliaria.preco)} ={" "}
            <strong className="text-[var(--tinta)]">{reais(totalMensal("imobiliaria", usuarios))} por mês</strong>
          </p>
          {erros.usuarios && <p className={c.erro}>{erros.usuarios}</p>}
        </div>
      )}
    </fieldset>
    </div>
  );
}

// ── Passo 2 ────────────────────────────────────────────────────────────────

function Campo({
  campo,
  rotulo,
  valor,
  erro,
  aoMudar,
  tipo = "text",
  inputMode,
  autoComplete,
  opcional,
  dica,
}: {
  campo: CampoDoPedido;
  rotulo: string;
  valor: string;
  erro?: string;
  aoMudar: (v: string) => void;
  tipo?: "text" | "email" | "tel";
  inputMode?: "text" | "email" | "tel";
  autoComplete?: string;
  opcional?: boolean;
  dica?: string;
}) {
  const id = `pedido-${campo}`;
  const erroId = `${id}-erro`;
  const dicaId = `${id}-dica`;
  return (
    <div>
      <div className={c.campo}>
        <input
          id={id}
          name={campo}
          type={tipo}
          inputMode={inputMode}
          autoComplete={autoComplete}
          placeholder=" "
          value={valor}
          required={!opcional}
          aria-invalid={erro ? true : undefined}
          aria-describedby={[erro ? erroId : null, dica ? dicaId : null].filter(Boolean).join(" ") || undefined}
          onChange={(e) => aoMudar(e.target.value)}
          className={c.entrada}
        />
        <label htmlFor={id} className={c.rotulo}>
          {rotulo}
          {opcional && <span className={c.opcional}> (opcional)</span>}
        </label>
      </div>
      {erro ? (
        <p id={erroId} className={c.erro}>
          {erro}
        </p>
      ) : (
        dica && (
          <p id={dicaId} className={c.dica}>
            {dica}
          </p>
        )
      )}
    </div>
  );
}

function PassoDados({
  titulo,
  dados,
  erros,
  mudar,
}: {
  titulo: React.RefObject<HTMLHeadingElement | null>;
  dados: DadosDoPedido;
  erros: ErrosDoPedido;
  mudar: <K extends keyof DadosDoPedido>(campo: K, valor: DadosDoPedido[K]) => void;
}) {
  const imobiliaria = dados.plano === "imobiliaria";
  // O vocabulário do ramo (0244): "imobiliária"/"CRECI" só para quem é imobiliária.
  const ramo = ehRamo(dados.ramo) ? dados.ramo : null;
  const v = vocabularioDoRamo(ramo);
  const ehImobiliaria = !ramo || ramo === "imobiliaria";
  const nomeDaEmpresa = ehImobiliaria ? "imobiliária" : "empresa";
  return (
    <div>
      <h2 ref={titulo} tabIndex={-1} className={`${s.titulo} text-2xl font-bold outline-none`}>
        Seus dados
      </h2>
      <p className="mt-1.5 text-[var(--tinta-suave)]">É por eles que a {imobiliaria ? nomeDaEmpresa : "sua conta"} vai nascer e que a gente chama você.</p>

      <div className="mt-5 grid gap-3.5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Campo campo="nome" rotulo="Nome completo" valor={dados.nome} erro={erros.nome} aoMudar={(v) => mudar("nome", v)} autoComplete="name" />
        </div>
        <Campo
          campo="whatsapp"
          rotulo="WhatsApp com DDD"
          tipo="tel"
          inputMode="tel"
          autoComplete="tel-national"
          valor={dados.whatsapp}
          erro={erros.whatsapp}
          aoMudar={(v) => mudar("whatsapp", mascararWhatsapp(v))}
        />
        <Campo
          campo="email"
          rotulo="E-mail"
          tipo="email"
          inputMode="email"
          autoComplete="email"
          valor={dados.email}
          erro={erros.email}
          aoMudar={(v) => mudar("email", v)}
        />
        {imobiliaria && (
          <div className={`sm:col-span-2 ${c.aparece}`}>
            <Campo
              campo="imobiliaria"
              rotulo={`Nome da ${nomeDaEmpresa}`}
              autoComplete="organization"
              valor={dados.imobiliaria}
              erro={erros.imobiliaria}
              aoMudar={(v) => mudar("imobiliaria", v)}
            />
          </div>
        )}
        <div className="sm:col-span-2">
          <Campo
            campo="creci"
            rotulo={ehImobiliaria ? (imobiliaria ? "CRECI da imobiliária" : "CRECI") : v.documento.rotulo}
            opcional
            valor={dados.creci}
            erro={erros.creci}
            aoMudar={(t) => mudar("creci", t)}
            dica={
              v.documento.obrigatorio
                ? "Obrigatório para o teste grátis. Para só falar com a Astro, pode deixar em branco."
                : "Se o seu ramo tiver registro profissional. Pode deixar em branco."
            }
          />
        </div>
        <div className="sm:col-span-2">
          <Campo
            campo="documento"
            rotulo={imobiliaria ? `CNPJ da ${nomeDaEmpresa}` : "CPF"}
            opcional
            inputMode="text"
            valor={dados.documento ?? ""}
            erro={erros.documento}
            aoMudar={(v) => mudar("documento", mascararDocumento(v))}
            dica="Vai na fatura da assinatura. Se preferir, a gente pede depois."
          />
        </div>
        <Campo
          campo="cidade"
          rotulo="Cidade"
          autoComplete="address-level2"
          valor={dados.cidade}
          erro={erros.cidade}
          aoMudar={(v) => mudar("cidade", v)}
        />
        <div>
          <div className={c.campo}>
            <select
              id="pedido-uf"
              name="uf"
              value={dados.uf}
              autoComplete="address-level1"
              aria-invalid={erros.uf ? true : undefined}
              aria-describedby={erros.uf ? "pedido-uf-erro" : undefined}
              onChange={(e) => mudar("uf", e.target.value)}
              className={c.entrada}
            >
              <option value="">Escolha</option>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
            <label htmlFor="pedido-uf" className={c.rotulo}>
              Estado
            </label>
          </div>
          {erros.uf && (
            <p id="pedido-uf-erro" className={c.erro}>
              {erros.uf}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Passo 3 ────────────────────────────────────────────────────────────────

function PassoRevisao({
  titulo,
  dados,
  plano,
  consentimento,
  erroDoConsentimento,
  aoConsentir,
  alterar,
  enviando,
  aoFalarComAAstro,
}: {
  titulo: React.RefObject<HTMLHeadingElement | null>;
  dados: DadosDoPedido;
  plano: PlanoContratavel;
  consentimento: boolean;
  erroDoConsentimento: boolean;
  aoConsentir: (v: boolean) => void;
  alterar: (p: Passo) => void;
  enviando: boolean;
  aoFalarComAAstro: () => void;
}) {
  const local = [dados.cidade.trim(), dados.uf].filter(Boolean).join("/");
  const ramo = ehRamo(dados.ramo) ? dados.ramo : null;
  const documento = vocabularioDoRamo(ramo).documento.rotulo;
  return (
    <div>
      <h2 ref={titulo} tabIndex={-1} className={`${s.titulo} text-2xl font-bold outline-none`}>
        Confira e comece
      </h2>
      <p className="mt-1.5 text-[var(--tinta-suave)]">
        Teste grátis por 7 dias, sem cartão: a conta nasce agora e o link para criar a senha chega no seu e-mail. Para
        continuar depois do teste, é só assinar; sem assinatura, os recursos pagos pausam sozinhos.
      </p>

      <dl className={`${c.resumo} mt-5`}>
        <div className={c.linhaDoResumo}>
          <div className="min-w-0">
            <dt className="text-sm text-[var(--tinta-suave)]">Ramo e plano</dt>
            {ramo && <dd className="break-words">{nomeDoRamo(ramo, dados.ramoDescricao)}</dd>}
            <dd className="font-semibold">{resumoDoPlano(plano, dados.usuarios, ramo)}</dd>
          </div>
          <button type="button" className={c.alterar} onClick={() => alterar(1)}>
            Alterar<span className="sr-only"> o ramo e o plano</span>
          </button>
        </div>
        <div className={c.linhaDoResumo}>
          <div className="min-w-0 space-y-0.5">
            <dt className="text-sm text-[var(--tinta-suave)]">Seus dados</dt>
            <dd className="font-semibold break-words">{dados.nome.trim()}</dd>
            {plano === "imobiliaria" && <dd className="break-words">{dados.imobiliaria.trim()}</dd>}
            <dd>{dados.whatsapp}</dd>
            <dd className="break-all">{dados.email.trim()}</dd>
            <dd>
              {local}
              {dados.creci.trim() ? ` · ${documento} ${dados.creci.trim()}` : ""}
            </dd>
            {dados.documento?.trim() && <dd>{plano === "imobiliaria" ? "CNPJ" : "CPF"} {dados.documento.trim()}</dd>}
          </div>
          <button type="button" className={c.alterar} onClick={() => alterar(2)}>
            Alterar<span className="sr-only"> os dados</span>
          </button>
        </div>
        <div className={`${c.linhaDoResumo} bg-[var(--papel)]`}>
          <dt className="font-semibold">Total por mês</dt>
          <dd className={`${s.titulo} text-xl font-extrabold`}>{reais(totalMensal(plano, dados.usuarios))}</dd>
        </div>
      </dl>

      <label className={`${c.consentimento} mt-5`}>
        <input
          id="pedido-consentimento"
          type="checkbox"
          checked={consentimento}
          aria-invalid={erroDoConsentimento ? true : undefined}
          aria-describedby={erroDoConsentimento ? "pedido-consentimento-erro" : undefined}
          onChange={(e) => aoConsentir(e.target.checked)}
        />
        <span className="text-sm leading-relaxed">
          Autorizo a Astro Soluções a usar estes dados para falar comigo sobre a contratação, como descrito na{" "}
          <Link href="/astro/privacidade" target="_blank">
            Política de Privacidade
          </Link>
          , e concordo com os{" "}
          <Link href="/astro/termos" target="_blank">
            Termos de uso
          </Link>
          .
        </span>
      </label>
      {erroDoConsentimento && (
        <p id="pedido-consentimento-erro" className={c.erro} role="alert">
          Marque a caixa para continuar.
        </p>
      )}

      <p className="mt-5 text-sm text-[var(--tinta-suave)]">
        Prefere conversar antes?{" "}
        <button
          type="button"
          className={c.alterar}
          disabled={enviando}
          onClick={aoFalarComAAstro}
        >
          Falar com a Astro
        </button>{" "}
        e a gente chama você no WhatsApp.
      </p>
    </div>
  );
}

// ── Confirmação ────────────────────────────────────────────────────────────

function Confirmacao({ confirmado, titulo }: { confirmado: Confirmado; titulo: React.RefObject<HTMLHeadingElement | null> }) {
  if (confirmado.teste) return <ConfirmacaoDoTeste confirmado={confirmado} teste={confirmado.teste} titulo={titulo} />;
  const proximos = [
    "A Astro chama você no WhatsApp em até 1 dia útil para confirmar os detalhes.",
    "A gente configura a conta, conecta o seu WhatsApp e deixa a IA pronta para atender.",
    "Na primeira semana, a Astro acompanha o uso com você de perto.",
  ];
  return (
    <div className="flex flex-col items-start">
      <span className={c.selado} aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5 10 17.5 19 7" />
        </svg>
      </span>
      <h2 id="titulo-confirmado" ref={titulo} tabIndex={-1} className={`${s.titulo} mt-5 text-[1.9rem] leading-tight font-extrabold outline-none`}>
        Recebemos seu pedido{confirmado.primeiroNome ? `, ${confirmado.primeiroNome}` : ""}!
      </h2>
      <p className="mt-2 text-[var(--tinta-suave)]">
        Plano <strong className="text-[var(--tinta)]">{confirmado.resumo}</strong>.
      </p>

      <h3 className={`${s.titulo} mt-7 text-lg font-bold`}>O que acontece agora</h3>
      <ol className={`${c.proximos} mt-3`}>
        {proximos.map((t, i) => (
          <li key={i} style={{ "--ordem": i } as CSSProperties}>
            <span className="pt-0.5 leading-relaxed">{t}</span>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap [&>*]:whitespace-nowrap">
        {confirmado.whatsappDaAstro && (
          <a href={confirmado.whatsappDaAstro} target="_blank" rel="noopener" className={`${s.botao} ${s.botaoPrincipal}`}>
            <MessageCircle aria-hidden className="size-4" />
            Falar agora no WhatsApp
          </a>
        )}
        <Link href="/astro" className={`${s.botao} ${s.botaoNoClaro}`}>
          Voltar à página da Astro
        </Link>
      </div>
    </div>
  );
}

/** "2026-11-05" → "05/11". */
const diaEMes = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

function ConfirmacaoDoTeste({
  confirmado,
  teste,
  titulo,
}: {
  confirmado: Confirmado;
  teste: NonNullable<Confirmado["teste"]>;
  titulo: React.RefObject<HTMLHeadingElement | null>;
}) {
  const proximos = teste.emailEnviado
    ? [
        `Abra o e-mail que enviamos para ${teste.email} (confira o spam) e toque no link.`,
        "Crie a sua senha: o link confirma o seu e-mail e abre o painel.",
        "Conecte o seu WhatsApp no painel e deixe a IA atendendo.",
      ]
    : [
        "Sua conta foi criada, mas o e-mail com o link de acesso não saiu agora.",
        "A Astro chama você no WhatsApp para liberar o acesso.",
        "Depois, é só criar a senha e conectar o seu WhatsApp.",
      ];
  return (
    <div className="flex flex-col items-start">
      <span className={c.selado} aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5 10 17.5 19 7" />
        </svg>
      </span>
      <h2 id="titulo-confirmado" ref={titulo} tabIndex={-1} className={`${s.titulo} mt-5 text-[1.9rem] leading-tight font-extrabold outline-none`}>
        Seu teste grátis começou{confirmado.primeiroNome ? `, ${confirmado.primeiroNome}` : ""}!
      </h2>
      <p className="mt-2 text-[var(--tinta-suave)]">
        Plano <strong className="text-[var(--tinta)]">{confirmado.resumo}</strong>, grátis até{" "}
        <strong className="text-[var(--tinta)]">{diaEMes(teste.fimDoTeste)}</strong>.
      </p>

      <h3 className={`${s.titulo} mt-7 text-lg font-bold`}>Agora</h3>
      <ol className={`${c.proximos} mt-3`}>
        {proximos.map((t, i) => (
          <li key={i} style={{ "--ordem": i } as CSSProperties}>
            <span className="pt-0.5 leading-relaxed">{t}</span>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap [&>*]:whitespace-nowrap">
        {confirmado.whatsappDaAstro && (
          <a href={confirmado.whatsappDaAstro} target="_blank" rel="noopener" className={`${s.botao} ${teste.emailEnviado ? s.botaoNoClaro : s.botaoPrincipal}`}>
            <MessageCircle aria-hidden className="size-4" />
            Falar com a Astro
          </a>
        )}
        <Link href="/astro" className={`${s.botao} ${s.botaoNoClaro}`}>
          Voltar à página da Astro
        </Link>
      </div>
    </div>
  );
}
