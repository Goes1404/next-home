import type { Metadata } from "next";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { AbasMarketing } from "@/app/corretor/(painel)/_componentes/AbasMarketing";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getMinhasImagens, getTetoDeHoje } from "@/lib/imagens/galeria";
import { imagensConfiguradas } from "@/lib/imagens/gerarImagem";
import { getEmpreendimentosDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { STATUS_LABEL } from "@/lib/types";
import { CriarImagemClient, type ImovelDaLista } from "./CriarImagemClient";

export const metadata: Metadata = { title: "Criar arte" };

/**
 * Criar arte de marketing com IA.
 *
 * Sub-rota de Imóveis, como `imoveis/candidatos`: o menu está no teto de sete
 * destinos e `moduloAtivo` já dá a cor do módulo por prefixo.
 *
 * O que esta tela deliberadamente NÃO faz: gravar em `midias`. A imagem fica
 * com o corretor, não aparece na vitrine, e a assistente não pode enviá-la —
 * o guardrail do atendimento só libera anexo que esteja no catálogo. Quem
 * decide mandar uma arte para um cliente é uma pessoa, à mão.
 */
export default async function PaginaCriarImagem() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null; // o layout já mostra o aviso de conta sem vínculo

  const [imagens, teto, catalogo] = await Promise.all([
    getMinhasImagens(),
    getTetoDeHoje(corretor.id),
    getEmpreendimentosDoPainel(),
  ]);

  // Só o que a lista precisa: mandar o catálogo inteiro para o cliente
  // arrastaria descrição, mídias e tipologias de 25 imóveis por nada.
  const imoveis: ImovelDaLista[] = catalogo
    .filter((i) => i.publicado !== false)
    .map((i) => ({
      slug: i.slug,
      nome: i.nome,
      lugar: `${i.bairro}, ${i.cidade}`,
      estagio: STATUS_LABEL[i.status],
      temFoto: Boolean(i.capa?.url || i.galeria[0]?.url),
    }));

  return (
    <div className="space-y-5">
      <CabecalhoDeTela
        titulo="Criar arte"
        descricao="Peça pronta para publicar: escolha o imóvel, o objetivo e o canal. O briefing sai da ficha real; a IA escreve dentro da régua."
      />

      <AbasMarketing ativa="/corretor/imoveis/criar-imagem" />

      {!imagensConfiguradas() ? (
        <p
          role="status"
          className="text-fluid-sm border-alerta-linha bg-alerta-lavado text-alerta rounded-2xl border px-4 py-3"
        >
          A geração de imagens ainda não está configurada neste ambiente.
        </p>
      ) : (
        <CriarImagemClient
          corretorId={corretor.id}
          imoveis={imoveis}
          iniciais={imagens}
          tetoInicial={teto}
        />
      )}
    </div>
  );
}
