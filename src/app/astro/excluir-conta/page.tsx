import type { Metadata } from "next";
import Link from "next/link";
import { MARCA_DA_PLATAFORMA } from "@/lib/marcaDaPlataforma";
import { ContatoDaAstro, PaginaLegal, SecaoLegal } from "../_componentes/PaginaLegal";

/**
 * Como excluir a conta (28/10/2026): a URL que a Play Store exige no
 * formulário de segurança de dados. Diz o caminho, o que é apagado, o que
 * fica e por quanto tempo, em linha com `encerramentoRegras.ts` (90 dias de
 * bloqueio depois do cancelamento, depois apagados).
 */
export const metadata: Metadata = {
  title: { absolute: `Excluir conta · ${MARCA_DA_PLATAFORMA.nome}` },
  description: `Como pedir a exclusão da sua conta e dos seus dados no CRM da ${MARCA_DA_PLATAFORMA.nome}.`,
};

export default function ExcluirConta() {
  const nome = MARCA_DA_PLATAFORMA.nome;
  return (
    <PaginaLegal
      titulo="Excluir conta e dados"
      atualizadaEm="28 de outubro de 2026"
      introducao={<p>Como pedir a exclusão da sua conta no CRM da {nome} (site e app Android), e o que acontece com os dados.</p>}
    >
      <SecaoLegal titulo="Se você faz parte da equipe de uma empresa">
        <ul>
          <li>
            Peça ao gestor da sua empresa para encerrar o seu acesso. Ele faz isso em Administração, Contas, no
            próprio CRM.
          </li>
          <li>Os leads e as conversas de trabalho pertencem à empresa e continuam com ela.</li>
          <li>
            Para apagar também o seu login e os seus dados pessoais de cadastro, peça à {nome}: <ContatoDaAstro />.
            Informe o e-mail de login e o nome da empresa.
          </li>
        </ul>
      </SecaoLegal>

      <SecaoLegal titulo="Se você é autônomo ou dono da conta da empresa">
        <ul>
          <li>
            Peça o cancelamento e a exclusão à {nome}: <ContatoDaAstro />. Envie o pedido do e-mail de login da conta,
            para confirmarmos que é você.
          </li>
          <li>Antes da exclusão, você pode pedir a exportação dos seus dados (leads, conversas e planilhas).</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal titulo="O que é apagado e quando">
        <ul>
          <li>O acesso é encerrado no mesmo dia em que o pedido é confirmado.</li>
          <li>
            Os dados da conta (cadastro, leads, conversas, imóveis, arquivos) ficam bloqueados por 90 dias, para o caso
            de arrependimento ou exportação, e depois são apagados de vez.
          </li>
          <li>Registros que a lei obriga a guardar, como notas e pagamentos, ficam pelo prazo legal.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal titulo="Mais informações">
        <p>
          Veja a{" "}
          <Link href="/astro/privacidade" className="font-medium text-[var(--azul)] underline underline-offset-4">
            política de privacidade
          </Link>{" "}
          para saber que dados guardamos e com quem eles são compartilhados.
        </p>
      </SecaoLegal>
    </PaginaLegal>
  );
}
