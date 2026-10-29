"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, Sparkles } from "lucide-react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import type { AcessoDoGrupo } from "@/lib/plataforma/grupos";
import { gerarSenhaProvisoria } from "@/lib/plataforma/senhaProvisoria";
import { redefinirSenhaDoAcesso, type ResultadoSenhaRedefinida } from "../../acoes";
import { alterarPapelDoAcesso, alternarAtivoDoAcesso, type ResultadoDaEquipe } from "../../equipeAcoes";

const CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento w-full rounded-xl border px-3.5 py-2.5 pr-14 font-mono focus:outline-none";
const BOTAO_SECUNDARIO =
  "botao-secundario text-titulo text-fluid-sm flex min-h-11 items-center gap-2 px-4 font-medium";

/**
 * Os logins do grupo. Cada um abre com o que a plataforma faz por ele
 * (29/10/2026): desativar ou reativar, trocar o papel (gestor ↔ corretor) e
 * redefinir a senha (senha temporária + troca obrigatória).
 */
export function AcessosDoGrupo({ acessos }: { acessos: AcessoDoGrupo[] }) {
  return (
    <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-acessos">
      <div>
        <h2 id="titulo-acessos" className="text-fluid-sm text-titulo flex items-center gap-2 font-bold">
          <KeyRound className="h-4 w-4" /> Acessos
        </h2>
        <p className="text-fluid-xs text-apoio mt-1">
          Toque num acesso para desativar ou reativar, trocar o papel ou redefinir a senha. A imobiliária nunca fica sem
          administrador ativo: promova outro antes de tirar o último.
        </p>
      </div>
      <ListaDeAcessos acessos={acessos} vazio="Nenhum login neste grupo ainda." />
    </section>
  );
}

/** A lista em si, também usada na busca entre grupos (`/plataforma/acessos`). */
export function ListaDeAcessos({
  acessos,
  vazio,
  mostrarGrupo = false,
}: {
  acessos: AcessoDoGrupo[];
  vazio: string;
  mostrarGrupo?: boolean;
}) {
  if (acessos.length === 0) return <p className="text-fluid-xs text-apoio">{vazio}</p>;
  return (
    <ul className="divide-linha flex flex-col divide-y">
      {acessos.map((a) => (
        <LinhaDoAcesso key={a.corretorId} acesso={a} mostrarGrupo={mostrarGrupo} />
      ))}
    </ul>
  );
}

function LinhaDoAcesso({ acesso, mostrarGrupo }: { acesso: AcessoDoGrupo; mostrarGrupo: boolean }) {
  const action = redefinirSenhaDoAcesso.bind(null, acesso.grupoId, acesso.corretorId);
  const [estado, enviar, pendente] = useActionState<ResultadoSenhaRedefinida | undefined, FormData>(action, undefined);
  const [senha, setSenha] = useState("");
  const [visivel, setVisivel] = useState(false);
  const [copiada, setCopiada] = useState(false);
  const campo = `senha-${acesso.corretorId}`;

  function gerar() {
    setSenha(gerarSenhaProvisoria());
    setVisivel(true);
    setCopiada(false);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(senha);
      setCopiada(true);
    } catch {
      // Sem permissão de área de transferência: a senha fica visível para copiar à mão.
      setVisivel(true);
    }
  }

  return (
    <li className="py-3">
      <details>
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="min-w-0">
            <span className="text-fluid-sm text-titulo block break-words">
              {acesso.nome}
              {!acesso.ativo && <span className="text-tenue"> · desativado</span>}
            </span>
            <span className="text-fluid-xs text-apoio block wrap-anywhere">
              {acesso.email ?? "sem e-mail na ficha"} · {acesso.papel === "gestor" ? "administrador" : "corretor"}
              {mostrarGrupo && acesso.grupoNome && <> · {acesso.grupoNome}</>}
              {acesso.deveTrocarSenha && " · troca de senha pendente"}
            </span>
          </span>
          <span className="text-fluid-xs text-acento font-semibold">Gerenciar</span>
        </summary>

        <GestaoDoAcesso acesso={acesso} />

        <form action={enviar} className="border-linha mt-3 flex flex-col gap-3 border-t pt-3">
          <p className="text-fluid-xs text-titulo font-medium">Redefinir senha</p>
          <div>
            <label htmlFor={campo} className="text-fluid-xs text-corpo mb-1 block">Senha temporária</label>
            <span className="relative block">
              <input
                id={campo}
                name="senha"
                type={visivel ? "text" : "password"}
                required
                minLength={8}
                aria-describedby={`${campo}-regra`}
                autoComplete="off"
                spellCheck={false}
                value={senha}
                onChange={(e) => {
                  setSenha(e.target.value);
                  setCopiada(false);
                }}
                className={CAMPO}
              />
              <button
                type="button"
                onClick={() => setVisivel((v) => !v)}
                aria-pressed={visivel}
                aria-controls={campo}
                aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
                className="text-apoio hover:text-titulo absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl"
              >
                {visivel ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
              </button>
            </span>
            <span id={`${campo}-regra`} className="text-fluid-xs text-apoio mt-1 block">
              8 ou mais caracteres, com maiúscula, minúscula, número e símbolo.
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={gerar} className={BOTAO_SECUNDARIO}>
              <Sparkles aria-hidden className="h-4 w-4" /> Gerar senha forte
            </button>
            <button type="button" onClick={copiar} disabled={!senha} className={`${BOTAO_SECUNDARIO} disabled:opacity-50`}>
              {copiada ? <Check aria-hidden className="text-ok h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
              {copiada ? "Copiada" : "Copiar"}
            </button>
            <button
              type="submit"
              disabled={pendente}
              className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm flex min-h-11 items-center rounded-xl px-4 font-semibold disabled:opacity-60"
            >
              {pendente ? "Redefinindo…" : "Redefinir senha"}
            </button>
          </div>
        </form>

        {estado && !estado.ok && <p role="alert" className="text-fluid-xs text-perigo mt-2">{estado.erro}</p>}
        {estado?.ok && (
          <div role="status" className="text-fluid-xs text-titulo mt-2 flex flex-col gap-1">
            <p className="flex items-center gap-2">
              <Check className="text-ok h-4 w-4 shrink-0" /> Senha de {estado.nome} redefinida. No próximo login a troca será obrigatória.
            </p>
            <p className={estado.sessoesEncerradas ? "text-apoio" : "text-alerta"}>
              {estado.sessoesEncerradas
                ? "Sessões abertas encerradas: quem estava logado sai em até 1 hora."
                : "Não consegui encerrar as sessões abertas; quem já estava logado continua até sair."}
            </p>
          </div>
        )}
      </details>
    </li>
  );
}

/**
 * Desativar/reativar e trocar o papel, cada um com confirmação. O que a
 * confirmação diz é o que muda: desativado, o login perde o painel e sai da
 * roleta, e os leads dele ficam onde estão até o gestor do grupo repassá-los.
 */
function GestaoDoAcesso({ acesso }: { acesso: AcessoDoGrupo }) {
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const ehGestor = acesso.papel === "gestor";

  const agir = (pergunta: string, acao: () => Promise<ResultadoDaEquipe>) => {
    if (!window.confirm(pergunta)) return;
    iniciar(async () => {
      setAviso(null);
      try {
        const r = await acao();
        if (!r.ok) return setAviso({ texto: r.erro, erro: true });
        const carteira =
          r.leadsNaCarteira && r.leadsNaCarteira > 0
            ? ` ${r.leadsNaCarteira} ${r.leadsNaCarteira === 1 ? "lead continua" : "leads continuam"} na carteira: o gestor do grupo repassa em Contas.`
            : "";
        setAviso({ texto: r.mensagem + carteira, erro: false });
      } catch (e) {
        setAviso({
          texto: ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Não foi possível falar com o servidor. Tente de novo.",
          erro: true,
        });
      }
    });
  };

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {acesso.ativo ? (
          <button
            type="button"
            disabled={pendente}
            onClick={() =>
              agir(
                `Desativar ${acesso.nome}?\n\nO login perde o acesso ao painel e sai da roleta de leads. Os leads dele continuam na carteira até o gestor do grupo repassá-los.`,
                () => alternarAtivoDoAcesso(acesso.grupoId, acesso.corretorId, false),
              )
            }
            className={`${BOTAO_SECUNDARIO} text-perigo disabled:opacity-50`}
          >
            Desativar
          </button>
        ) : (
          <button
            type="button"
            disabled={pendente}
            onClick={() =>
              agir(`Reativar ${acesso.nome}?\n\nO login volta ao painel e à roleta de leads.`, () =>
                alternarAtivoDoAcesso(acesso.grupoId, acesso.corretorId, true),
              )
            }
            className={`${BOTAO_SECUNDARIO} disabled:opacity-50`}
          >
            Reativar
          </button>
        )}
        <button
          type="button"
          disabled={pendente}
          onClick={() =>
            agir(
              ehGestor
                ? `Tirar ${acesso.nome} da administração da imobiliária?\n\nEle volta a ser corretor e deixa de ver a equipe e as configurações.`
                : `Tornar ${acesso.nome} administrador da imobiliária?\n\nEle passa a administrar a equipe, os leads de todos e as configurações.`,
              () => alterarPapelDoAcesso(acesso.grupoId, acesso.corretorId, ehGestor ? "corretor" : "gestor"),
            )
          }
          className={`${BOTAO_SECUNDARIO} disabled:opacity-50`}
        >
          {ehGestor ? "Voltar a corretor" : "Tornar administrador"}
        </button>
      </div>
      {pendente && <p className="text-fluid-xs text-apoio" role="status">Salvando…</p>}
      {aviso && (
        <p role={aviso.erro ? "alert" : "status"} className={`text-fluid-xs ${aviso.erro ? "text-perigo" : "text-ok"}`}>
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
