"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { ChatBase } from "@/app/corretor/(painel)/_componentes/ChatBase";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import {
  QUALIDADES,
  TAMANHOS,
  quandoExpira,
  linkDeDownload,
  nomeDaArte,
  type EstadoDoTeto,
  type ImagemGerada,
} from "@/lib/imagens/imagensTipos";
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
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";

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
  // A primeira ensina a convenção das aspas sem nenhum texto de ajuda: tocar
  // nela, ver a manchete sair certa, e a regra fica aprendida. A última diz,
  // sem explicar, que o assunto não precisa ser imóvel.
  'Arte de feed com a manchete "MUDE AINDA ESTE ANO"',
  "Fachada ao pôr do sol para o feed",
  "Ambiente decorado do zero: sala integrada",
  "Um cachorro vestido de Papai Noel, foto de estúdio",
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
  const [pendente, setPendente] = useState<{ id: string; conteudo: string; previewUrls?: string[] } | null>(null);
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
  const [anexos, setAnexos] = useState<{ file: File; previewUrl: string }[]>([]);
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
    const fotosDaVez = escolha ? [] : anexos;
    setPendente({
      id: `temp-${Date.now()}`,
      conteudo: texto || "📎 Foto de referência",
      previewUrls: fotosDaVez.map((foto) => foto.previewUrl),
    });
    setPensando(true);
    try {
      // A foto sobe ANTES da mensagem: se o upload falhar, nada é gravado e o
      // corretor tenta de novo — mensagem apontando para foto que não subiu
      // seria referência quebrada gravada para sempre.
      const referencias: { path: string; url: string }[] = [];
      for (const foto of fotosDaVez) {
        const up = await enviarFotoDeReferencia(corretorId, foto.file);
        if ("erro" in up) {
          falhar(up.erro);
          throw new Error(up.erro);
        }
        referencias.push(up);
      }

      const r = await enviarMensagemDoEstudio({
        tipo: "arte",
        conversaId: estado?.conversa.id ?? null,
        texto,
        escolha: escolha ?? null,
        referencias,
      });
      if (!aplicar(r)) throw new Error(r && "erro" in r ? r.erro : "falhou");
      if (fotosDaVez.length > 0) {
        fotosDaVez.forEach((foto) => URL.revokeObjectURL(foto.previewUrl));
        setAnexos([]);
      }
    } catch (e) {
      if (ehActionDeOutroBuild(e)) falhar(avisoDePaginaVelha());
      else if (!(e instanceof Error && e.message)) falhar("Sem conexão. Tente de novo.");
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
          referenciaPaths: midiaId ? undefined : p.referenciaPaths,
          // A foto DO IMÓVEL escolhida na faixa. Vai como id, nunca como URL:
          // quem decide o acesso é a RLS sobre `midias`, e mandar URL faria o
          // servidor baixar um endereço escolhido pelo cliente.
          midiaId: midiaId ?? undefined,
        }),
      });
      const corpo = (await resp.json().catch(() => null)) as
        | {
            ok: true;
            imagem: ImagemGerada;
            teto: EstadoDoTeto;
            ressalva?: "aplicada" | "nao_se_aplica" | "falhou";
          }
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
      /*
       * A ressalva legal é carimbada por código na rota. Quando o carimbo
       * falha, a imagem ainda é entregue — ela já foi paga, e recusar seria
       * queimar dinheiro de quem não errou —, mas o corretor PRECISA saber:
       * publicar peça de IA sem dizer que é ilustrativa é problema dele com o
       * cliente, não nosso com o servidor. Silêncio aqui seria o pior
       * desfecho, porque a ausência do aviso é invisível na miniatura.
       */
      if (corpo.ressalva === "falhou") {
        falhar(
          "A imagem saiu SEM a ressalva “imagem meramente ilustrativa”. " +
            "Escreva a sua antes de publicar.",
        );
      } else {
        /*
         * "nao_se_aplica" NÃO é falha: a ressalva só é carimbada em peça
         * vinculada a um empreendimento. Soar alarme numa imagem livre
         * ensinaria a ignorar o alarme justamente quando ele importa.
         */
        avisar("Imagem pronta.");
      }
    } catch (e) {
      /*
       * Chegar aqui DEPOIS do 200 da rota significa que a arte já foi gerada,
       * carimbada, guardada e paga — só o registro na conversa falhou. Culpar
       * a rede faria o corretor pagar de novo por uma imagem que já está na
       * galeria (o `setGaleria` acima já a colocou lá).
       */
      falhar(
        ehActionDeOutroBuild(e)
          ? avisoDePaginaVelha("A imagem FOI gerada e já está na sua galeria.")
          : "A imagem foi gerada e está na galeria, mas não deu para registrá-la nesta conversa.",
      );
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
            placeholder="O que quer criar?"
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
            anexos={anexos.map((anexo) => ({ previewUrl: anexo.previewUrl, nome: anexo.file.name }))}
            onAnexar={(files) => {
              setAnexos((atuais) => {
                const novos = files.slice(0, Math.max(0, 4 - atuais.length)).map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
                if (files.length > novos.length) falhar("Você pode usar até 4 fotos como referência.");
                return [...atuais, ...novos];
              });
            }}
            onRemoverAnexo={(indice) => {
              setAnexos((atuais) => {
                const alvo = atuais[indice];
                if (alvo) URL.revokeObjectURL(alvo.previewUrl);
                return atuais.filter((_, i) => i !== indice);
              });
            }}
            renderAcima={(m) => {
              if (m.dados?.tipo !== "referencia") return null;
              /*
               * TODAS as fotos do balão, NUMERADAS.
               *
               * Mostrava só `m.dados.url` — a primeira. Quem anexava duas via
               * uma, e concluía (com razão) que a segunda não tinha ido; foi
               * assim que "não dá para enviar mais de uma foto" chegou como
               * relato, com o recurso inteiro funcionando por baixo. E o
               * número não é enfeite: é ele que dá sentido a "deixe a primeira
               * parecida com a segunda", que é como a pessoa escreve.
               */
              const fotos =
                m.dados.referencias && m.dados.referencias.length > 0
                  ? m.dados.referencias
                  : [{ path: m.dados.path, url: m.dados.url }];

              return (
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                  {fotos.map((foto, i) => (
                    <div key={foto.path} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={foto.url}
                        alt={`Foto de referência ${i + 1} de ${fotos.length}`}
                        className="border-linha max-h-44 w-auto max-w-full rounded-lg border"
                      />
                      {fotos.length > 1 && (
                        <span className="bg-ink-950/80 absolute top-1.5 left-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium text-brand-200">
                          {i + 1}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              );
            }}
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
              // `imagem_id` vira null quando a retenção de 48h remove a arte.
              // Não deixar um <img> quebrado fingir que ela ainda existe.
              const arteExpirada = Boolean(url && !m.imagemId);
              return url && !arteExpirada ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt="Arte gerada"
                  className="border-linha mt-2 max-h-80 w-auto max-w-full rounded-xl border"
                />
              ) : arteExpirada ? (
                <p className="text-tenue mt-2 text-sm">Esta arte expirou após 48 horas para liberar espaço.</p>
              ) : null;
            }}
          />
          <p className="text-tenue px-1 text-right text-[11px]">
            {restam > 0 ? `${teto.usadasHoje} de ${teto.teto} imagens hoje` : "Limite de hoje atingido"}
            {" · "}conversar não gasta imagem
          </p>
        </div>
      </div>

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-fluid-sm text-apoio font-medium">Suas últimas imagens</h2>
          <p className="text-tenue text-xs">Cada arte fica disponível por 48 horas.</p>
        </div>

        {galeria.length === 0 ? (
          /*
           * Estado vazio EXPLICADO, e é por isso que a seção deixou de sumir.
           *
           * Antes o bloco inteiro era `galeria.length > 0 && (…)`: quando a
           * retenção de 48h (0109) levava as artes, a tela não ficava vazia —
           * a seção desaparecia. E seção ausente é indistinguível de recurso
           * que não existe ou que quebrou, que foi exatamente como isto
           * chegou como defeito ("não consigo ver os cards das minhas
           * imagens"). Dizer o prazo em voz alta é o que transforma um
           * sumiço inexplicável em regra conhecida.
           */
          <p className="border-linha text-apoio rounded-xl border border-dashed px-4 py-6 text-center text-xs">
            Nenhuma arte por aqui. As que você gerar aparecem nesta lista e
            ficam <strong className="text-titulo font-semibold">48 horas</strong> —
            depois somem sozinhas, para não virar acervo. Baixe o que quiser
            guardar.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {galeria.slice(0, 8).map((img) => (
              <CartaoDaGaleria key={img.id} img={img} onReaproveitar={setReaproveitado} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Um card da galeria: ver grande, BAIXAR, e reaproveitar o pedido.
 *
 * O download era o que faltava, e faltava por inteiro — não havia botão de
 * baixar em lugar nenhum da galeria. A miniatura de 80px era o único elemento
 * do card, sem link: para guardar a arte, a pessoa dependia de clicar com o
 * botão direito (ou segurar, no celular) numa imagem que nada indicava ser
 * clicável. Some isso à retenção de 48h e a peça paga desaparecia antes de
 * alguém conseguir salvá-la.
 *
 * `linkDeDownload` existe porque o atributo `download` do HTML é IGNORADO
 * entre origens, e a arte mora no domínio do Storage — ver o comentário dele.
 */
function CartaoDaGaleria({
  img,
  onReaproveitar,
}: {
  img: ImagemGerada;
  onReaproveitar: (prompt: string) => void;
}) {
  const arte = img.arteUrl ?? img.url;
  const some = quandoExpira(img.expiraEm);

  return (
    <li className="border-linha flex gap-3 overflow-hidden rounded-xl border p-2">
      <a
        href={arte}
        target="_blank"
        rel="noopener noreferrer"
        className="border-linha hover:border-acento-linha block shrink-0 overflow-hidden rounded-lg border transition-colors"
        title="Ver em tamanho cheio"
      >
        {/* `<img>` cru: imagem de painel interno, atrás de sessão, fora do
            orçamento de otimização da vitrine — como o resto da galeria. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={arte} alt={img.prompt} className="h-20 w-20 object-cover" />
      </a>

      {/* `min-w-0`: sem ele o texto longo do pedido se recusa a encolher e
          empurra os botões para fora do card (item de flex nasce com
          `min-width: auto`). */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-apoio line-clamp-2 min-w-0 text-xs break-words">{img.prompt}</p>

        {some && <p className="text-tenue text-[11px]">Some em {some}</p>}

        <div className="mt-auto flex flex-wrap items-center gap-x-3">
          <a
            href={linkDeDownload(arte, nomeDaArte(img.prompt, img.criadaEm))}
            className="text-acento-suave inline-flex min-h-11 items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth={1.8}
              stroke="currentColor"
              aria-hidden
              className="h-4 w-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16" />
            </svg>
            Baixar
          </a>
          <button
            type="button"
            onClick={() => onReaproveitar(img.prompt)}
            className="text-apoio min-h-11 cursor-pointer text-xs underline-offset-4 hover:underline"
          >
            Gerar outra assim
          </button>
        </div>
      </div>
    </li>
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

  /*
   * Qual foto do imóvel serve de base. `null` = a foto anexada na conversa
   * (ou nenhuma), que é o comportamento de sempre.
   */
  const fotos = proposta.fotosDoImovel ?? [];
  const [base, setBase] = useState<string | null>(null);

  /*
   * Proposta NOVA reinicia campo e escolha; enquanto for a mesma, o que o
   * corretor digitou fica — inclusive depois de um erro de geração.
   *
   * Comparado DURANTE o render, não num efeito: `setState` síncrono dentro de
   * efeito pinta a tela com o valor velho e força um segundo render (o React
   * avisa disso). Aqui o mesmo render já sai com o valor certo.
   */
  const [propostaAnterior, setPropostaAnterior] = useState(proposta.prompt);
  if (proposta.prompt !== propostaAnterior) {
    setPropostaAnterior(proposta.prompt);
    setTexto(proposta.prompt);
    setBase(null);
  }

  const curto = texto.trim().length < PISO_DE_PROMPT;
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

      {/*
        Fixo, não condicional: o risco vale para TODA geração, e aviso que
        aparece só às vezes ensina que a ausência dele é garantia. Com texto
        livre na imagem (11/09/2026), nenhuma régua de código alcança o que o
        modelo desenhou — ninguém lê texto dentro de PNG sem OCR.
      */}
      <p className="text-apoio text-[11px]">
        A IA pode escrever texto na imagem — inclusive nome, metragem e preço que ela inventou.{" "}
        <strong className="text-titulo">Confira o que está escrito antes de publicar.</strong>
      </p>

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
