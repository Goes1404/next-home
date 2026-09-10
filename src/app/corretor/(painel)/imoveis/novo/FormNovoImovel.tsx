"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { STATUS_LABEL, TIPO_LABEL, type StatusObra, type TipoImovel } from "@/lib/types";
import { pedidoDeImagemDoCadastro } from "@/lib/imagens/pedidoDoCadastro";
import { RECEITAS } from "@/lib/imagens/receitas";
import { criarImovel } from "./acoes";

/**
 * Receitas que funcionam SEM foto anexada.
 *
 * O imóvel está nascendo agora: não existe foto no catálogo para servir de
 * referência, então "mobiliar ambiente vazio" e "melhorar a luz da foto" não
 * têm em que se apoiar. Oferecer aqui uma receita que sempre falha seria um
 * botão que sempre falha — pior que botão nenhum, pela régua desta casa.
 */
const RECEITAS_SEM_FOTO = RECEITAS.filter((r) => !r.precisaFoto);
const RECEITA_DO_CADASTRO = "fachada";

export interface PreenchimentoInicial {
  nome: string;
  bairro: string;
  cidade: string;
  status: StatusObra;
  candidatoId?: string;
  /** Quando veio da fila: o bairro cru da fonte, para o corretor escolher um. */
  bairrosDaFonte?: string[];
}

const CAMPO =
  "border-linha bg-elevado text-titulo placeholder:text-tenue focus:border-acento-linha w-full rounded-xl border px-4 py-3 text-fluid-sm outline-none transition-colors";

export function FormNovoImovel({ inicial }: { inicial: PreenchimentoInicial }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  /*
   * Em que passo o envio está. O botão precisa dizer isto porque o segundo
   * passo demora 15-40 segundos (é uma geração de imagem), e botão parado
   * nesse tempo parece travado — o corretor clica de novo e paga duas vezes.
   */
  const [passo, setPasso] = useState<"parado" | "criando" | "gerando">("parado");
  /*
   * A geração falhou DEPOIS de o imóvel já existir. Não dá para tratar como
   * erro do formulário: o cadastro está feito e reenviar criaria um segundo
   * imóvel. O que a tela oferece é o caminho adiante — abrir o editor.
   */
  const [imovelCriado, setImovelCriado] = useState<string | null>(null);

  const [nome, setNome] = useState(inicial.nome);
  const [bairro, setBairro] = useState(inicial.bairro);
  const [cidade, setCidade] = useState(inicial.cidade);
  const [construtora, setConstrutora] = useState("");
  const [status, setStatus] = useState<StatusObra>(inicial.status);
  const [tipo, setTipo] = useState<TipoImovel>("apartamento");

  // Bloco opcional da arte de IA.
  const [querImagem, setQuerImagem] = useState(false);
  const [pedidoDeImagem, setPedidoDeImagem] = useState("");
  const [receita, setReceita] = useState(RECEITA_DO_CADASTRO);

  const receitaEscolhida = RECEITAS_SEM_FOTO.find((r) => r.chave === receita) ?? RECEITAS_SEM_FOTO[0];
  /*
   * O texto exato que vai ao modelo, montado pela MESMA função que a rota
   * usa. Mostrar antes de gerar não é enfeite: geração é a única coisa do
   * painel que custa por clique, e o corretor tem direito de ver pelo que
   * está pagando — inclusive que o bairro e o estágio já entram sozinhos.
   */
  const pedidoMontado = querImagem
    ? pedidoDeImagemDoCadastro({ pedido: pedidoDeImagem, nome, bairro, cidade, construtora, status, tipo })
    : "";

  /**
   * Cria o imóvel e, se pedido, a arte — nesta ordem, e nunca ao contrário.
   *
   * O cadastro é o trabalho; a arte é o extra. Se a geração falhar (sem
   * crédito, tempo esgotado, teto do dia), o imóvel JÁ ESTÁ criado e o
   * corretor segue para o editor com um aviso — perder o cadastro por causa
   * de uma imagem seria trocar o essencial pelo acessório.
   *
   * A geração é rota HTTP, não Server Action, porque a espera é longa e a
   * resposta traz bytes: é a mesma razão que `/api/imagens/gerar` já existe.
   */
  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setImovelCriado(null);
    iniciar(async () => {
      setPasso("criando");
      const r = await criarImovel({
        nome,
        bairro,
        cidade,
        construtora,
        status,
        tipo,
        candidatoId: inicial.candidatoId,
      });
      if (!r.ok) {
        setPasso("parado");
        setErro(r.erro);
        return;
      }

      if (!querImagem || !pedidoMontado) {
        router.push(`/corretor/imoveis/${r.slug}`);
        return;
      }

      setPasso("gerando");
      setImovelCriado(r.slug);
      try {
        const resposta = await fetch("/api/imagens/gerar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            modo: "livre",
            // O pedido montado, e não só o que o corretor escreveu: é o que
            // leva bairro, estágio e tipo para dentro da cena.
            prompt: pedidoMontado,
            receita,
            tamanho: receitaEscolhida.tamanhoSugerido,
            qualidade: "low",
            // O vínculo (0101). A rota resolve o slug com a sessão, então a
            // RLS decide se ele pode mesmo apontar para este imóvel.
            imovelSlug: r.slug,
          }),
        });
        const corpo = (await resposta.json().catch(() => null)) as { erro?: string } | null;
        if (!resposta.ok) {
          setPasso("parado");
          setErro(corpo?.erro ?? "A imagem não foi criada. O imóvel já está cadastrado.");
          return;
        }
      } catch {
        setPasso("parado");
        setErro("A imagem não foi criada (a conexão caiu). O imóvel já está cadastrado.");
        return;
      }
      router.push(`/corretor/imoveis/${r.slug}`);
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      {erro && (
        <div
          className="text-fluid-xs border-perigo-linha bg-perigo-lavado text-perigo space-y-2 rounded-xl border px-4 py-3"
          role="status"
        >
          <p>{erro}</p>
          {/* O imóvel existe: reenviar o formulário criaria um segundo. O que
              serve aqui é a porta para frente, não o botão de tentar de novo. */}
          {imovelCriado && (
            <a
              href={`/corretor/imoveis/${imovelCriado}`}
              className="text-titulo inline-flex min-h-11 items-center font-medium underline underline-offset-2"
            >
              Abrir o editor do imóvel →
            </a>
          )}
        </div>
      )}

      <label className="block space-y-1.5">
        <span className="text-fluid-xs text-apoio block">Nome do empreendimento</span>
        <input
          className={CAMPO}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Vista AlphaGran"
          required
          autoFocus
        />
        <span className="text-fluid-xs text-tenue block">
          É por este nome que a assistente reconhece o imóvel na conversa. Apelidos de anúncio
          entram depois, no campo &ldquo;Também conhecido como&rdquo; do editor.
        </span>
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-fluid-xs text-apoio block">Bairro</span>
          <input
            className={CAMPO}
            value={bairro}
            onChange={(e) => setBairro(e.target.value)}
            placeholder="Ex.: Alphaville"
            required
          />
          {(inicial.bairrosDaFonte?.length ?? 0) > 1 && (
            <span className="text-fluid-xs text-tenue block">
              O levantamento trouxe mais de um:{" "}
              {inicial.bairrosDaFonte!.map((b, i) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBairro(b)}
                  className="text-apoio hover:text-titulo underline underline-offset-2"
                >
                  {b}
                  {i < inicial.bairrosDaFonte!.length - 1 ? ", " : ""}
                </button>
              ))}
              . Escolha um — a busca e o mapa usam um bairro só.
            </span>
          )}
        </label>

        <label className="block space-y-1.5">
          <span className="text-fluid-xs text-apoio block">Cidade</span>
          <input
            className={CAMPO}
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            required
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-fluid-xs text-apoio block">Construtora (opcional)</span>
          <input
            className={CAMPO}
            value={construtora}
            onChange={(e) => setConstrutora(e.target.value)}
            placeholder="Ex.: P4 Engenharia"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-fluid-xs text-apoio block">Estágio da obra</span>
          <select
            className={CAMPO}
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusObra)}
          >
            {Object.entries(STATUS_LABEL).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-fluid-xs text-apoio block">Tipo</span>
          <select
            className={CAMPO}
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoImovel)}
          >
            {Object.entries(TIPO_LABEL).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/*
        A arte de IA, aqui e não depois (pedido de 06/09/2026).

        Imóvel recém-cadastrado é justamente o que NÃO tem foto — é o momento
        em que uma peça ilustrativa vale mais. E os dados da cena já estão
        preenchidos na tela: pedir de novo o bairro e o estágio numa segunda
        tela seria o corretor digitar duas vezes o que o sistema já sabe.
      */}
      <div className="border-linha space-y-4 rounded-2xl border p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={querImagem}
            onChange={(e) => setQuerImagem(e.target.checked)}
            className="accent-acento mt-1 size-4 shrink-0 cursor-pointer"
          />
          <span className="min-w-0">
            <span className="text-fluid-sm text-titulo block font-medium">
              Criar uma imagem com IA para este imóvel
            </span>
            <span className="text-fluid-xs text-apoio block">
              Ela fica ligada a este imóvel, para você usar em post e anúncio.{" "}
              <strong className="text-corpo">Não vai para o site</strong> e a assistente não manda
              para cliente — imagem de IA não é foto do imóvel.
            </span>
          </span>
        </label>

        {querImagem && (
          <div className="space-y-4 pl-7">
            <label className="block space-y-1.5">
              <span className="text-fluid-xs text-apoio block">Que tipo de imagem</span>
              <select
                className={CAMPO}
                value={receita}
                onChange={(e) => setReceita(e.target.value)}
              >
                {RECEITAS_SEM_FOTO.map((r) => (
                  <option key={r.chave} value={r.chave}>
                    {r.rotulo}
                  </option>
                ))}
              </select>
              <span className="text-fluid-xs text-tenue block">{receitaEscolhida.ajuda}</span>
            </label>

            <label className="block space-y-1.5">
              <span className="text-fluid-xs text-apoio block">O que você quer na imagem</span>
              <textarea
                className={`${CAMPO} min-h-24 resize-y`}
                value={pedidoDeImagem}
                onChange={(e) => setPedidoDeImagem(e.target.value)}
                placeholder={receitaEscolhida.exemplo}
              />
              <span className="text-fluid-xs text-tenue block">
                Escreva com suas palavras. O nome, o bairro, a cidade e o estágio da obra que você
                preencheu acima entram sozinhos — não precisa repetir.
              </span>
            </label>

            {pedidoMontado && (
              /* O texto exato que vai ao modelo. Geração é a única coisa do
                 painel que custa por clique: quem paga tem direito de ver o
                 que está comprando antes de clicar. */
              <details className="border-linha rounded-xl border px-3 py-2">
                <summary className="text-fluid-xs text-apoio cursor-pointer">
                  Ver o pedido completo que vai para a IA
                </summary>
                <p className="text-fluid-xs text-tenue mt-2 break-words">{pedidoMontado}</p>
              </details>
            )}
          </div>
        )}
      </div>

      <div className="border-linha flex flex-wrap items-center gap-3 border-t pt-5">
        <button
          type="submit"
          disabled={pendente}
          className="border-acento-linha text-titulo hover:bg-elevado text-fluid-sm min-h-12 rounded-xl border px-6 font-medium transition-colors disabled:opacity-60"
        >
          {passo === "criando"
            ? "Criando o imóvel…"
            : passo === "gerando"
              ? "Gerando a imagem… (até 40s)"
              : querImagem
                ? "Criar imóvel e imagem"
                : "Criar e abrir o editor"}
        </button>
        <p className="text-fluid-xs text-apoio">
          O imóvel nasce <strong className="text-corpo">despublicado</strong>. Ele só aparece no site
          quando você publicar, no editor.
        </p>
      </div>
    </form>
  );
}
