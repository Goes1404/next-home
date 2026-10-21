"use client";

import { useState, useTransition } from "react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import type { EnderecoDoGrupo } from "@/lib/plataforma/grupos";
import type { TipoDeEndereco } from "@/lib/sites/siteEditavel";
import { ligarEnderecoDoSite, removerEnderecoDoSite, type ResultadoDoEndereco } from "../../enderecosAcoes";

const CLASSE_DO_CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 w-full rounded-xl border px-3.5 py-2.5 focus:outline-none";
const BOTAO_PRINCIPAL =
  "text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 cursor-pointer items-center rounded-xl px-5 font-bold disabled:opacity-60";
const BOTAO_SECUNDARIO =
  "botao-secundario text-fluid-sm text-titulo flex min-h-11 cursor-pointer items-center rounded-xl px-4 font-medium disabled:opacity-60";

const ROTULO_DO_TIPO: Record<TipoDeEndereco, string> = { proprio: "Domínio próprio", gratuito: "Endereço gratuito" };

/**
 * Os endereços do site do grupo (0201): ligar e tirar. O domínio também
 * precisa existir em Vercel → Settings → Domains; sem isso o endereço não
 * chega ao site, mesmo ligado aqui.
 */
export function EnderecosDoGrupo({ grupoId, enderecos }: { grupoId: string; enderecos: EnderecoDoGrupo[] }) {
  const [host, setHost] = useState("");
  const [tipo, setTipo] = useState<TipoDeEndereco>("proprio");
  const [principal, setPrincipal] = useState(enderecos.length === 0);
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const [pendente, iniciar] = useTransition();

  const rodar = (acao: () => Promise<ResultadoDoEndereco>, sucesso: string, aoOk?: () => void) =>
    iniciar(async () => {
      setAviso(null);
      try {
        const r = await acao();
        if (r.ok) {
          setAviso({ texto: sucesso, erro: false });
          aoOk?.();
        } else {
          setAviso({ texto: r.erro, erro: true });
        }
      } catch (e) {
        setAviso({
          texto: ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Não foi possível falar com o servidor. Tente de novo.",
          erro: true,
        });
      }
    });

  return (
    <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-site">
      <h2 id="titulo-site" className="text-fluid-sm text-titulo font-bold">
        Site
      </h2>

      {enderecos.length === 0 ? (
        <p className="text-fluid-sm text-apoio">Este grupo ainda não tem endereço de site.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {enderecos.map((e) => (
            <li key={e.host} className="border-linha flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
              <div className="min-w-0">
                <p className="text-fluid-sm text-titulo font-medium break-all">{e.host}</p>
                <p className="text-fluid-xs text-apoio">
                  {ROTULO_DO_TIPO[e.tipo]}
                  {e.principal ? " · principal" : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={pendente}
                onClick={() => {
                  if (!window.confirm(`Tirar o endereço ${e.host} do site deste grupo?`)) return;
                  rodar(() => removerEnderecoDoSite(grupoId, e.host), "Endereço removido.");
                }}
                className={BOTAO_SECUNDARIO}
              >
                Tirar
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          rodar(() => ligarEnderecoDoSite(grupoId, { host, tipo, principal }), "Endereço ligado.", () => setHost(""));
        }}
      >
        <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1 sm:col-span-2">
          Endereço (sem https:// e sem barra)
          <input
            name="host"
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="www.imobiliariasol.com.br"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={CLASSE_DO_CAMPO}
          />
        </label>
        <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
          Tipo
          <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeEndereco)} className={CLASSE_DO_CAMPO}>
            <option value="proprio">Domínio próprio</option>
            <option value="gratuito">Endereço gratuito</option>
          </select>
        </label>
        <label className="text-fluid-sm text-corpo flex min-h-11 items-center gap-2 self-end">
          <input type="checkbox" checked={principal} onChange={(e) => setPrincipal(e.target.checked)} className="size-5" />
          Endereço principal
        </label>
        <p className="text-fluid-xs text-apoio sm:col-span-2">
          O mesmo endereço também precisa ser adicionado em Vercel → Settings → Domains; sem isso o site não abre. O
          principal é o que vale para os links, o Google e o botão &quot;Ver meu site&quot;.
        </p>
        <div className="sm:col-span-2">
          <button type="submit" disabled={pendente || host.trim() === ""} className={BOTAO_PRINCIPAL}>
            {pendente ? "Salvando…" : "Ligar o endereço"}
          </button>
        </div>
      </form>

      {aviso && (
        <p
          role={aviso.erro ? "alert" : "status"}
          className={`text-fluid-sm rounded-xl border px-4 py-3 ${
            aviso.erro ? "border-perigo-linha bg-perigo-lavado text-perigo" : "border-ok-linha bg-ok-lavado text-ok"
          }`}
        >
          {aviso.texto}
        </p>
      )}
    </section>
  );
}
