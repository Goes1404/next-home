import type { Metadata } from "next";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { AbasMarketing } from "@/app/corretor/(painel)/_componentes/AbasMarketing";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getMinhasImagens, getTetoDeHoje } from "@/lib/imagens/galeria";
import { imagensConfiguradas } from "@/lib/imagens/gerarImagem";
import { ChatDeArte } from "./ChatDeArte";
import { listarConversasDoEstudio } from "@/app/corretor/(painel)/estudio/acoes";

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

  const [imagens, teto, conversas] = await Promise.all([
    getMinhasImagens(),
    getTetoDeHoje(corretor.id),
    listarConversasDoEstudio("arte"),
  ]);

  return (
    <div className="space-y-5">
      <CabecalhoDeTela
        titulo="Criar arte"
        descricao="Diz o que você quer, com suas palavras. A IA da casa pergunta o que faltar, mostra como vai ficar e só gera quando você aprovar."
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
        <ChatDeArte conversasIniciais={conversas} tetoInicial={teto} galeriaInicial={imagens} />
      )}
    </div>
  );
}
