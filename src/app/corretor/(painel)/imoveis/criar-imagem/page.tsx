import type { Metadata } from "next";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getMinhasImagens, getTetoDeHoje } from "@/lib/imagens/galeria";
import { imagensConfiguradas } from "@/lib/imagens/gerarImagem";
import { CriarImagemClient } from "./CriarImagemClient";

export const metadata: Metadata = { title: "Criar imagem" };

/**
 * Criar imagem com IA.
 *
 * Sub-rota de Imóveis, como `imoveis/candidatos`: o menu está no teto de sete
 * destinos e `moduloAtivo` já dá a cor do módulo por prefixo — nenhuma rota
 * nova no menu.
 *
 * O que esta tela deliberadamente NÃO faz: gravar em `midias`. A imagem fica
 * com o corretor, não aparece na vitrine, e a assistente não pode enviá-la —
 * o guardrail do atendimento só libera anexo que esteja no catálogo. Quem
 * decide mandar uma imagem gerada para um cliente é uma pessoa, à mão, no
 * Live Chat.
 */
export default async function PaginaCriarImagem() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null; // o layout já mostra o aviso de conta sem vínculo

  const [imagens, teto] = await Promise.all([
    getMinhasImagens(),
    getTetoDeHoje(corretor.id),
  ]);

  return (
    <div className="space-y-5">
      <CabecalhoDeTela
        titulo="Criar imagem"
        descricao="Descreva o que você quer. Anexe uma foto para partir dela — mobiliar um cômodo vazio, por exemplo."
      />

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
          iniciais={imagens}
          tetoInicial={teto}
        />
      )}
    </div>
  );
}
