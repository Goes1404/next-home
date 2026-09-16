import { getArtesDoImovel } from "@/lib/imagens/galeria";
import { linkDeDownload, nomeDaArte, quandoExpira } from "@/lib/imagens/imagensTipos";

/**
 * As artes de IA deste imóvel (0101).
 *
 * ## Por que isto NÃO é o editor de fotos
 *
 * `EditorFotos` mexe em `midias` — o catálogo. O que está aqui não é catálogo
 * e não pode virar: a vitrine pública não mostra, e a assistente não pode
 * anexar numa conversa (o guardrail do atendimento só libera mídia do
 * catálogo). Um render de fachada inventado por modelo chegando no WhatsApp
 * de quem vai visitar o imóvel na semana seguinte é o defeito que a MEMORIA
 * registra desde agosto: quem visita confere.
 *
 * Então o bloco é do CORRETOR: é onde ele acha a peça que pediu quando
 * cadastrou o imóvel, para levar ao post e ao anúncio à mão.
 *
 * Some quando não há arte — cartão vazio é ruído com aparência de estrutura.
 *
 * Server Component: uma consulta recortada por `empreendimento_id`, com a RLS
 * da 0090 ainda por cima. Nada aqui é interativo além de abrir a imagem.
 */
export async function ArtesDeIA({ empreendimentoId }: { empreendimentoId: string }) {
  const artes = await getArtesDoImovel(empreendimentoId);
  if (artes.length === 0) return null;

  return (
    <section className="cartao p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-fluid-sm text-titulo font-bold">
          Artes de IA deste imóvel
          <span className="text-tenue ml-2 text-[11px] font-medium tabular-nums">
            {artes.length}
          </span>
        </h2>
        <p className="text-fluid-xs text-tenue">
          Não aparecem no site. Ficam 48 horas — baixe o que quiser guardar.
        </p>
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {artes.map((arte) => {
          const url = arte.arteUrl ?? arte.url;
          const some = quandoExpira(arte.expiraEm);
          return (
            <li key={arte.id} className="border-linha overflow-hidden rounded-xl border">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:border-acento-linha block"
                title="Ver em tamanho cheio"
              >
                {/* `<img>` cru, como o resto da galeria de criações: é imagem de
                    painel interno, atrás de sessão, e não entra no orçamento de
                    otimização da vitrine. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={arte.prompt}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
              </a>
              <div className="px-2 py-1.5">
                <span className="text-fluid-xs text-apoio block truncate" title={arte.prompt}>
                  {arte.prompt}
                </span>
                {some && <span className="text-tenue block text-[11px]">Some em {some}</span>}
                {/* O baixar fica FORA do `<a>` da imagem: link dentro de link é
                    aninhamento inválido, e o leitor de tela anuncia um alvo só. */}
                <a
                  href={linkDeDownload(url, nomeDaArte(arte.prompt, arte.criadaEm))}
                  className="text-acento-suave inline-flex min-h-11 items-center text-xs font-medium underline-offset-4 hover:underline"
                >
                  Baixar
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
