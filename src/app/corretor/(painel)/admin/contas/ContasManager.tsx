"use client";

import { useRef, useState, useTransition } from "react";
import type { CorretorAdmin } from "@/lib/corretorSessao";
import { Check, Copy, Download, EyeOff, KeyRound, Mail, ShieldCheck, TriangleAlert, UserPlus } from "lucide-react";
import {
  acoesDeAcesso,
  MENSAGEM_ENDERECO_PROVISORIO,
  motivoSemAcaoDeAcesso,
  usaEnderecoProvisorio,
} from "@/lib/corretores/acessoDaConta";
import {
  alterarPapelCorretor,
  cadastrarCorretor,
  alternarAtivoCorretor,
  alternarContaOculta,
  alternarSoWhatsapp,
  criarAcessoCorretor,
  resumoDaSaida,
  enviarLinkDeSenha,
  reenviarConvite,
  trocarEmailDoCorretor,
} from "../acoes";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { copiarTexto } from "@/lib/ui/copiarTexto";
import { precisaDoPainelDeSaida, type DivisaoDaCarteira } from "@/lib/corretores/saidaDoCorretor";
import { SaidaDoCorretor } from "./SaidaDoCorretor";

/**
 * Falha ao chamar a action. Aba aberta durante um deploy chama a action de
 * outro build, e o erro não é de conexão: tentar de novo não resolve, só
 * recarregar. A frase de conexão fica para o resto, sem afirmar a causa.
 */
function fraseDaFalha(e: unknown, oQueJaFoiFeito?: string): string {
  if (ehActionDeOutroBuild(e)) return avisoDePaginaVelha(oQueJaFoiFeito);
  return "Não deu para falar com o servidor. Atualize a página e confira a lista antes de tentar de novo.";
}

/**
 * Contas de acesso da equipe.
 *
 * A tela existe porque, até aqui, criar login era trabalho manual no Supabase
 * — e o resultado prático era que 7 dos 8 corretores cadastrados recebiam
 * lead sem conseguir entrar no sistema.
 *
 * Desde a fase 2A o gestor não vê nem repassa senha: convida pelo e-mail
 * real do corretor, que cria a própria senha pelo link. Sem e-mail
 * configurado no servidor, o link aparece aqui para o gestor mandar pelo
 * WhatsApp.
 */

/** O link que acabou de sair (ou que o gestor precisa mandar à mão). */
type Entrega = {
  nome: string;
  email: string;
  tipo: "convite" | "senha";
  enviado: boolean;
  url?: string;
};

function CartaoDoLink({ entrega, aoFechar }: { entrega: Entrega; aoFechar: () => void }) {
  // "Copiado!" só quando o navegador aceitou; recusado, o link fica
  // selecionado na tela para copiar à mão (Ctrl+C, ou segurar o dedo no
  // celular). Mesmo comportamento do convite da plataforma.
  const [copia, setCopia] = useState<"nada" | "copiado" | "falhou">("nada");
  const linkRef = useRef<HTMLParagraphElement>(null);
  const oQue = entrega.tipo === "convite" ? "Convite" : "Link de senha";

  const copiar = async () => {
    if (await copiarTexto(entrega.url!)) {
      setCopia("copiado");
      setTimeout(() => setCopia("nada"), 2500);
      return;
    }
    setCopia("falhou");
    const no = linkRef.current;
    const selecao = typeof window !== "undefined" ? window.getSelection() : null;
    if (no && selecao) {
      const faixa = document.createRange();
      faixa.selectNodeContents(no);
      selecao.removeAllRanges();
      selecao.addRange(faixa);
    }
  };

  return (
    <div
      role="status"
      className="border-ok-linha bg-ok-lavado mb-6 rounded-2xl border p-5"
    >
      {entrega.enviado || !entrega.url ? (
        <h3 className="text-fluid-sm flex items-center gap-2 font-bold text-titulo">
          <Check className="h-4 w-4 text-ok" /> {oQue} enviado para {entrega.email}
        </h3>
      ) : (
        <>
          <h3 className="text-fluid-sm flex items-center gap-2 font-bold text-titulo">
            <Check className="h-4 w-4 text-ok" /> {oQue} de {entrega.nome} pronto
          </h3>
          <p className="text-fluid-xs mt-1 text-corpo">
            Para {entrega.email}: o e-mail não está configurado; mande este link ao corretor pelo
            WhatsApp. Ele vale por 24 horas.
          </p>
          <p
            ref={linkRef}
            className="text-fluid-xs bg-superficie border-linha text-corpo mt-3 rounded-xl border p-3 break-all select-all"
          >
            {entrega.url}
          </p>
          {copia === "falhou" && (
            <p role="alert" className="text-fluid-xs text-corpo mt-2">
              Não deu para copiar sozinho: o link acima está selecionado. Copie com Ctrl+C, ou segure o dedo sobre ele
              no celular.
            </p>
          )}
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!entrega.enviado && entrega.url && (
          <button
            type="button"
            onClick={copiar}
            className="text-fluid-xs bg-acento hover:bg-acento-hover flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-4 font-medium text-sobre-cor"
          >
            <Copy className="h-4 w-4" /> {copia === "copiado" ? "Copiado!" : "Copiar link"}
          </button>
        )}
        <button
          type="button"
          onClick={aoFechar}
          className="text-fluid-xs border-linha-forte text-corpo flex min-h-11 cursor-pointer items-center rounded-lg border px-4"
        >
          {entrega.enviado ? "Fechar" : "Já enviei, fechar"}
        </button>
      </div>
    </div>
  );
}

/** Campo de e-mail com confirmar e cancelar: convidar e trocar e-mail usam o mesmo. */
function CampoDeEmail({
  inicial,
  rotulo,
  pendente,
  aoConfirmar,
  aoCancelar,
}: {
  inicial: string;
  rotulo: string;
  pendente: boolean;
  aoConfirmar: (email: string) => void;
  aoCancelar: () => void;
}) {
  const [email, setEmail] = useState(inicial);
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email@docorretor.com"
        aria-label="E-mail do corretor"
        className="text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-w-0 flex-1 rounded-xl border px-3.5 py-2.5 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => aoConfirmar(email)}
        disabled={pendente}
        className="text-fluid-xs bg-acento hover:bg-acento-hover flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg px-4 font-bold text-sobre-cor disabled:opacity-60"
      >
        {pendente ? "Enviando…" : rotulo}
      </button>
      <button
        type="button"
        onClick={aoCancelar}
        className="text-fluid-xs border-linha-forte text-corpo flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg border px-4"
      >
        Cancelar
      </button>
    </div>
  );
}

function LinhaCorretor({
  corretor,
  souEu,
  equipe,
  aoEntregar,
  aoAvisar,
}: {
  corretor: CorretorAdmin;
  souEu: boolean;
  /** Quem pode receber os leads na saída dele: ativo, visível, outro. */
  equipe: { id: string; nome: string }[];
  aoEntregar: (e: Entrega) => void;
  aoAvisar: (msg: string, erro: boolean) => void;
}) {
  const [editando, setEditando] = useState<null | "convidar" | "trocar_email">(null);
  const [saida, setSaida] = useState<DivisaoDaCarteira | null>(null);
  const [pendente, iniciar] = useTransition();
  // Outro gestor não recebe link nem troca de e-mail pela mão de ninguém
  // (as actions recusam de novo, conferindo o Auth).
  const conta = { ...corretor, outroGestor: corretor.papel === "gestor" && !souEu };
  const acoes = acoesDeAcesso(conta);
  const provisorio = usaEnderecoProvisorio(corretor);
  const semAcao = motivoSemAcaoDeAcesso(conta);

  /** Roda uma das actions de link e mostra o desfecho. */
  const comLink = (
    tipo: Entrega["tipo"],
    email: string,
    acao: () => Promise<{ ok: true; enviado: boolean; url?: string } | { ok: false; erro: string }>,
  ) =>
    iniciar(async () => {
      try {
        const r = await acao();
        if (!r.ok) return aoAvisar(r.erro, true);
        setEditando(null);
        aoEntregar({ nome: corretor.nome, email: email.trim().toLowerCase(), tipo, enviado: r.enviado, url: r.url });
      } catch (e) {
        aoAvisar(fraseDaFalha(e), true);
      }
    });

  const trocarPapel = () =>
    iniciar(async () => {
      const novo = corretor.papel === "gestor" ? "corretor" : "gestor";
      const r = await alterarPapelCorretor(corretor.id, novo);
      aoAvisar(r.erro ?? r.ok ?? "", Boolean(r.erro));
    });

  const trocarSoWhatsapp = () => {
    const ligar = !corretor.soWhatsapp;
    const aviso = ligar
      ? `Tornar ${corretor.nome} uma conta só WhatsApp?\n\nTodas as conversas do número dela passam a aparecer no painel, inclusive de quem não é lead (essas pessoas não viram lead). O texto de todas é guardado, inclusive o das conversas pessoais. A IA fica desligada, e a conta sai do sorteio do link do anúncio. Conversas anteriores não aparecem: só as que chegarem daqui para frente.`
      : `Voltar ${corretor.nome} a ser conta comum?\n\nAs conversas de quem não é lead ficam escondidas, e a IA continua desligada até alguém ligar na tela da IA.`;
    if (!confirm(aviso)) return;
    iniciar(async () => {
      const r = await alternarSoWhatsapp(corretor.id, ligar);
      aoAvisar(r.erro ?? r.ok ?? "", Boolean(r.erro));
    });
  };

  const trocarOculta = () => {
    const ocultar = !corretor.oculta;
    const aviso = ocultar
      ? `Ocultar ${corretor.nome}?\n\nA conta continua funcionando, mas some para todo mundo: do site, da roleta de leads, do sorteio do anúncio e das telas da equipe (ranking, desempenho, leads, WhatsApp da equipe, seletores). Só administradores a veem, aqui em "Contas ocultas".`
      : `Mostrar ${corretor.nome} de novo?\n\nA conta volta ao site, à roleta e às telas da equipe.`;
    if (!confirm(aviso)) return;
    iniciar(async () => {
      try {
        const r = await alternarContaOculta(corretor.id, ocultar);
        aoAvisar(r.erro ?? r.ok ?? "", Boolean(r.erro));
      } catch (e) {
        aoAvisar(fraseDaFalha(e), true);
      }
    });
  };

  const trocarAtivo = () => {
    /*
     * Desativar é a ação mais séria da tela e era a única SEM confirmação.
     * E o aviso diz o que o botão não faz: os leads NÃO mudam de mão
     * sozinhos — sem redistribuir, viram um bolo que ninguém atende, e o
     * dono some da tabela de carga.
     *
     * Com leads, a saída abre o painel que divide a carteira (fase 5,
     * 0200): o que veio da imobiliária é redistribuído ali mesmo, e o que
     * ele trouxe vira a planilha das fichas que ele leva. A contagem é a da
     * saída, que inclui os ARQUIVADOS: a da lista não os vê, e quem só tem
     * arquivados sairia sem a divisão.
     */
    if (corretor.ativo) {
      iniciar(async () => {
        try {
          const r = await resumoDaSaida(corretor.id);
          if (r.erro !== undefined) return aoAvisar(r.erro, true);
          const divisao = { doCorretor: r.doCorretor, daImobiliaria: r.daImobiliaria };
          if (precisaDoPainelDeSaida(divisao)) return setSaida(divisao);
          if (!confirm(`Desativar ${corretor.nome}?\n\nEle sai da roleta e não recebe mais leads.`)) return;
          const d = await alternarAtivoCorretor(corretor.id, false);
          aoAvisar(d.erro ?? d.ok ?? "", Boolean(d.erro));
        } catch (e) {
          aoAvisar(fraseDaFalha(e), true);
        }
      });
      return;
    }

    iniciar(async () => {
      try {
        const r = await alternarAtivoCorretor(corretor.id, true);
        aoAvisar(r.erro ?? r.ok ?? "", Boolean(r.erro));
      } catch (e) {
        aoAvisar(fraseDaFalha(e), true);
      }
    });
  };

  /**
   * Quem já saiu (inclusive antes da fase 5) ainda tem a carteira: o gestor
   * baixa as fichas para entregar a ele e passa os leads da imobiliária que
   * ficaram, sem precisar reativar a conta.
   */
  const abrirSaida = () =>
    iniciar(async () => {
      try {
        const r = await resumoDaSaida(corretor.id);
        if (r.erro !== undefined) return aoAvisar(r.erro, true);
        const divisao = { doCorretor: r.doCorretor, daImobiliaria: r.daImobiliaria };
        if (!precisaDoPainelDeSaida(divisao)) return aoAvisar(`${corretor.nome} não tem leads na carteira.`, false);
        setSaida(divisao);
      } catch (e) {
        aoAvisar(fraseDaFalha(e), true);
      }
    });

  const BOTAO =
    "text-fluid-xs border-linha-forte text-corpo hover:bg-vidro flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 disabled:opacity-60";

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
            {corretor.soWhatsapp && (
              <span className="text-fluid-xs border-ok-linha bg-ok-lavado text-ok inline-flex items-center rounded-full border px-2 py-0.5 font-medium">
                Só WhatsApp
              </span>
            )}
            {corretor.oculta && (
              <span className="text-fluid-xs border-linha-forte text-apoio inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium">
                <EyeOff className="h-3 w-3" /> Oculta
              </span>
            )}
            {souEu && <span className="text-fluid-xs text-tenue">(você)</span>}
          </p>
          <p className="text-fluid-xs text-apoio mt-0.5 break-all">
            {corretor.email ?? "sem e-mail"} · {corretor.leads} lead
            {corretor.leads === 1 ? "" : "s"}
            {!corretor.ativo && " · desativado"}
            {corretor.emPausa && " · em pausa"}
          </p>
        </div>

        <span
          className={`text-fluid-xs h-fit rounded-full border px-2.5 py-1 font-medium ${
            corretor.temLogin && !corretor.convitePendente
              ? "border-ok-linha bg-ok-lavado text-ok"
              : "border-alerta-linha bg-alerta-lavado text-alerta"
          }`}
        >
          {!corretor.temLogin ? "Sem acesso" : corretor.convitePendente ? "Convite não aceito" : "Tem acesso"}
        </span>
      </div>

      {(semAcao || (provisorio && acoes.includes("trocar_email"))) && (
        <p className="text-fluid-xs border-alerta-linha bg-alerta-lavado text-corpo mt-3 flex items-start gap-2 rounded-xl border px-3 py-2">
          <TriangleAlert className="text-alerta mt-0.5 h-4 w-4 shrink-0" />
          {semAcao ?? MENSAGEM_ENDERECO_PROVISORIO}
        </p>
      )}

      {editando === "convidar" && (
        <CampoDeEmail
          inicial={corretor.email ?? ""}
          rotulo="Enviar convite"
          pendente={pendente}
          aoCancelar={() => setEditando(null)}
          aoConfirmar={(email) => comLink("convite", email, () => criarAcessoCorretor(corretor.id, email))}
        />
      )}

      {editando === "trocar_email" && (
        <CampoDeEmail
          inicial={provisorio ? "" : (corretor.email ?? "")}
          rotulo="Trocar e mandar link"
          pendente={pendente}
          aoCancelar={() => setEditando(null)}
          aoConfirmar={(email) => comLink("senha", email, () => trocarEmailDoCorretor(corretor.id, email))}
        />
      )}

      {editando === null && (
        <div className="mt-3 flex flex-wrap gap-2">
          {acoes.includes("convidar") && (
            <button
              type="button"
              onClick={() => setEditando("convidar")}
              className="text-fluid-xs bg-acento hover:bg-acento-hover flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-4 font-medium text-sobre-cor"
            >
              <UserPlus className="h-4 w-4" /> Convidar
            </button>
          )}
          {acoes.includes("reenviar_convite") && (
            <button
              type="button"
              disabled={pendente}
              onClick={() => comLink("convite", corretor.email ?? "", () => reenviarConvite(corretor.id))}
              className={BOTAO}
            >
              <Mail className="h-3.5 w-3.5" /> Reenviar convite
            </button>
          )}
          {acoes.includes("link_de_senha") && (
            <button
              type="button"
              disabled={pendente}
              onClick={() => comLink("senha", corretor.email ?? "", () => enviarLinkDeSenha(corretor.id))}
              className={BOTAO}
            >
              <KeyRound className="h-3.5 w-3.5" /> Mandar link de senha
            </button>
          )}
          {acoes.includes("trocar_email") && (
            <button type="button" disabled={pendente} onClick={() => setEditando("trocar_email")} className={BOTAO}>
              Trocar e-mail
            </button>
          )}
          {corretor.temLogin && (
            <>
              <button
                type="button"
                onClick={trocarPapel}
                disabled={pendente || souEu}
                title={souEu ? "Peça a outro gestor para mudar o seu papel." : undefined}
                className="text-fluid-xs border-linha-forte text-corpo hover:bg-vidro flex min-h-11 cursor-pointer items-center rounded-lg border px-3 disabled:opacity-40"
              >
                {corretor.papel === "gestor" ? "Tirar administração" : "Tornar administrador"}
              </button>
              <button type="button" onClick={trocarSoWhatsapp} disabled={pendente} className={BOTAO}>
                {corretor.soWhatsapp ? "Voltar a conta comum" : "Tornar só WhatsApp"}
              </button>
              <button
                type="button"
                onClick={trocarAtivo}
                disabled={pendente}
                className="text-fluid-xs border-linha-forte text-apoio hover:text-perigo hover:border-perigo-linha flex min-h-11 cursor-pointer items-center rounded-lg border px-3 disabled:opacity-60"
              >
                {corretor.ativo ? "Desativar" : "Reativar"}
              </button>
            </>
          )}
        </div>
      )}

      {saida && (
        <SaidaDoCorretor
          corretor={{ id: corretor.id, nome: corretor.nome }}
          divisao={saida}
          equipe={equipe}
          jaDesativado={!corretor.ativo}
          aoFechar={() => setSaida(null)}
          aoAvisar={aoAvisar}
        />
      )}

      {/*
        Ocultar não depende de login: a conta pode ser escondida antes mesmo
        de ganhar acesso. E a conta oculta precisa do "Desativar/Reativar"
        mesmo sem login — é para isso que a seção existe.
      */}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={trocarOculta}
          disabled={pendente || souEu}
          title={souEu ? "Peça a outro administrador para ocultar a sua conta." : undefined}
          className="text-fluid-xs border-linha-forte text-corpo hover:bg-vidro flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 disabled:opacity-40"
        >
          <EyeOff className="h-3.5 w-3.5" /> {corretor.oculta ? "Mostrar de novo" : "Ocultar conta"}
        </button>
        {!corretor.ativo && !saida && (
          <button type="button" onClick={abrirSaida} disabled={pendente} className={BOTAO}>
            <Download className="h-3.5 w-3.5" /> Fichas e leads de quem saiu
          </button>
        )}
        {!corretor.temLogin && corretor.oculta && (
          <button
            type="button"
            onClick={trocarAtivo}
            disabled={pendente}
            className="text-fluid-xs border-linha-forte text-apoio hover:text-perigo hover:border-perigo-linha flex min-h-11 cursor-pointer items-center rounded-lg border px-3 disabled:opacity-60"
          >
            {corretor.ativo ? "Desativar" : "Reativar"}
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Cadastro de corretor novo: ficha e convite de uma vez. Até 07/10/2026 a
 * ficha só nascia por SQL e esta tela só criava acesso para quem já tinha.
 */
function NovoCorretor({ aoEntregar }: { aoEntregar: (e: Entrega) => void }) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState({ nome: "", creci: "", whatsapp: "", email: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const campo = (k: keyof typeof dados, rotulo: string, tipo: string, dica: string) => (
    <label className="text-fluid-xs text-apoio flex flex-col gap-1">
      {rotulo}
      <input
        type={tipo}
        value={dados[k]}
        onChange={(e) => setDados((d) => ({ ...d, [k]: e.target.value }))}
        placeholder={dica}
        className="text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-w-0 rounded-xl border px-3.5 py-2.5 focus:outline-none"
      />
    </label>
  );

  const salvar = () =>
    iniciar(async () => {
      setErro(null);
      try {
        const r = await cadastrarCorretor(dados);
        if (!r.ok) return setErro(r.erro);
        aoEntregar({
          nome: dados.nome.trim(),
          email: dados.email.trim().toLowerCase(),
          tipo: "convite",
          enviado: r.enviado,
          url: r.url,
        });
        setDados({ nome: "", creci: "", whatsapp: "", email: "" });
        setAberto(false);
      } catch (e) {
        // O cadastro pode ter gravado antes da falha: a lista diz se ele entrou.
        setErro(fraseDaFalha(e, "Confira na lista se o corretor já entrou antes de cadastrar de novo."));
      }
    });

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-fluid-xs bg-acento hover:bg-acento-hover mb-5 flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-4 font-medium text-sobre-cor"
      >
        <UserPlus className="h-4 w-4" /> Cadastrar corretor
      </button>
    );
  }

  return (
    <div className="cartao mb-5 space-y-3 p-5">
      <h3 className="text-fluid-sm font-bold text-titulo">Novo corretor</h3>
      <p className="text-fluid-xs text-corpo">
        Ele aparece na página da equipe do site e passa a receber leads da roleta. O convite vai para o
        e-mail dele, e ele mesmo cria a senha pelo link.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {campo("nome", "Nome", "text", "Nome e sobrenome")}
        {campo("creci", "CRECI", "text", "Número do CRECI")}
        {campo("whatsapp", "WhatsApp", "tel", "(11) 98765-4321")}
        {campo("email", "E-mail do corretor", "email", "email@docorretor.com")}
      </div>
      {erro && (
        <p className="text-fluid-xs border-perigo-linha bg-perigo-lavado text-perigo rounded-xl border px-3 py-2">{erro}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={salvar}
          disabled={pendente}
          className="text-fluid-xs bg-acento hover:bg-acento-hover flex min-h-11 cursor-pointer items-center rounded-lg px-4 font-bold text-sobre-cor disabled:opacity-60"
        >
          {pendente ? "Cadastrando…" : "Cadastrar e convidar"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="text-fluid-xs border-linha-forte text-corpo flex min-h-11 cursor-pointer items-center rounded-lg border px-4"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function ContasManager({
  corretores,
  meuId,
}: {
  corretores: CorretorAdmin[];
  meuId: string;
}) {
  const [entrega, setEntrega] = useState<Entrega | null>(null);
  const [aviso, setAviso] = useState<{ msg: string; erro: boolean } | null>(null);

  /*
   * Só quem está ATIVO conta como pendência: quem está desativado não tem
   * acesso ao painel porque não deve ter. Não há mais lote: cada convite
   * leva o e-mail real da pessoa, que só o gestor sabe.
   */
  const semAcesso = corretores.filter((c) => c.ativo && !c.temLogin).length;
  const visiveis = corretores.filter((c) => !c.oculta);
  const ocultas = corretores.filter((c) => c.oculta);
  // Quem pode receber os leads de quem sai (fase 5): ativo e visível.
  const destinos = corretores.filter((c) => c.ativo && !c.oculta).map((c) => ({ id: c.id, nome: c.nome }));
  const equipeSem = (id: string) => destinos.filter((d) => d.id !== id);

  const entregar = (e: Entrega) => {
    setEntrega(e);
    setAviso(null);
  };

  return (
    <div>
      {entrega && <CartaoDoLink entrega={entrega} aoFechar={() => setEntrega(null)} />}

      {aviso && aviso.msg && (
        <p
          role={aviso.erro ? "alert" : "status"}
          className={`text-fluid-xs mb-4 rounded-xl border px-4 py-3 ${
            aviso.erro
              ? "border-perigo-linha bg-perigo-lavado text-perigo"
              : "border-ok-linha bg-ok-lavado text-ok"
          }`}
        >
          {aviso.msg}
        </p>
      )}

      <NovoCorretor aoEntregar={entregar} />

      {semAcesso > 0 && (
        <div className="border-alerta-linha bg-alerta-lavado mb-5 flex items-start gap-2 rounded-2xl border p-4">
          <TriangleAlert className="text-alerta mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-fluid-xs text-corpo">
            <strong className="text-titulo">
              {semAcesso} pessoa{semAcesso === 1 ? "" : "s"} sem acesso ao painel.
            </strong>{" "}
            Elas aparecem no site e podem receber leads, mas não conseguem entrar para atender. Use
            &quot;Convidar&quot; na linha de cada uma, com o e-mail dela.
          </p>
        </div>
      )}

      <ul className="cartao px-5">
        {visiveis.map((c) => (
          <LinhaCorretor
            key={c.id}
            corretor={c}
            souEu={c.id === meuId}
            equipe={equipeSem(c.id)}
            aoEntregar={entregar}
            aoAvisar={(msg, erro) => setAviso({ msg, erro })}
          />
        ))}
      </ul>

      {/*
        Contas ocultas (0189): fora de toda tela da equipe, e é AQUI — só
        aqui, e só para quem administra — que elas aparecem, recolhidas,
        para alguém conseguir desativar, reativar ou mostrar de novo. A
        seção só existe quando há alguma: porta para sala vazia é ruído.
      */}
      {ocultas.length > 0 && (
        <details className="cartao mt-5 px-5 py-1">
          <summary className="text-fluid-sm text-titulo flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
            <EyeOff className="h-4 w-4" /> Contas ocultas ({ocultas.length})
          </summary>
          <p className="text-fluid-xs text-apoio pb-2">
            Não aparecem no site, na roleta, no sorteio do anúncio nem nas telas da equipe. Só administradores
            as veem, aqui.
          </p>
          <ul>
            {ocultas.map((c) => (
              <LinhaCorretor
                key={c.id}
                corretor={c}
                souEu={c.id === meuId}
                equipe={equipeSem(c.id)}
                aoEntregar={entregar}
                aoAvisar={(msg, erro) => setAviso({ msg, erro })}
              />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
