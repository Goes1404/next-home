"use client";

import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { ChatBase } from "@/app/corretor/(painel)/_componentes/ChatBase";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { QUALIDADES, TAMANHOS, type EstadoDoTeto, type ImagemGerada } from "@/lib/imagens/imagensTipos";
import { PISO_DE_PROMPT, SECOES } from "@/lib/imagens/gramatica";
import type {
  ConversaDoEstudio,
  MensagemDoEstudio,
  PerguntaDoEstudio,
  PropostaDeArte,
} from "@/lib/estudio/contrato";
import {
  abrirConversa,
  enviarMensagemDoEstudio,
  excluirConversaDoEstudio,
  registrarArteGerada,
  type EstadoDoChat,
} from "@/app/corretor/(painel)/estudio/acoes";
import { enviarFotoDeReferencia } from "@/app/corretor/(painel)/estudio/uploadReferencia";
import { supabaseUrl } from "@/lib/supabase/env";
import { ListaDeConversas } from "@/app/corretor/(painel)/_componentes/ListaDeConversas";

/**
 * Criar arte, em forma de chat.
 *
 * O corretor escreve o que quer; a IA da casa pergunta o que falta (um chip
 * por vez), propõe o pedido melhorado com a explicação em português, e SÓ gera
 * quando ele toca em "Gerar assim". Ver e corrigir antes de gastar — a regra
 * que a tela antiga já seguia, agora como conversa.
 *
 * ## Quem gasta
 *
 * `POST /api/imagens/gerar`, chamada daqui com a sessão do corretor — a mesma
 * rota da tela antiga. É ela que confere o teto diário, aplica a cláusula
 * anti-invenção e compõe a peça. O chat só grava o vínculo depois
 * (`registrarArteGerada`). Nenhuma outra chamada paga sai desta tela.
 */

/**
 * Os pedidos que abrem a conversa quando ela está vazia.
 *
 * Não são "ideias": são pedidos completos, com imóvel e canal, porque é isso
 * que a IA precisa para não perguntar três vezes antes de propor. Tocar num
 * deles manda a mensagem — a pessoa aprende o formato vendo a resposta.
 */
const SUGESTOES = [
  "Fachada ao pôr do sol para o feed",
  "Story de lançamento, público família",
  "Ambiente decorado do zero: sala integrada",
  "Fundo para post com espaço para texto",
] as const;

export function ChatDeArte({
  corretorId,
  conversasIniciais,
  tetoInicial,
  galeriaInicial,
}: {
  corretorId: string;
  conversasIniciais: ConversaDoEstudio[];
  tetoInicial: EstadoDoTeto;
  galeriaInicial: ImagemGerada[];
}) {
  const { avisar, falhar } = useAvisos();
  const [conversas, setConversas] = useState(conversasIniciais);
  const [estado, setEstado] = useState<EstadoDoChat | null>(null);
  const [pendente, setPendente] = useState<{ id: string; conteudo: string; previewUrl?: string | null } | null>(null);
  const [pensando, setPensando] = useState(false);
  const [gerando, setGerando] = useState<string | null>(null);
  const [teto, setTeto] = useState(tetoInicial);
  const [galeria, setGaleria] = useState(galeriaInicial);
  /*
   * O prompt que o corretor mandou de volta ao composer pelo histórico.
   *
   * Reaproveitar NÃO gera e nem envia sozinho: o texto cai no campo, ele lê,
   * ajusta ("igual, mas de noite") e manda. Um botão que gerasse direto seria
   * a única porta do sistema que pula a revisão — e a revisão é o produto.
   */
  const [reaproveitado, setReaproveitado] = useState("");
  const [anexo, setAnexo] = useState<{ file: File; previewUrl: string } | null>(null);
  const [, iniciar] = useTransition();

  const restam = Math.max(0, teto.teto - teto.usadasHoje);

  const aplicar = (r: EstadoDoChat | { erro: string }) => {
    if ("erro" in r) {
      falhar(r.erro);
      return false;
    }
    setEstado(r);
    setConversas((lista) => {
      const semEla = lista.filter((c) => c.id !== r.conversa.id);
      return [r.conversa, ...semEla];
    });
    return true;
  };

  const enviar = async (texto: string, escolha?: { perguntaId: string; pergunta: string }) => {
    const fotoDaVez = escolha ? null : anexo;
    setPendente({
      id: `temp-${Date.now()}`,
      conteudo: texto || "📎 Foto de referência",
      previewUrl: fotoDaVez?.previewUrl ?? null,
    });
    setPensando(true);
    try {
      // A foto sobe ANTES da mensagem: se o upload falhar, nada é gravado e o
      // corretor tenta de novo — mensagem apontando para foto que não subiu
      // seria referência quebrada gravada para sempre.
      let referencia: { path: string; url: string } | null = null;
      if (fotoDaVez) {
        const up = await enviarFotoDeReferencia(corretorId, fotoDaVez.file);
        if ("erro" in up) {
          falhar(up.erro);
          throw new Error(up.erro);
        }
        referencia = up;
      }

      const r = await enviarMensagemDoEstudio({
        tipo: "arte",
        conversaId: estado?.conversa.id ?? null,
        texto,
        escolha: escolha ?? null,
        referencia,
      });
      if (!aplicar(r)) throw new Error(r && "erro" in r ? r.erro : "falhou");
      if (fotoDaVez) {
        URL.revokeObjectURL(fotoDaVez.previewUrl);
        setAnexo(null);
      }
    } catch (e) {
      if (!(e instanceof Error && e.message)) falhar("Sem conexão. Tente de novo.");
      throw e;
    } finally {
      setPendente(null);
      setPensando(false);
    }
  };

  const escolher = (pergunta: PerguntaDoEstudio, escolha: string) =>
    enviar(escolha, { perguntaId: pergunta.id, pergunta: pergunta.texto });

  /**
   * "Gerar assim": a única chamada paga. A rota responde 429 com o teto quando
   * o dia acabou — o contador da tela se atualiza com o que ela devolver.
   */
  const gerar = async (m: MensagemDoEstudio, promptEditado: string, midiaId: string | null) => {
    const p = m.dados as PropostaDeArte;
    if (!estado || gerando) return;
    if (restam <= 0) {
      falhar("Limite de hoje atingido. Volta amanhã — ou apaga uma imagem antiga.");
      return;
    }
    setGerando(m.id);
    try {
      const resp = await fetch("/api/imagens/gerar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          modo: "livre",
          // O texto do CAMPO, não o da proposta: se o corretor editou, foi a
          // versão dele que ele aprovou — e é ela que tem de gerar a imagem.
          prompt: promptEditado,
          receita: p.receita,
          tamanho: p.tamanho,
          qualidade: p.qualidade,
          // A foto anexada na conversa: a rota confina à pasta do corretor.
          referenciaPath: midiaId ? undefined : (p.referenciaPath ?? undefined),
          // A foto DO IMÓVEL escolhida na faixa. Vai como id, nunca como URL:
          // quem decide o acesso é a RLS sobre `midias`, e mandar URL faria o
          // servidor baixar um endereço escolhido pelo cliente.
          midiaId: midiaId ?? undefined,
        }),
      });
      const corpo = (await resp.json().catch(() => null)) as
        | { ok: true; imagem: ImagemGerada; teto: EstadoDoTeto }
        | { erro?: string; teto?: EstadoDoTeto }
        | null;

      if (!resp.ok || !corpo || !("ok" in corpo)) {
        if (corpo?.teto) setTeto(corpo.teto);
        falhar((corpo && "erro" in corpo && corpo.erro) || "Não deu para gerar agora. Tente de novo.");
        return;
      }

      setTeto(corpo.teto);
      setGaleria((g) => [corpo.imagem, ...g]);
      const r = await registrarArteGerada({
        conversaId: estado.conversa.id,
        imagemId: corpo.imagem.id,
        url: corpo.imagem.arteUrl ?? corpo.imagem.url,
      });
      aplicar(r);
      avisar("Imagem pronta.");
    } catch {
      falhar("Sem conexão. A imagem pode ter sido gerada — confira a galeria.");
    } finally {
      setGerando(null);
    }
  };

  const abrir = (id: string) => iniciar(async () => void aplicar(await abrirConversa(id)));
  const nova = () => setEstado(null);
  const excluir = async (id: string) => {
    const r = await excluirConversaDoEstudio(id);
    if (r.erro) return falhar(r.erro);
    setConversas((l) => l.filter((c) => c.id !== id));
    if (estado?.conversa.id === id) setEstado(null);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <ListaDeConversas
          conversas={conversas}
          ativa={estado?.conversa.id ?? null}
          onAbrir={abrir}
          onNova={nova}
          onExcluir={excluir}
        />

        <div className="space-y-2">
          <ChatBase
            mensagens={estado?.mensagens ?? []}
            pendente={pendente}
            pensando={pensando}
            placeholder='Ex.: "fachada do Eternity ao pôr do sol, para o feed"'
            textoInicial={reaproveitado}
            /* Pedidos de VERDADE, no formato que funciona: o quê, de qual
               imóvel, para qual canal. Campo em branco não ensina formato;
               ver a IA responder a um exemplo, sim. */
            sugestoes={SUGESTOES}
            vazio={
              <>
                <p className="text-titulo font-medium">O que você quer criar?</p>
                <p className="mt-1">
                  Descreve com suas palavras. Eu pergunto o que faltar, mostro como vai ficar, e só gero
                  quando você aprovar.
                </p>
              </>
            }
            onEnviar={enviar}
            onEscolher={escolher}
            anexo={anexo ? { previewUrl: anexo.previewUrl, nome: anexo.file.name } : null}
            onAnexar={(file) => {
              setAnexo((atual) => {
                if (atual) URL.revokeObjectURL(atual.previewUrl);
                return { file, previewUrl: URL.createObjectURL(file) };
              });
            }}
            onRemoverAnexo={() => {
              setAnexo((atual) => {
                if (atual) URL.revokeObjectURL(atual.previewUrl);
                return null;
              });
            }}
            renderAcima={(m) =>
              m.dados?.tipo === "referencia" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.dados.url}
                  alt="Foto de referência anexada"
                  className="border-linha mb-1.5 max-h-44 w-auto max-w-full rounded-lg border"
                />
              ) : null
            }
            renderAbaixo={(m) => {
              if (m.dados?.tipo === "proposta") {
                return (
                  <CartaoDeProposta
                    proposta={m.dados as PropostaDeArte}
                    gerando={gerando === m.id}
                    bloqueada={restam <= 0 || Boolean(gerando)}
                    onGerar={(texto, midiaId) => void gerar(m, texto, midiaId)}
                  />
                );
              }
              const url = m.dados?.tipo === "resultado" ? m.dados.url : null;
              return url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt="Arte gerada"
                  className="border-linha mt-2 max-h-80 w-auto max-w-full rounded-xl border"
                />
              ) : null;
            }}
          />
          <p className="text-tenue px-1 text-right text-[11px]">
            {restam > 0 ? `${teto.usadasHoje} de ${teto.teto} imagens hoje` : "Limite de hoje atingido"}
            {" · "}conversar não gasta imagem
          </p>
        </div>
      </div>

      {galeria.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-fluid-sm text-apoio font-medium">Suas últimas imagens</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {galeria.slice(0, 8).map((img) => (
              <li key={img.id} className="border-linha flex gap-3 overflow-hidden rounded-xl border p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.arteUrl ?? img.url}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-lg object-cover"
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-apoio line-clamp-3 min-w-0 text-xs break-words">{img.prompt}</p>
                  <button
                    type="button"
                    onClick={() => setReaproveitado(img.prompt)}
                    className="text-acento-suave min-h-11 cursor-pointer self-start text-xs underline-offset-4 hover:underline"
                  >
                    Gerar outra assim
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CartaoDeProposta({
  proposta,
  gerando,
  bloqueada,
  onGerar,
}: {
  proposta: PropostaDeArte;
  gerando: boolean;
  bloqueada: boolean;
  onGerar: (prompt: string, midiaId: string | null) => void;
}) {
  /*
   * O prompt é EDITÁVEL, e é ele que vai.
   *
   * A versão anterior mostrava o texto num <p> — e em inglês. O comentário
   * daquele código dizia "esconder do corretor seria tirar dele a chance de
   * corrigir", o que estava certo; só que dar a chance num idioma que ele não
   * escreve, num elemento onde não se digita, é o mesmo que não dar.
   */
  const [texto, setTexto] = useState(proposta.prompt);

  // Proposta NOVA reinicia o campo; enquanto for a mesma, o que ele digitou
  // fica — inclusive depois de um erro de geração.
  useEffect(() => setTexto(proposta.prompt), [proposta.prompt]);

  const curto = texto.trim().length < PISO_DE_PROMPT;

  /*
   * Qual foto do imóvel serve de base. `null` = a foto anexada na conversa
   * (ou nenhuma), que é o comportamento de sempre.
   */
  const fotos = proposta.fotosDoImovel ?? [];
  const [base, setBase] = useState<string | null>(null);
  useEffect(() => setBase(null), [proposta.prompt]);
  const tamanho = TAMANHOS.find((t) => t.chave === proposta.tamanho)?.rotulo ?? proposta.tamanho;
  const qualidade = QUALIDADES.find((q) => q.chave === proposta.qualidade)?.rotulo ?? proposta.qualidade;
  // A foto que sustenta esta proposta, visível no cartão: sem a miniatura, o
  // "vou partir da sua foto" era só uma frase — e proposta antiga com foto
  // antiga ficava indistinguível da atual.
  const referenciaUrl = proposta.referenciaPath
    ? `${supabaseUrl()}/storage/v1/object/public/empreendimentos/${proposta.referenciaPath}`
    : null;
  return (
    <div className="border-linha bg-superficie mt-2 space-y-2 rounded-xl border p-3">
      <p className="text-tenue text-[10px] font-medium tracking-[0.14em] uppercase">Como vai ficar</p>
      {referenciaUrl && (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={referenciaUrl}
            alt="Foto de referência desta proposta"
            className="border-linha h-14 w-14 rounded-lg border object-cover"
          />
          <span className="text-tenue text-[11px]">Partindo desta foto</span>
        </div>
      )}
      {fotos.length > 0 && (
        <div className="space-y-1">
          <p className="text-apoio text-[11px]">
            Partir de qual foto? A imagem é <strong>reinterpretada</strong> a partir dela — não sai
            idêntica.
          </p>
          {/* Rolagem lateral aqui é o CONTEÚDO (a faixa de fotos), não navegação
              escondida — por isso entra declarada em ROLAGEM_DECLARADA. */}
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {fotos.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setBase(base === f.id ? null : f.id)}
                  aria-pressed={base === f.id}
                  title={f.alt}
                  className={cn(
                    "h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2",
                    base === f.id ? "border-acento" : "border-linha",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.alt} className="h-full w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="text-apoio block text-xs font-medium" htmlFor={`prompt-${proposta.tamanho}`}>
        O pedido que vai para o gerador — pode editar
      </label>
      <textarea
        id={`prompt-${proposta.tamanho}`}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={5}
        className="border-linha bg-fundo text-corpo min-h-32 w-full rounded-xl border p-3 text-xs leading-relaxed"
      />

      {!proposta.daIa && (
        <p className="text-alerta text-[11px]">
          Não consegui melhorar seu pedido agora — este texto é o seu, como você escreveu.
        </p>
      )}

      {proposta.naoCobriu.length > 0 && (
        <p className="text-apoio text-[11px]">
          Ficou faltando dizer:{" "}
          {proposta.naoCobriu
            .map((c) => SECOES.find((s) => s.chave === c)?.pede)
            .filter(Boolean)
            .join("; ")}
          .
        </p>
      )}

      {curto && (
        <p className="text-alerta text-[11px]">
          Está curto demais para render uma imagem boa — e gerar custa. Descreva a cena antes.
        </p>
      )}

      <p className="text-tenue text-[11px]">
        {tamanho} · {qualidade}
      </p>
      <button
        type="button"
        onClick={() => onGerar(texto, base)}
        disabled={bloqueada || curto}
        aria-busy={gerando}
        className={cn(
          "bg-acento text-sobre-cor hover:bg-acento-hover min-h-11 w-full cursor-pointer rounded-xl px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {gerando ? "Gerando…" : "Gerar assim"}
      </button>
    </div>
  );
}
