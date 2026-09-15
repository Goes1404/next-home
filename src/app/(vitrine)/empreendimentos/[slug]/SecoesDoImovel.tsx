import { CenaShowcase } from "@/components/empreendimento/CenaShowcase";
import { cenasDoShowcase } from "@/components/empreendimento/cenasDoShowcase";
import { Contato } from "@/components/empreendimento/Contato";
import { FichaNumeros } from "@/components/empreendimento/FichaNumeros";
import { Galeria } from "@/components/empreendimento/Galeria";
import { Lazer } from "@/components/empreendimento/Lazer";
import { Localizacao } from "@/components/empreendimento/Localizacao";
import { NavAncoras, type Secao } from "@/components/empreendimento/NavAncoras";
import { Similares } from "@/components/empreendimento/Similares";
import { Sobre } from "@/components/empreendimento/Sobre";
import { BookDigital } from "@/components/empreendimento/BookDigital";
import { Tipologias } from "@/components/empreendimento/Tipologias";
import { Tour360 } from "@/components/empreendimento/Tour360";
import { Video } from "@/components/empreendimento/Video";
import { cederAoStream } from "@/lib/cederAoStream";
import { fotosDoLazer } from "@/lib/lazerFotos";
import { getSimilares } from "@/lib/queries";
import { linkWhatsappPara } from "@/lib/site";
import type { Empreendimento } from "@/lib/types";

/** Seções realmente renderizadas — a barra de âncoras não pode oferecer link morto. */
function secoesDe(e: Empreendimento): Secao[] {
  const secoes: Secao[] = [{ id: "sobre", label: "Sobre" }];
  secoes.push({ id: "book", label: "Book Digital" });
  if (e.tipologias.length > 0) secoes.push({ id: "tipologias", label: "Tipologias" });
  if (e.lazer.length > 0) secoes.push({ id: "lazer", label: "Lazer" });
  if (e.galeria.length > 0) secoes.push({ id: "galeria", label: "Galeria" });
  if (e.videos.length > 0) secoes.push({ id: "video", label: "Vídeo" });
  if (e.tours360.length > 0) secoes.push({ id: "tour360", label: "Tour 360°" });
  secoes.push({ id: "localizacao", label: "Localização" });
  secoes.push({ id: "contato", label: "Contato" });
  return secoes;
}

/**
 * Tudo o que fica ABAIXO do hero, num boundary próprio.
 *
 * O hero é o LCP da página do imóvel (a capa é tela cheia, e o Chrome não
 * conta imagem que cobre a viewport inteira como candidata). Sem este
 * boundary, o `h1` só era revelado quando o documento INTEIRO tinha sido
 * baixado e analisado — 25 KB de gzip, 17 deles de dados destas seções
 * emitidos antes dele — e o script de revelação vinha no fim. No celular em
 * rede lenta, com o parser disputando a thread com 790 KB de JavaScript,
 * isso dava 6–9 s. Ver `cederAoStream`: é ele que faz o hero sair na frente.
 *
 * O que o cliente recebe por prop é o que ele LÊ, não o cadastro inteiro:
 * três cenas para a vitrine, o par item→foto do lazer. O resto do
 * `Empreendimento` fica nos Server Components.
 */
export async function SecoesDoImovel({ empreendimento: e }: { empreendimento: Empreendimento }) {
  await cederAoStream();
  const similares = await getSimilares(e.slug);

  return (
    <>
      <FichaNumeros empreendimento={e} />

      <div className="mx-auto max-w-3xl px-4">
        <NavAncoras secoes={secoesDe(e)} />
      </div>

      <Sobre empreendimento={e} />
      <CenaShowcase cenas={cenasDoShowcase(e)} />
      <BookDigital empreendimento={e} />
      <Tipologias
        tipologias={e.tipologias}
        plantasGerais={e.plantas}
        contatoWhatsapp={linkWhatsappPara(
          e.corretor.whatsapp,
          `Olá, ${e.corretor.nome}! Vim pelo site e quero a tabela de valores e as plantas do ${e.nome}.`,
        )}
      />
      <Lazer itens={e.lazer} fotosDosItens={[...fotosDoLazer(e.lazer, e.galeria)]} />
      <Galeria fotos={e.galeria} />
      <Video videos={e.videos} />
      <Tour360 tours={e.tours360} />
      <Localizacao empreendimento={e} />
      <Contato empreendimento={e} />
      <Similares empreendimentos={similares} />
    </>
  );
}

/**
 * O que ocupa o lugar das seções enquanto elas chegam. Fica abaixo da dobra
 * (o hero tem a altura da tela), então ninguém o vê — mas sem altura o
 * rodapé do layout raiz subiria para logo abaixo do hero e desceria de
 * novo um segundo depois.
 */
export function EsperaDasSecoes() {
  return <div aria-hidden className="min-h-[80svh]" />;
}
