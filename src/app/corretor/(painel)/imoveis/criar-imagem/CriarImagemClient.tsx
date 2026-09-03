"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { excluirImagem } from "./acoes";
import {
  QUALIDADES,
  TAMANHOS,
  type ChaveQualidade,
  type ChaveTamanho,
  type EstadoDoTeto,
  type ImagemGerada,
} from "@/lib/imagens/imagensTipos";

/**
 * O laço do ChatGPT: escreve o que quer → sai a imagem → "usar como
 * referência" leva a imagem de volta ao campo, e a próxima geração parte dela.
 * É essa volta que transforma uma ferramenta de sorteio em uma de trabalho.
 *
 * A foto de referência sobe DIRETO do navegador para o Storage e só o caminho
 * vai para a rota. Server Action tem teto de 12 MB e afrouxá-lo valeria para
 * todas as actions do sistema — é o mesmo padrão de `importar/OrigemPdf.tsx`.
 */

const BUCKET = "empreendimentos";
const TETO_REFERENCIA_BYTES = 15 * 1024 * 1024;

export function CriarImagemClient({
  corretorId,
  iniciais,
  tetoInicial,
}: {
  corretorId: string;
  iniciais: ImagemGerada[];
  tetoInicial: EstadoDoTeto;
}) {
  const [prompt, setPrompt] = useState("");
  const [tamanho, setTamanho] = useState<ChaveTamanho>("quadrado");
  const [qualidade, setQualidade] = useState<ChaveQualidade>("low");
  const [imagens, setImagens] = useState(iniciais);
  const [teto, setTeto] = useState(tetoInicial);
  const [gerando, setGerando] = useState(false);
  const [referencia, setReferencia] = useState<{ path: string; url: string } | null>(null);
  const [enviandoRef, setEnviandoRef] = useState(false);
  const [, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();
  const campoArquivo = useRef<HTMLInputElement>(null);

  const restam = Math.max(0, teto.teto - teto.usadasHoje);
  const podeGerar = prompt.trim().length > 0 && restam > 0 && !gerando;

  async function subirReferencia(arquivo: File) {
    if (arquivo.size > TETO_REFERENCIA_BYTES) {
      falhar("A foto passa de 15 MB. Use uma menor.");
      return;
    }
    setEnviandoRef(true);
    try {
      const supabase = createClient();
      const ext = arquivo.name.split(".").pop()?.toLowerCase() || "png";
      // Nome aleatório: o bucket é público, então a URL é o segredo — mesma
      // razão do UUID no PDF de staging da importação.
      const path = `corretores/${corretorId}/referencias/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, arquivo, { contentType: arquivo.type || "image/png", upsert: true });
      if (error) {
        falhar("Não deu para enviar a foto. Confira a conexão.");
        return;
      }
      setReferencia({
        path,
        url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
      });
    } finally {
      setEnviandoRef(false);
    }
  }

  async function gerar() {
    if (!podeGerar) return;
    setGerando(true);
    try {
      const r = await fetch("/api/imagens/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          tamanho,
          qualidade,
          referenciaPath: referencia?.path ?? null,
        }),
      });
      const corpo = await r.json();
      if (!r.ok) {
        falhar(corpo.erro ?? "Não deu para gerar a imagem.");
        if (corpo.teto) setTeto(corpo.teto);
        return;
      }
      setImagens((atuais) => [corpo.imagem, ...atuais]);
      setTeto(corpo.teto);
      avisar("Imagem criada");
    } catch {
      falhar("Não deu para gerar a imagem. Confira a conexão.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="border-linha bg-superficie shadow-painel space-y-3 rounded-2xl border p-4 sm:p-5">
        <label className="block">
          <span className="so-para-leitor">O que você quer na imagem</span>
          <textarea
            value={prompt}
            rows={3}
            disabled={gerando}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Sala de estar ampla, mobiliada em tons claros, luz natural da tarde"
            className="text-fluid-sm border-linha-forte bg-campo text-corpo placeholder:text-tenue focus:border-acento-linha w-full resize-y rounded-xl border px-3 py-2.5 outline-none transition-colors disabled:opacity-50"
          />
        </label>

        {referencia && (
          <div className="border-acento-linha bg-acento-lavado flex items-center gap-3 rounded-xl border p-2">
            <Image
              src={referencia.url}
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
              unoptimized
            />
            <span className="text-fluid-xs text-acento-suave flex-1">
              Partindo desta foto.
            </span>
            <button
              type="button"
              onClick={() => setReferencia(null)}
              className="text-fluid-xs text-apoio hover:text-titulo min-h-11 shrink-0 cursor-pointer px-3"
            >
              Tirar
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <label className="text-fluid-xs text-apoio flex flex-col gap-1">
            Formato
            <select
              value={tamanho}
              disabled={gerando}
              onChange={(e) => setTamanho(e.target.value as ChaveTamanho)}
              className="text-fluid-sm border-linha-forte bg-campo text-corpo min-h-11 cursor-pointer rounded-lg border px-3"
            >
              {TAMANHOS.map((t) => (
                <option key={t.chave} value={t.chave}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          </label>

          <label className="text-fluid-xs text-apoio flex flex-col gap-1">
            Capricho
            <select
              value={qualidade}
              disabled={gerando}
              onChange={(e) => setQualidade(e.target.value as ChaveQualidade)}
              className="text-fluid-sm border-linha-forte bg-campo text-corpo min-h-11 cursor-pointer rounded-lg border px-3"
            >
              {QUALIDADES.map((q) => (
                <option key={q.chave} value={q.chave}>
                  {q.rotulo}
                </option>
              ))}
            </select>
          </label>

          <label className="text-fluid-xs text-apoio flex flex-col gap-1">
            Referência
            <span className="border-linha-forte text-corpo hover:border-acento-linha text-fluid-sm flex min-h-11 cursor-pointer items-center rounded-lg border px-3 transition-colors">
              {enviandoRef ? "Enviando…" : referencia ? "Trocar foto" : "Anexar foto"}
              <input
                ref={campoArquivo}
                type="file"
                accept="image/*"
                disabled={gerando || enviandoRef}
                onChange={(e) => {
                  const arquivo = e.target.files?.[0];
                  if (arquivo) void subirReferencia(arquivo);
                  e.target.value = "";
                }}
                className="sr-only"
              />
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void gerar()}
            disabled={!podeGerar}
            aria-busy={gerando}
            className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm min-h-12 flex-1 cursor-pointer rounded-xl px-4 font-medium transition-colors disabled:cursor-wait disabled:opacity-60 sm:flex-none"
          >
            {gerando ? "Criando… pode levar até um minuto" : "Criar imagem"}
          </button>
          {/* O que sobra do dia fica à vista: geração é a única coisa do painel
              que custa por clique, e limite que só aparece quando estoura é
              surpresa. */}
          <span className="text-fluid-xs text-tenue tabular-nums">
            {restam > 0 ? `${restam} de ${teto.teto} hoje` : "Limite de hoje atingido"}
          </span>
        </div>

        {/* Medido na primeira geração de verdade (03/09/2026): pedida uma
            "fachada de edifício residencial", o modelo desenhou uma PLACA com
            o nome "VISTA ALTO" na entrada. É a versão visual do defeito que
            este projeto conhece de cor — o que não está no pedido, ele
            inventa, e inventa plausível. Imagem com nome de empreendimento
            que não existe, ou com metragem escrita na arte, vira promessa
            quando chega ao cliente. O aviso é fixo porque o risco é de toda
            geração, não de algumas. */}
        <p className="text-fluid-xs text-apoio border-linha border-t pt-3">
          Confira letreiros e números antes de usar: o modelo inventa nome de
          prédio, placa e texto na arte, sempre com cara de verdadeiro.
        </p>
      </section>

      {imagens.length === 0 ? (
        <p className="text-fluid-sm text-apoio border-linha bg-superficie rounded-2xl border p-6 text-center">
          Nada criado ainda. O que sair daqui fica só com você — não entra no
          catálogo do imóvel nem aparece no site.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {imagens.map((img) => (
            <li
              key={img.id}
              className="border-linha bg-superficie overflow-hidden rounded-2xl border"
            >
              <Image
                src={img.url}
                alt={img.prompt}
                width={img.largura ?? 1024}
                height={img.altura ?? 1024}
                className="h-auto w-full"
                unoptimized
              />
              <div className="space-y-2 p-3">
                <p className="text-fluid-xs text-apoio line-clamp-2">{img.prompt}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setReferencia({ path: caminhoDaUrl(img.url), url: img.url })}
                    className="text-fluid-xs border-linha-forte text-corpo hover:border-acento-linha min-h-11 cursor-pointer rounded-full border px-3 transition-colors"
                  >
                    Usar como referência
                  </button>
                  <a
                    href={img.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-fluid-xs border-linha-forte text-corpo hover:border-acento-linha min-h-11 inline-flex items-center rounded-full border px-3 transition-colors"
                  >
                    Abrir
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      iniciar(async () => {
                        const r = await excluirImagem(img.id);
                        if (r?.erro) {
                          falhar(r.erro);
                          return;
                        }
                        setImagens((atuais) => atuais.filter((x) => x.id !== img.id));
                      })
                    }
                    className="text-fluid-xs border-perigo-linha text-perigo hover:bg-perigo-lavado min-h-11 cursor-pointer rounded-full border px-3 transition-colors"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * O caminho no Storage a partir da URL pública.
 *
 * A rota confina a referência à pasta do próprio corretor, então reaproveitar
 * uma imagem já gerada como ponto de partida só funciona se o caminho for o
 * real — e ele está embutido na URL depois de `/public/<bucket>/`.
 */
function caminhoDaUrl(url: string): string {
  const marca = `/public/${BUCKET}/`;
  const i = url.indexOf(marca);
  return i < 0 ? "" : url.slice(i + marca.length);
}
