"use client";

import { useState, useTransition } from "react";
import type { CorretorAdmin } from "@/lib/corretorSessao";
import { Check, Copy, KeyRound, ShieldCheck, TriangleAlert, UserPlus } from "lucide-react";
import {
  alterarPapelCorretor,
  alternarAtivoCorretor,
  criarAcessoCorretor,
  redefinirSenhaCorretor,
} from "../acoes";

/**
 * Contas de acesso da equipe.
 *
 * A tela existe porque, até aqui, criar login era trabalho manual no Supabase
 * — e o resultado prático era que 7 dos 8 corretores cadastrados recebiam
 * lead sem conseguir entrar no sistema.
 */

type Credencial = { nome: string; email: string; senha: string; slug: string };

/** A senha aparece UMA vez. Some ao fechar e não volta — só redefinindo. */
function CartaoCredencial({ cred, aoFechar }: { cred: Credencial; aoFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);

  const texto = `Acesso ao painel Next Home\nSite: ${typeof window !== "undefined" ? window.location.origin : ""}/corretor/entrar\nE-mail: ${cred.email}\nSenha provisória: ${cred.senha}`;

  return (
    <div className="border-ok-linha bg-ok-lavado mb-6 rounded-2xl border p-5">
      <h3 className="text-fluid-sm flex items-center gap-2 font-bold text-titulo">
        <Check className="h-4 w-4 text-ok" /> Acesso criado para {cred.nome}
      </h3>
      <p className="text-fluid-xs mt-1 text-corpo">
        Copie e mande para {cred.nome} agora — <strong>esta senha não aparece de novo</strong>. No
        primeiro acesso o sistema pede para trocá-la.
      </p>

      <dl className="text-fluid-sm bg-superficie border-linha mt-3 space-y-1 rounded-xl border p-3">
        <div>
          <dt className="text-tenue inline">E-mail </dt>
          <dd className="inline font-medium text-titulo">{cred.email}</dd>
        </div>
        <div>
          <dt className="text-tenue inline">Senha </dt>
          <dd className="inline font-mono font-bold text-acento-suave">{cred.senha}</dd>
        </div>
        <div>
          <dt className="text-tenue inline">Link pessoal </dt>
          <dd className="inline text-corpo">/?corretor={cred.slug}</dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(texto);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2500);
          }}
          className="text-fluid-xs bg-acento hover:bg-acento-hover flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-4 font-medium text-sobre-cor"
        >
          <Copy className="h-4 w-4" /> {copiado ? "Copiado!" : "Copiar dados de acesso"}
        </button>
        <button
          type="button"
          onClick={aoFechar}
          className="text-fluid-xs border-linha-forte text-corpo flex min-h-11 cursor-pointer items-center rounded-lg border px-4"
        >
          Já enviei, fechar
        </button>
      </div>
    </div>
  );
}

function LinhaCorretor({
  corretor,
  souEu,
  aoCriar,
  aoAvisar,
}: {
  corretor: CorretorAdmin;
  souEu: boolean;
  aoCriar: (c: Credencial) => void;
  aoAvisar: (msg: string, erro: boolean) => void;
}) {
  const [email, setEmail] = useState(corretor.email ?? "");
  const [abrindo, setAbrindo] = useState(false);
  const [pendente, iniciar] = useTransition();

  const criar = () =>
    iniciar(async () => {
      const r = await criarAcessoCorretor(corretor.id, email);
      if ("erro" in r && r.erro) return aoAvisar(r.erro, true);
      if (r.ok) {
        aoCriar({ nome: corretor.nome, email: r.email, senha: r.senha, slug: r.slug });
        setAbrindo(false);
      }
    });

  const redefinir = () =>
    iniciar(async () => {
      if (!confirm(`Gerar nova senha para ${corretor.nome}? A atual deixa de funcionar.`)) return;
      const r = await redefinirSenhaCorretor(corretor.id);
      if ("erro" in r && r.erro) return aoAvisar(r.erro, true);
      if (r.ok) aoCriar({ nome: corretor.nome, email: r.email, senha: r.senha, slug: r.slug });
    });

  const trocarPapel = () =>
    iniciar(async () => {
      const novo = corretor.papel === "gestor" ? "corretor" : "gestor";
      const r = await alterarPapelCorretor(corretor.id, novo);
      aoAvisar(r.erro ?? r.ok ?? "", Boolean(r.erro));
    });

  const trocarAtivo = () => {
    /*
     * Desativar é a ação mais séria da tela e era a única SEM confirmação.
     * E o aviso diz o que o botão não faz: os leads NÃO mudam de mão
     * sozinhos — sem redistribuir, viram um bolo que ninguém atende, e o
     * dono some da tabela de carga.
     */
    if (corretor.ativo) {
      const aviso =
        corretor.leads > 0
          ? `Desativar ${corretor.nome}?\n\nEle sai da roleta, mas os ${corretor.leads} lead${corretor.leads === 1 ? "" : "s"} dele CONTINUAM com ele. Passe a carteira em Administração → Leads da equipe → Passar carteira (antes ou depois, mas não esqueça).`
          : `Desativar ${corretor.nome}?\n\nEle sai da roleta e não recebe mais leads.`;
      if (!confirm(aviso)) return;
    }

    iniciar(async () => {
      const r = await alternarAtivoCorretor(corretor.id, !corretor.ativo);
      aoAvisar(r.erro ?? r.ok ?? "", Boolean(r.erro));
    });
  };

  return (
    <li className="border-linha border-t py-4 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-fluid-sm flex items-center gap-2 font-semibold text-titulo">
            {corretor.nome}
            {corretor.papel === "gestor" && (
              <span className="text-fluid-xs border-acento-linha bg-acento-lavado text-acento-suave inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium">
                <ShieldCheck className="h-3 w-3" /> Administra
              </span>
            )}
            {souEu && <span className="text-fluid-xs text-tenue">(você)</span>}
          </p>
          <p className="text-fluid-xs text-apoio mt-0.5">
            {corretor.email ?? "sem e-mail"} · {corretor.leads} lead
            {corretor.leads === 1 ? "" : "s"}
            {!corretor.ativo && " · desativado"}
            {corretor.emPausa && " · em pausa"}
          </p>
        </div>

        <span
          className={`text-fluid-xs h-fit rounded-full border px-2.5 py-1 font-medium ${
            corretor.temLogin
              ? "border-ok-linha bg-ok-lavado text-ok"
              : "border-alerta-linha bg-alerta-lavado text-alerta"
          }`}
        >
          {corretor.temLogin ? "Tem acesso" : "Sem acesso"}
        </span>
      </div>

      {/* Sem login: o buraco que esta tela veio fechar. */}
      {!corretor.temLogin && !abrindo && (
        <button
          type="button"
          onClick={() => setAbrindo(true)}
          className="text-fluid-xs bg-acento hover:bg-acento-hover mt-3 flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-4 font-medium text-sobre-cor"
        >
          <UserPlus className="h-4 w-4" /> Criar acesso
        </button>
      )}

      {!corretor.temLogin && abrindo && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@doCorretor.com"
            className="text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-w-0 flex-1 rounded-xl border px-3.5 py-2.5 focus:outline-none"
          />
          <button
            type="button"
            onClick={criar}
            disabled={pendente}
            className="text-fluid-xs bg-acento hover:bg-acento-hover flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg px-4 font-bold text-sobre-cor disabled:opacity-60"
          >
            {pendente ? "Criando…" : "Criar acesso"}
          </button>
          <button
            type="button"
            onClick={() => setAbrindo(false)}
            className="text-fluid-xs border-linha-forte text-corpo flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg border px-4"
          >
            Cancelar
          </button>
        </div>
      )}

      {corretor.temLogin && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={redefinir}
            disabled={pendente}
            className="text-fluid-xs border-linha-forte text-corpo hover:bg-vidro flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 disabled:opacity-60"
          >
            <KeyRound className="h-3.5 w-3.5" /> Redefinir senha
          </button>
          <button
            type="button"
            onClick={trocarPapel}
            disabled={pendente || souEu}
            title={souEu ? "Peça a outro gestor para mudar o seu papel." : undefined}
            className="text-fluid-xs border-linha-forte text-corpo hover:bg-vidro flex min-h-11 cursor-pointer items-center rounded-lg border px-3 disabled:opacity-40"
          >
            {corretor.papel === "gestor" ? "Tirar administração" : "Tornar administrador"}
          </button>
          <button
            type="button"
            onClick={trocarAtivo}
            disabled={pendente}
            className="text-fluid-xs border-linha-forte text-apoio hover:text-perigo hover:border-perigo-linha flex min-h-11 cursor-pointer items-center rounded-lg border px-3 disabled:opacity-60"
          >
            {corretor.ativo ? "Desativar" : "Reativar"}
          </button>
        </div>
      )}
    </li>
  );
}

export function ContasManager({
  corretores,
  meuId,
}: {
  corretores: CorretorAdmin[];
  meuId: string;
}) {
  const [credencial, setCredencial] = useState<Credencial | null>(null);
  const [aviso, setAviso] = useState<{ msg: string; erro: boolean } | null>(null);

  const semAcesso = corretores.filter((c) => !c.temLogin).length;

  return (
    <div>
      {credencial && (
        <CartaoCredencial cred={credencial} aoFechar={() => setCredencial(null)} />
      )}

      {aviso && aviso.msg && (
        <p
          className={`text-fluid-xs mb-4 rounded-xl border px-4 py-3 ${
            aviso.erro
              ? "border-perigo-linha bg-perigo-lavado text-perigo"
              : "border-ok-linha bg-ok-lavado text-ok"
          }`}
        >
          {aviso.msg}
        </p>
      )}

      {semAcesso > 0 && (
        <div className="border-alerta-linha bg-alerta-lavado mb-5 flex items-start gap-2 rounded-2xl border p-4">
          <TriangleAlert className="text-alerta mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-fluid-xs text-corpo">
            <strong className="text-titulo">
              {semAcesso} pessoa{semAcesso === 1 ? "" : "s"} sem acesso ao painel.
            </strong>{" "}
            Elas aparecem no site e podem receber leads, mas não conseguem entrar para atender.
          </p>
        </div>
      )}

      <ul className="border-linha bg-superficie rounded-2xl border px-5">
        {corretores.map((c) => (
          <LinhaCorretor
            key={c.id}
            corretor={c}
            souEu={c.id === meuId}
            aoCriar={(cred) => {
              setCredencial(cred);
              setAviso(null);
            }}
            aoAvisar={(msg, erro) => setAviso({ msg, erro })}
          />
        ))}
      </ul>
    </div>
  );
}
