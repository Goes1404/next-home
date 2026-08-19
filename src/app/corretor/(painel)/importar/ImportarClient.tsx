"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  analisarArquivo,
  analisarTexto,
  criarLeadUnico,
  importarLeads,
  type CandidatoRevisado,
  type ResumoImportacao,
} from "./actions";

import { GmailLeadsExtractor } from "./GmailLeadsExtractor";
import { Mail } from 'lucide-react';

type Empreendimento = { id: string; nome: string };
type Aba = "unico" | "lote" | "gmail";

const CAMPO =
  "border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento w-full rounded-xl border px-4 py-3 outline-none transition-colors";
const ROTULO = "text-fluid-sm text-corpo mb-1.5 block";

export function ImportarClient({
  empreendimentos,
  ehGestor,
}: {
  empreendimentos: Empreendimento[];
  ehGestor: boolean;
}) {
  const [aba, setAba] = useState<Aba>("gmail");

  return (
    <div className="mt-8">
      <div role="tablist" aria-label="Como adicionar" className="border-linha flex flex-wrap gap-1 border-b">
        <Botao aba="gmail" atual={aba} onSelect={setAba}>
          <span className="flex items-center gap-1.5">
            <span> <Mail className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span> Puxar do Gmail & Portais
            <span className="rounded-full bg-brand-500/20 px-1.5 py-0.2 text-[10px] font-bold text-brand-300">
              IA
            </span>
          </span>
        </Botao>
        <Botao aba="unico" atual={aba} onSelect={setAba}>
          Um contato manual
        </Botao>
        <Botao aba="lote" atual={aba} onSelect={setAba}>
          Planilha / Arquivo
        </Botao>
      </div>

      <div className="mt-6">
        {aba === "gmail" ? (
          <GmailLeadsExtractor empreendimentos={empreendimentos} ehGestor={ehGestor} />
        ) : aba === "unico" ? (
          <FormularioUnico empreendimentos={empreendimentos} />
        ) : (
          <Importador empreendimentos={empreendimentos} ehGestor={ehGestor} />
        )}
      </div>
    </div>
  );
}

function Botao({
  aba,
  atual,
  onSelect,
  children,
}: {
  aba: Aba;
  atual: Aba;
  onSelect: (a: Aba) => void;
  children: React.ReactNode;
}) {
  const ativa = aba === atual;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativa}
      onClick={() => onSelect(aba)}
      className={cn(
        "-mb-px min-h-11 cursor-pointer border-b-2 px-4 text-sm font-medium transition-colors",
        ativa
          ? "border-acento text-acento-suave"
          : "text-apoio hover:text-titulo border-transparent",
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Um contato                                                                  */
/* -------------------------------------------------------------------------- */

function FormularioUnico({ empreendimentos }: { empreendimentos: Empreendimento[] }) {
  const [estado, action, pendente] = useActionState(criarLeadUnico, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
        // Limpa para o próximo: quem cadastra um contato à mão quase sempre
        // tem outro na sequência.
        formRef.current?.reset();
      }}
      className="border-linha bg-superficie shadow-painel max-w-2xl space-y-4 rounded-2xl border p-6"
    >
      <div>
        <label htmlFor="nome" className={ROTULO}>
          Nome
        </label>
        <input id="nome" name="nome" required minLength={2} maxLength={120} className={CAMPO} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="telefone" className={ROTULO}>
            WhatsApp
          </label>
          <input
            id="telefone"
            name="telefone"
            type="tel"
            placeholder="(11) 91234-5678"
            className={CAMPO}
          />
        </div>
        <div>
          <label htmlFor="email" className={ROTULO}>
            E-mail
          </label>
          <input id="email" name="email" type="email" className={CAMPO} />
        </div>
      </div>
      <p className="text-fluid-xs text-tenue -mt-2">Informe pelo menos um dos dois.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tipo" className={ROTULO}>
            Perfil
          </label>
          <select id="tipo" name="tipo" className={cn(CAMPO, "cursor-pointer")}>
            <option value="comprador">Quer comprar</option>
            <option value="proprietario">Tem imóvel para ofertar</option>
          </select>
        </div>
        <div>
          <label htmlFor="empreendimentoId" className={ROTULO}>
            Imóvel de interesse
          </label>
          <select
            id="empreendimentoId"
            name="empreendimentoId"
            className={cn(CAMPO, "cursor-pointer")}
          >
            <option value="">Nenhum por enquanto</option>
            {empreendimentos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="mensagem" className={ROTULO}>
          O que ele procura
        </label>
        <textarea
          id="mensagem"
          name="mensagem"
          rows={3}
          maxLength={2000}
          placeholder="Três dormitórios, até R$ 1,2 mi, região de Alphaville…"
          className={CAMPO}
        />
      </div>

      <Consentimento />

      {estado?.erro && (
        <p role="alert" className="text-fluid-sm text-perigo">
          {estado.erro}
        </p>
      )}
      {estado?.ok && (
        <p className="text-fluid-sm text-ok">
          {estado.ok}{" "}
          <Link href="/corretor/funil" className="underline underline-offset-4">
            Ver no funil
          </Link>
        </p>
      )}

      <button
        type="submit"
        disabled={pendente}
        className="bg-acento hover:bg-acento-hover flex min-h-11 items-center rounded-full px-7 text-sm font-medium text-white transition-colors disabled:opacity-60"
      >
        {pendente ? "Salvando…" : "Adicionar ao funil"}
      </button>
    </form>
  );
}

function Consentimento() {
  return (
    <label className="text-fluid-xs text-apoio flex min-h-11 w-fit cursor-pointer items-start gap-2.5 pt-1">
      <input
        type="checkbox"
        name="consentimento"
        required
        className="accent-acento mt-0.5 h-4.5 w-4.5 shrink-0 cursor-pointer"
      />
      <span className="max-w-md">
        Confirmo que tenho autorização do titular para tratar estes dados de contato (LGPD).
      </span>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Vários de uma vez                                                           */
/* -------------------------------------------------------------------------- */

type Etapa = "entrada" | "revisao" | "concluido";

function Importador({
  empreendimentos,
  ehGestor,
}: {
  empreendimentos: Empreendimento[];
  ehGestor: boolean;
}) {
  const [etapa, setEtapa] = useState<Etapa>("entrada");
  const [modo, setModo] = useState<"colar" | "arquivo">("colar");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<"tabela" | "texto" | "ia" | null>(null);
  const [linhas, setLinhas] = useState<(CandidatoRevisado & { incluir: boolean })[]>([]);
  const [resumo, setResumo] = useState<ResumoImportacao | null>(null);

  const [empreendimentoId, setEmpreendimentoId] = useState("");
  const [distribuir, setDistribuir] = useState(false);
  const [consentimento, setConsentimento] = useState(false);

  const [analisando, iniciarAnalise] = useTransition();
  const [importando, iniciarImportacao] = useTransition();

  const selecionados = linhas.filter((l) => l.incluir);
  const duplicados = linhas.filter((l) => l.jaExiste).length;

  function receber(resultado: Awaited<ReturnType<typeof analisarTexto>>) {
    if (resultado.erro || !resultado.candidatos) {
      setErro(resultado.erro ?? "Não foi possível ler o conteúdo.");
      return;
    }
    setErro(null);
    setMetodo(resultado.metodo ?? null);
    // Duplicado entra desmarcado: o padrão seguro é não recriar o que já
    // está na carteira, mas a decisão continua com o corretor.
    setLinhas(resultado.candidatos.map((c) => ({ ...c, incluir: !c.jaExiste })));
    setEtapa("revisao");
  }

  function analisar(formData?: FormData) {
    iniciarAnalise(async () => {
      receber(formData ? await analisarArquivo(formData) : await analisarTexto(texto));
    });
  }

  function confirmar() {
    iniciarImportacao(async () => {
      const resultado = await importarLeads(
        selecionados.map((l) => ({
          nome: l.nome,
          telefone: l.telefone,
          email: l.email,
          mensagem: l.mensagem,
          imovelInteresse: l.imovelInteresse,
        })),
        { distribuirNaEquipe: distribuir, empreendimentoId: empreendimentoId || null, consentimento },
      );

      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      setErro(null);
      setResumo(resultado);
      setEtapa("concluido");
    });
  }

  function recomecar() {
    setEtapa("entrada");
    setLinhas([]);
    setTexto("");
    setResumo(null);
    setErro(null);
    setConsentimento(false);
  }

  if (etapa === "concluido" && resumo) {
    return (
      <div className="border-ok-linha bg-ok-lavado max-w-2xl rounded-2xl border p-6">
        <p className="font-display text-titulo text-lg">
          {resumo.inseridos === 1
            ? "1 contato entrou no funil"
            : `${resumo.inseridos} contatos entraram no funil`}
        </p>
        <p className="text-fluid-sm text-corpo mt-1">
          {distribuir
            ? "Distribuídos entre a equipe pela roleta, na etapa “Novo lead”."
            : "Todos na sua carteira, na etapa “Novo lead”."}
        </p>
        {(resumo.ignorados ?? 0) > 0 && (
          <p className="text-fluid-xs text-apoio mt-2">
            {resumo.ignorados} sem telefone aproveitável ficaram de fora.
          </p>
        )}
        {(resumo.falhas ?? 0) > 0 && (
          <p className="text-fluid-xs text-perigo mt-2">
            {resumo.falhas} não puderam ser gravados. Tente esses de novo.
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/corretor/funil"
            className="bg-acento hover:bg-acento-hover flex min-h-11 items-center rounded-full px-5 text-sm font-medium text-white transition-colors"
          >
            Abrir o funil
          </Link>
          <button
            type="button"
            onClick={recomecar}
            className="border-linha-forte text-corpo flex min-h-11 cursor-pointer items-center rounded-full border px-5 text-sm"
          >
            Importar outra lista
          </button>
        </div>
      </div>
    );
  }

  if (etapa === "revisao") {
    return (
      <div className="space-y-5">
        <div className="border-linha bg-superficie shadow-painel rounded-2xl border p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-display text-titulo text-lg">
              {linhas.length === 1
                ? "1 contato encontrado"
                : `${linhas.length} contatos encontrados`}
            </p>
            <button
              type="button"
              onClick={recomecar}
              className="text-fluid-sm text-apoio hover:text-titulo cursor-pointer underline-offset-4 hover:underline"
            >
              Trocar a lista
            </button>
          </div>
          <p className="text-fluid-sm text-apoio mt-1">
            {metodo === "ia"
              ? "Lidos por IA — confira nome e telefone antes de confirmar."
              : metodo === "texto"
                ? "Lidos do texto do arquivo. Confira e ajuste o que precisar."
                : "Lidos direto da tabela. Confira e ajuste o que precisar."}
            {duplicados > 0 &&
              ` ${duplicados} já ${duplicados === 1 ? "está" : "estão"} na carteira e ${duplicados === 1 ? "veio" : "vieram"} desmarcado${duplicados === 1 ? "" : "s"}.`}
          </p>
        </div>

        <ListaRevisao linhas={linhas} onChange={setLinhas} />

        <div className="border-linha bg-superficie shadow-painel space-y-4 rounded-2xl border p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="imovel-lote" className={ROTULO}>
                Vincular todos a um imóvel
              </label>
              <select
                id="imovel-lote"
                value={empreendimentoId}
                onChange={(e) => setEmpreendimentoId(e.target.value)}
                className={cn(CAMPO, "cursor-pointer")}
              >
                <option value="">Nenhum</option>
                {empreendimentos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </div>

            {ehGestor && (
              <div className="flex items-end">
                <label className="text-fluid-sm text-corpo flex min-h-11 w-fit cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={distribuir}
                    onChange={(e) => setDistribuir(e.target.checked)}
                    className="accent-acento h-4.5 w-4.5 cursor-pointer"
                  />
                  Distribuir entre a equipe pela roleta
                </label>
              </div>
            )}
          </div>

          <label className="text-fluid-xs text-apoio flex min-h-11 w-fit cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={consentimento}
              onChange={(e) => setConsentimento(e.target.checked)}
              className="accent-acento mt-0.5 h-4.5 w-4.5 shrink-0 cursor-pointer"
            />
            <span className="max-w-md">
              Confirmo que tenho autorização dos titulares para tratar estes dados de contato
              (LGPD).
            </span>
          </label>

          {erro && (
            <p role="alert" className="text-fluid-sm text-perigo">
              {erro}
            </p>
          )}

          <button
            type="button"
            onClick={confirmar}
            disabled={importando || selecionados.length === 0 || !consentimento}
            className="bg-acento hover:bg-acento-hover flex min-h-11 items-center rounded-full px-7 text-sm font-medium text-white transition-colors disabled:opacity-50"
          >
            {importando
              ? "Importando…"
              : selecionados.length === 0
                ? "Selecione ao menos um contato"
                : `Importar ${selecionados.length} contato${selecionados.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-linha bg-superficie shadow-painel max-w-2xl rounded-2xl border p-6">
      <div className="flex gap-1">
        {(["colar", "arquivo"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            className={cn(
              "min-h-9 cursor-pointer rounded-full px-4 text-sm font-medium transition-colors",
              modo === m
                ? "bg-acento-lavado text-acento-suave"
                : "text-apoio hover:text-titulo",
            )}
          >
            {m === "colar" ? "Colar lista" : "Enviar arquivo"}
          </button>
        ))}
      </div>

      {modo === "colar" ? (
        <div className="mt-5">
          <label htmlFor="lista" className={ROTULO}>
            Cole a lista de contatos
          </label>
          <textarea
            id="lista"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={9}
            placeholder={"nome;telefone;email\nAna Prado;(11) 99123-4567;ana@exemplo.com"}
            className={cn(CAMPO, "font-mono text-[13px]")}
          />
          <p className="text-fluid-xs text-tenue mt-2">
            Funciona com tabela colada do Excel ou do Google Sheets, CSV, ou uma lista solta —
            neste último caso a IA lê o texto.
          </p>

          <button
            type="button"
            onClick={() => analisar()}
            disabled={analisando || !texto.trim()}
            className="bg-acento hover:bg-acento-hover mt-4 flex min-h-11 items-center rounded-full px-6 text-sm font-medium text-white transition-colors disabled:opacity-50"
          >
            {analisando ? "Lendo…" : "Ler contatos"}
          </button>
        </div>
      ) : (
        <form
          action={(formData) => analisar(formData)}
          className="mt-5"
        >
          <label htmlFor="arquivo" className={ROTULO}>
            Escolha o arquivo
          </label>
          <input
            id="arquivo"
            name="arquivo"
            type="file"
            required
            accept=".pdf,.csv,.tsv,.txt,application/pdf,text/csv,text/plain"
            className="text-fluid-sm text-corpo file:border-linha-forte file:bg-vidro file:text-corpo hover:file:bg-vidro-forte w-full cursor-pointer file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-full file:border file:px-4 file:text-sm"
          />
          <p className="text-fluid-xs text-tenue mt-2">
            PDF, CSV, TSV ou TXT, até 10 MB. PDF escaneado (foto de página) depende da leitura por IA; PDF de texto é lido direto. Planilha do Excel: salve como CSV antes de enviar.
          </p>

          <button
            type="submit"
            disabled={analisando}
            className="bg-acento hover:bg-acento-hover mt-4 flex min-h-11 items-center rounded-full px-6 text-sm font-medium text-white transition-colors disabled:opacity-50"
          >
            {analisando ? "Lendo o arquivo…" : "Ler contatos"}
          </button>
        </form>
      )}

      {erro && (
        <p role="alert" className="text-fluid-sm text-perigo mt-4">
          {erro}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Revisão linha a linha                                                       */
/* -------------------------------------------------------------------------- */

type LinhaRevisao = CandidatoRevisado & { incluir: boolean };

function ListaRevisao({
  linhas,
  onChange,
}: {
  linhas: LinhaRevisao[];
  onChange: (l: LinhaRevisao[]) => void;
}) {
  const todosMarcados = linhas.length > 0 && linhas.every((l) => l.incluir);

  function alterar(indice: number, campo: "nome" | "telefone" | "email", valor: string) {
    onChange(linhas.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)));
  }

  return (
    <div className="border-linha bg-superficie shadow-painel overflow-hidden rounded-2xl border">
      <label className="border-linha text-fluid-sm text-corpo flex min-h-12 cursor-pointer items-center gap-2.5 border-b px-5">
        <input
          type="checkbox"
          checked={todosMarcados}
          onChange={(e) => onChange(linhas.map((l) => ({ ...l, incluir: e.target.checked })))}
          className="accent-acento h-4.5 w-4.5 cursor-pointer"
        />
        Marcar todos
      </label>

      <ul className="divide-linha divide-y">
        {linhas.map((linha, i) => (
          /*
           * Grid, e não flex, por causa da etiqueta: a coluna de 5rem existe
           * em toda linha, tenha etiqueta ou não, então os campos ficam
           * alinhados de cima a baixo. Com flex, só a linha marcada como
           * duplicada encolhia e a tabela inteira desalinhava. No celular a
           * coluna some e a etiqueta desce para baixo dos campos.
           */
          <li
            key={`${linha.telefoneE164 ?? linha.telefone}-${i}`}
            className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-5 py-3 sm:grid-cols-[auto_minmax(0,1fr)_5rem]"
          >
            <input
              type="checkbox"
              checked={linha.incluir}
              onChange={(e) => onChange(linhas.map((l, j) => (i === j ? { ...l, incluir: e.target.checked } : l)))}
              aria-label={`Incluir ${linha.nome}`}
              className="accent-acento mt-3 h-4.5 w-4.5 shrink-0 cursor-pointer"
            />

            <div className="grid min-w-0 gap-2 sm:grid-cols-[1.2fr_1fr_1.2fr]">
              <CampoLinha
                rotulo="Nome"
                valor={linha.nome}
                onChange={(v) => alterar(i, "nome", v)}
              />
              <CampoLinha
                rotulo="Telefone"
                valor={linha.telefone}
                onChange={(v) => alterar(i, "telefone", v)}
              />
              <CampoLinha
                rotulo="E-mail"
                valor={linha.email ?? ""}
                onChange={(v) => alterar(i, "email", v)}
              />
            </div>

            {linha.jaExiste && (
              <span className="text-alerta bg-alerta-lavado border-alerta-linha col-start-2 h-fit w-fit rounded-full border px-2 py-0.5 text-[11px] font-medium sm:col-start-3 sm:mt-2 sm:justify-self-end">
                já existe
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CampoLinha({
  rotulo,
  valor,
  onChange,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="min-w-0">
      <span className="sr-only">{rotulo}</span>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={rotulo}
        className="border-linha bg-campo text-corpo focus:border-acento text-fluid-xs min-h-11 w-full rounded-lg border px-3 outline-none transition-colors"
      />
    </label>
  );
}
