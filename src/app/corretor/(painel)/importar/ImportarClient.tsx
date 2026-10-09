"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import {
  analisarArquivo,
  analisarTexto,
  criarLeadUnico,
  importarLeads,
  type CandidatoRevisado,
  type ResultadoAnalise,
  type ResumoImportacao,
} from "./actions";

import { GmailLeadsExtractor } from "./GmailLeadsExtractor";
import { formatarTelefoneBr } from "@/lib/inbound/phoneUtils";
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
      className="cartao max-w-2xl space-y-4 p-6"
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
        className="bg-acento hover:bg-acento-hover flex min-h-11 items-center rounded-full px-7 text-sm font-medium text-sobre-cor transition-colors disabled:opacity-60"
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
  const [modo, setModo] = useState<"colar" | "arquivo" | "foto">("colar");
  const [texto, setTexto] = useState("");
  /** Quantos telefones o último colar trouxe inteiros pela versão em HTML da planilha. */
  const [recuperadosAoColar, setRecuperadosAoColar] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<ResultadoAnalise["metodo"] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<(CandidatoRevisado & { incluir: boolean })[]>([]);
  /*
   * Colunas que o corretor tirou da importação. A planilha às vezes traz uma
   * coluna que não deve entrar no CRM (observação interna, interesse errado,
   * nome trocado): tirá-la vale para todos os contatos de uma vez.
   */
  const [colunasFora, setColunasFora] = useState<Set<ColunaOpcional>>(new Set());
  const [resumo, setResumo] = useState<ResumoImportacao | null>(null);

  const [empreendimentoId, setEmpreendimentoId] = useState("");
  const [distribuir, setDistribuir] = useState(false);
  const [consentimento, setConsentimento] = useState(false);

  const [analisando, iniciarAnalise] = useTransition();
  const [lendoFoto, setLendoFoto] = useState<{ atual: number; total: number } | null>(null);
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
    setAviso(resultado.aviso ?? null);
    /*
     * Duplicado entra desmarcado: o padrão seguro é não recriar o que já
     * está na carteira, mas a decisão continua com o corretor. Contato SEM
     * telefone também — ele vem da conversa exportada de quem estava salvo na
     * agenda, e importar em branco criaria uma ficha que nunca recebe
     * mensagem. Marcar sozinho, depois de o corretor digitar o número, seria
     * decidir por ele.
     */
    setLinhas(
      resultado.candidatos.map((c) => ({ ...c, incluir: !c.jaExiste && Boolean(c.telefone) })),
    );
    setEtapa("revisao");
  }

  function analisar(formData?: FormData) {
    iniciarAnalise(async () => {
      try {
        receber(formData ? await analisarArquivo(formData) : await analisarTexto(texto));
      } catch (falha) {
        setErro(
          ehActionDeOutroBuild(falha)
            ? "O painel foi atualizado enquanto esta tela estava aberta. Recarregue a página e tente de novo."
            : "A leitura não terminou. Confira a conexão e tente de novo.",
        );
      }
    });
  }

  /**
   * As fotos são lidas assim que escolhidas, UMA chamada por foto: juntas
   * passariam do teto de corpo da Server Action (12 MB), e uma foto ruim não
   * pode derrubar a leitura das outras.
   */
  function lerFotos(campo: HTMLInputElement) {
    const arquivos = Array.from(campo.files ?? []).slice(0, TETO_DE_FOTOS);
    const passou = (campo.files?.length ?? 0) > TETO_DE_FOTOS;
    campo.value = "";
    if (arquivos.length === 0) return;
    iniciarAnalise(async () => {
      try {
        const juntos = await lerVariasFotos(arquivos, (n) => setLendoFoto({ atual: n, total: arquivos.length }));
        if (passou) {
          juntos.aviso = [`Lemos as ${TETO_DE_FOTOS} primeiras fotos; envie o resto numa próxima leva.`, juntos.aviso]
            .filter(Boolean)
            .join(" ");
        }
        receber(juntos);
      } catch (falha) {
        setErro(
          ehActionDeOutroBuild(falha)
            ? "O painel foi atualizado enquanto esta tela estava aberta. Recarregue a página e tente de novo."
            : "A leitura não terminou. Confira a conexão e tente de novo.",
        );
      } finally {
        setLendoFoto(null);
      }
    });
  }

  function confirmar() {
    iniciarImportacao(async () => {
      const resultado = await importarLeads(
        selecionados.map((l) => ({
          nome: colunasFora.has("nome") ? "" : l.nome,
          telefone: l.telefone,
          email: colunasFora.has("email") ? null : l.email,
          mensagem: colunasFora.has("mensagem") ? null : l.mensagem,
          imovelInteresse: colunasFora.has("imovelInteresse") ? null : l.imovelInteresse,
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
    setAviso(null);
    setConsentimento(false);
    setColunasFora(new Set());
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
            className="bg-acento hover:bg-acento-hover flex min-h-11 items-center rounded-full px-5 text-sm font-medium text-sobre-cor transition-colors"
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
        <div className="cartao p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-display text-titulo text-lg">
              {linhas.length === 1
                ? "1 contato encontrado"
                : `${linhas.length} contatos encontrados`}
            </p>
            <button
              type="button"
              onClick={recomecar}
              className="text-fluid-sm text-apoio hover:text-titulo cursor-pointer link-acao"
            >
              Trocar a lista
            </button>
          </div>
          <p className="text-fluid-sm text-apoio mt-1">
            {metodo === "ia"
              ? "Lidos por IA — confira nome e telefone antes de confirmar."
              : metodo === "whatsapp"
                ? "Lidos da conversa exportada. As suas próprias mensagens ficaram de fora."
                : metodo === "contatos"
                  ? "Lidos dos cartões de contato. Confira e ajuste o que precisar."
                  : metodo === "planilha"
                    ? "Lidos da planilha do Excel. Confira e ajuste o que precisar."
                : metodo === "texto"
                  ? "Lidos do texto do arquivo. Confira e ajuste o que precisar."
                  : "Lidos direto da tabela. Confira e ajuste o que precisar."}
            {duplicados > 0 &&
              ` ${duplicados} já ${duplicados === 1 ? "está" : "estão"} na carteira e ${duplicados === 1 ? "veio" : "vieram"} desmarcado${duplicados === 1 ? "" : "s"}.`}
          </p>
          {aviso && (
            <p className="text-fluid-sm text-alerta bg-alerta-lavado border-alerta-linha mt-3 rounded-xl border px-3 py-2">
              {aviso}
            </p>
          )}
        </div>

        <ColunasDaImportacao linhas={linhas} fora={colunasFora} onChange={setColunasFora} />

        <ListaRevisao linhas={linhas} onChange={setLinhas} fora={colunasFora} />

        <div className="cartao space-y-4 p-5">
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
            className="bg-acento hover:bg-acento-hover flex min-h-11 items-center rounded-full px-7 text-sm font-medium text-sobre-cor transition-colors disabled:opacity-50"
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
    <div className="cartao max-w-2xl p-6">
      <div className="flex flex-wrap gap-1">
        {(["colar", "foto", "arquivo"] as const).map((m) => (
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
            {m === "colar" ? "Colar lista" : m === "foto" ? "Foto ou print" : "Enviar arquivo"}
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
            onPaste={(e) => {
              /*
               * Celular com 55 copiado da planilha chega como "5,51198E+12", sem
               * os últimos dígitos. A cópia traz o número inteiro na versão em
               * HTML, e é ela que vale quando bate com o texto (ver
               * `coladoDaPlanilha.ts`). O módulo só é baixado quando a colagem
               * tem a notação: o resto cola do jeito de sempre.
               */
              const plano = e.clipboardData.getData("text/plain");
              const html = e.clipboardData.getData("text/html");
              setRecuperadosAoColar(0);
              if (!html || !/\d[.,]\d+[eE][+]?\d{1,2}/.test(plano)) return;
              e.preventDefault();
              const campo = e.currentTarget;
              const inicio = campo.selectionStart;
              const fim = campo.selectionEnd;
              import("@/lib/leads/coladoDaPlanilha")
                .then(({ recuperarNumerosColados }) => recuperarNumerosColados(plano, html))
                // Sem o módulo (rede caiu), cola o texto como veio: a importação marca as linhas.
                .catch(() => ({ texto: plano, recuperados: 0 }))
                .then((recuperado) => {
                  setRecuperadosAoColar(recuperado.recuperados);
                  const colar = recuperado.texto.replace(/\r\n?/g, "\n");
                  setTexto((atual) => atual.slice(0, inicio) + colar + atual.slice(fim));
                });
            }}
            rows={9}
            placeholder={"nome;telefone;email\nAna Prado;(11) 99123-4567;ana@exemplo.com"}
            className={cn(CAMPO, "font-mono text-[13px]")}
          />
          {recuperadosAoColar > 0 && (
            <p role="status" className="text-fluid-xs text-ok mt-2">
              {recuperadosAoColar === 1
                ? "1 telefone que a planilha mostrava cortado (como 5,51198E+12) veio com o número inteiro."
                : `${recuperadosAoColar} telefones que a planilha mostrava cortados (como 5,51198E+12) vieram com o número inteiro.`}
            </p>
          )}
          <p className="text-fluid-xs text-tenue mt-2">
            Funciona com tabela colada do Excel ou do Google Planilhas, CSV, ou uma lista solta —
            neste último caso a IA lê o texto. Também dá para colar só o link da planilha do
            Google, se ela estiver compartilhada como &quot;qualquer pessoa com o link&quot;.
          </p>

          <button
            type="button"
            onClick={() => analisar()}
            disabled={analisando || !texto.trim()}
            className="bg-acento hover:bg-acento-hover mt-4 flex min-h-11 items-center rounded-full px-6 text-sm font-medium text-sobre-cor transition-colors disabled:opacity-50"
          >
            {analisando ? "Lendo…" : "Ler contatos"}
          </button>
        </div>
      ) : modo === "foto" ? (
        <div className="mt-5">
          <p className="text-fluid-sm text-corpo">
            Print de conversa do WhatsApp, foto de uma lista escrita à mão, da ficha do plantão ou da tela de outro
            sistema. A IA lê nome e telefone de cada contato, e você confere antes de importar.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <label
              className={cn(
                "bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 cursor-pointer items-center rounded-full px-6 text-sm font-medium transition-colors",
                analisando && "pointer-events-none opacity-50",
              )}
            >
              {lendoFoto
                ? `Lendo foto ${lendoFoto.atual} de ${lendoFoto.total}…`
                : analisando
                  ? "Lendo…"
                  : "Escolher fotos ou prints"}
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                disabled={analisando}
                onChange={(e) => lerFotos(e.currentTarget)}
              />
            </label>
            <label
              className={cn(
                "border-linha-forte text-titulo hover:bg-vidro flex min-h-11 cursor-pointer items-center rounded-full border px-6 text-sm font-medium transition-colors",
                analisando && "pointer-events-none opacity-50",
              )}
            >
              Tirar foto agora
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                disabled={analisando}
                onChange={(e) => lerFotos(e.currentTarget)}
              />
            </label>
          </div>
          <p className="text-fluid-xs text-tenue mt-3">
            Até {TETO_DE_FOTOS} fotos de uma vez, 10 MB cada. Foto de perto e com boa luz é lida melhor; número que a IA não consegue ler
            fica de fora em vez de sair errado.
          </p>
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
            accept=".xlsx,.csv,.tsv,.txt,.pdf,.vcf,.zip,.jpg,.jpeg,.png,.webp,.heic,application/pdf,text/csv,text/plain,text/vcard,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*"
            className="text-fluid-sm text-corpo file:border-linha-forte file:bg-vidro file:text-corpo hover:file:bg-vidro-forte w-full cursor-pointer file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-full file:border file:px-4 file:text-sm"
          />
          <ul className="text-fluid-xs text-tenue mt-2 space-y-1 break-words">
            <li>
              <strong>Conversa do WhatsApp</strong>: na conversa ou no grupo, <em>Exportar conversa → Sem mídia</em>, e
              envie o <strong>.zip</strong> (iPhone) ou o <strong>.txt</strong> (Android).
            </li>
            <li>
              <strong>Contatos</strong>: o <strong>.vcf</strong> de um contato compartilhado no WhatsApp ou da agenda
              exportada do celular.
            </li>
            <li>
              <strong>Planilhas</strong>: Excel (.xlsx), CSV ou TSV — inclusive a exportação do Google Contatos e de
              portais.
            </li>
            <li>
              <strong>PDF</strong> de relatório, ou <strong>foto ou print</strong> de uma lista ou conversa (lidos por
              IA — confira antes de confirmar).
            </li>
            <li>Até 10 MB por arquivo.</li>
          </ul>

          <button
            type="submit"
            disabled={analisando}
            className="bg-acento hover:bg-acento-hover mt-4 flex min-h-11 items-center rounded-full px-6 text-sm font-medium text-sobre-cor transition-colors disabled:opacity-50"
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
/* Várias fotos                                                                */
/* -------------------------------------------------------------------------- */

const TETO_DE_FOTOS = 10;

/**
 * Lê uma foto por vez e junta o resultado. O mesmo contato em dois prints
 * (a mesma conversa, dois pedaços da mesma lista) entra uma vez só. Foto que
 * não rendeu ninguém vira aviso nomeando o arquivo, sem cancelar as outras.
 */
async function lerVariasFotos(
  arquivos: File[],
  aoComecar: (n: number) => void,
): Promise<ResultadoAnalise> {
  const candidatos: CandidatoRevisado[] = [];
  const vistos = new Set<string>();
  const semNada: string[] = [];
  let algumaComIa = false;

  for (const [i, arquivo] of arquivos.entries()) {
    aoComecar(i + 1);
    const dados = new FormData();
    dados.set("arquivo", arquivo);
    const r = await analisarArquivo(dados);
    if (!r.candidatos?.length) {
      semNada.push(arquivo.name || `foto ${i + 1}`);
      continue;
    }
    if (r.metodo === "ia") algumaComIa = true;
    for (const c of r.candidatos) {
      const chave = c.telefone ? c.telefone.replace(/\D/g, "") : `${c.nome}#${i}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      candidatos.push(c);
    }
  }

  if (candidatos.length === 0) {
    return {
      erro:
        arquivos.length === 1
          ? "Não achamos nenhum telefone legível na foto. Uma foto mais de perto, com boa luz, costuma resolver."
          : "Não achamos nenhum telefone legível nas fotos. Fotos mais de perto, com boa luz, costumam resolver.",
    };
  }

  // Print de planilha mostra o celular com 55 como "5,51198E+12": o número
  // inteiro não está na imagem, só no arquivo da planilha.
  const cortados = candidatos.filter((c) => c.telefoneCortado).length;
  const avisos = [
    algumaComIa ? "Lido por IA a partir das fotos: confira nome e telefone de cada linha antes de confirmar." : null,
    semNada.length > 0 ? `Sem telefone legível em: ${semNada.join(", ")}.` : null,
    cortados > 0
      ? `${cortados === 1 ? "1 telefone aparece cortado" : `${cortados} telefones aparecem cortados`} na foto (como 5,51198E+12), sem os últimos dígitos. Digite o número na linha ou envie a planilha em .xlsx.`
      : null,
  ].filter(Boolean);

  return { candidatos, metodo: algumaComIa ? "ia" : undefined, aviso: avisos.join(" ") || undefined };
}

/* -------------------------------------------------------------------------- */
/* Revisão linha a linha                                                       */
/* -------------------------------------------------------------------------- */

type LinhaRevisao = CandidatoRevisado & { incluir: boolean };

/** Colunas que dá para tirar da importação. O telefone não: sem ele não há lead. */
type ColunaOpcional = "nome" | "email" | "mensagem" | "imovelInteresse";

const COLUNAS: { chave: ColunaOpcional | "telefone"; rotulo: string }[] = [
  { chave: "nome", rotulo: "Nome" },
  { chave: "telefone", rotulo: "Telefone" },
  { chave: "email", rotulo: "E-mail" },
  { chave: "mensagem", rotulo: "Observação" },
  { chave: "imovelInteresse", rotulo: "Imóvel de interesse" },
];

/**
 * As colunas que vão para o CRM, com quantos contatos têm cada uma, e o
 * botão de tirar. Só aparece coluna que veio preenchida: oferecer "tirar a
 * Observação" de uma planilha sem observação é botão para nada.
 *
 * Observação e imóvel de interesse entravam no CRM sem aparecer na revisão;
 * agora aparecem, e dá para tirá-los.
 */
function ColunasDaImportacao({
  linhas,
  fora,
  onChange,
}: {
  linhas: LinhaRevisao[];
  fora: Set<ColunaOpcional>;
  onChange: (f: Set<ColunaOpcional>) => void;
}) {
  const preenchidas = COLUNAS.map((c) => ({
    ...c,
    total: linhas.filter((l) => {
      const valor = l[c.chave];
      return typeof valor === "string" && valor.trim() !== "";
    }).length,
  })).filter((c) => c.chave === "nome" || c.chave === "telefone" || c.total > 0);

  function alternar(chave: ColunaOpcional) {
    const nova = new Set(fora);
    if (nova.has(chave)) nova.delete(chave);
    else nova.add(chave);
    onChange(nova);
  }

  return (
    <div className="cartao p-5">
      <p className="text-fluid-sm text-titulo font-medium">Colunas que vão para o CRM</p>
      <p className="text-fluid-xs text-apoio mt-0.5">Toque numa coluna para tirá-la da importação.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {preenchidas.map((c) => {
          if (c.chave === "telefone") {
            return (
              <span
                key={c.chave}
                className="border-acento-linha bg-acento-lavado text-titulo text-fluid-xs flex min-h-11 items-center rounded-full border px-4"
              >
                Telefone · obrigatório
              </span>
            );
          }
          const chave = c.chave;
          const tirada = fora.has(chave);
          return (
            <button
              key={chave}
              type="button"
              aria-pressed={!tirada}
              onClick={() => alternar(chave)}
              className={cn(
                "text-fluid-xs flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 transition-colors",
                tirada
                  ? "border-linha text-tenue"
                  : "border-acento-linha bg-acento-lavado text-titulo hover:opacity-80",
              )}
            >
              <span className={tirada ? "line-through" : undefined}>
                {tirada ? "Fora:" : "✓"} {c.rotulo}
              </span>
              {c.total > 0 && <span className="text-apoio">· {c.total}</span>}
            </button>
          );
        })}
      </div>
      {fora.has("nome") && (
        <p className="text-fluid-xs text-apoio mt-2">
          Sem a coluna de nome, os contatos entram como &quot;Contato sem nome&quot;.
        </p>
      )}
    </div>
  );
}

function ListaRevisao({
  linhas,
  onChange,
  fora,
}: {
  linhas: LinhaRevisao[];
  onChange: (l: LinhaRevisao[]) => void;
  fora: Set<ColunaOpcional>;
}) {
  const todosMarcados = linhas.length > 0 && linhas.every((l) => l.incluir);

  function alterar(
    indice: number,
    campo: "nome" | "telefone" | "email" | "mensagem" | "imovelInteresse",
    valor: string,
  ) {
    onChange(linhas.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)));
  }

  return (
    <div className="cartao overflow-hidden">
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
              {!fora.has("nome") && (
                <CampoLinha
                  rotulo="Nome"
                  valor={linha.nome}
                  onChange={(v) => alterar(i, "nome", v)}
                />
              )}
              <CampoLinha
                rotulo="Telefone"
                placeholder={linha.telefoneCortado ? "Digite o número" : undefined}
                valor={linha.telefone}
                onChange={(v) => alterar(i, "telefone", v)}
                // Número digitado de qualquer jeito sai escrito certo ao sair do campo.
                onBlur={(v) => alterar(i, "telefone", formatarTelefoneBr(v))}
              />
              {!fora.has("email") && (
                <CampoLinha
                  rotulo="E-mail"
                  valor={linha.email ?? ""}
                  onChange={(v) => alterar(i, "email", v)}
                />
              )}
              {!fora.has("mensagem") && Boolean(linha.mensagem?.trim()) && (
                <CampoLinha
                  rotulo="Observação"
                  valor={linha.mensagem ?? ""}
                  onChange={(v) => alterar(i, "mensagem", v)}
                />
              )}
              {!fora.has("imovelInteresse") && Boolean(linha.imovelInteresse?.trim()) && (
                <CampoLinha
                  rotulo="Imóvel de interesse"
                  valor={linha.imovelInteresse ?? ""}
                  onChange={(v) => alterar(i, "imovelInteresse", v)}
                />
              )}
            </div>

            {/*
              * Campo de telefone vazio, sozinho, é indistinguível de defeito.
              * A etiqueta diz que a falta é do ARQUIVO (contato salvo na
              * agenda não tem o número no export) e que o conserto é digitar.
              */}
            {!linha.telefone ? (
              <span className="text-alerta bg-alerta-lavado border-alerta-linha col-start-2 h-fit w-fit rounded-full border px-2 py-0.5 text-[11px] font-medium sm:col-start-3 sm:mt-2 sm:justify-self-end">
                {/* O número que a planilha cortou ("5,51198E+12") não é falta do
                    cadastro: o aviso no topo explica como trazer o inteiro. */}
                {linha.telefoneCortado ? "número cortado" : "falta o telefone"}
              </span>
            ) : linha.jaExiste ? (
              <span className="text-alerta bg-alerta-lavado border-alerta-linha col-start-2 h-fit w-fit rounded-full border px-2 py-0.5 text-[11px] font-medium sm:col-start-3 sm:mt-2 sm:justify-self-end">
                já existe
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CampoLinha({
  rotulo,
  placeholder,
  valor,
  onChange,
  onBlur,
}: {
  rotulo: string;
  placeholder?: string;
  valor: string;
  onChange: (v: string) => void;
  onBlur?: (v: string) => void;
}) {
  return (
    <label className="min-w-0">
      <span className="sr-only">{rotulo}</span>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
        placeholder={placeholder ?? rotulo}
        className="border-linha bg-campo text-corpo focus:border-acento text-fluid-xs min-h-11 w-full rounded-lg border px-3 outline-none transition-colors"
      />
    </label>
  );
}
