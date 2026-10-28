import type { Metadata } from "next";
import Link from "next/link";
import { dadosDaEmpresa, MARCA_DA_PLATAFORMA } from "@/lib/marcaDaPlataforma";
import { ContatoDaAstro, PaginaLegal, SecaoLegal } from "../_componentes/PaginaLegal";

/**
 * Política de privacidade do CRM da Astro Soluções (28/10/2026). É a URL que
 * a Play Store pede. Descreve o que o produto guarda HOJE e onde: banco no
 * Canadá (`ca-central-1`, decisão de 18/10), IA da OpenAI, WhatsApp pela
 * conexão do próprio corretor. Rascunho para revisão jurídica, como os
 * termos (`src/lib/termos/termos.ts`). Mudou o texto, mude a data.
 */
const ATUALIZADA_EM = "28 de outubro de 2026";

export const metadata: Metadata = {
  title: { absolute: `Política de privacidade · ${MARCA_DA_PLATAFORMA.nome}` },
  description: `Que dados o CRM da ${MARCA_DA_PLATAFORMA.nome} guarda, para quê, onde e como pedir a exclusão.`,
};

export default function PrivacidadeDaAstro() {
  const { razaoSocial, cnpj } = dadosDaEmpresa();
  const nome = MARCA_DA_PLATAFORMA.nome;
  return (
    <PaginaLegal
      titulo="Política de privacidade"
      atualizadaEm={ATUALIZADA_EM}
      introducao={
        <p>
          Esta política vale para o CRM da {nome} (site e app), usado por imobiliárias e corretores para atender
          clientes. Ela explica que dados guardamos, para quê, onde ficam e como pedir para apagar.
        </p>
      }
    >
      <SecaoLegal titulo="Quem cuida dos dados">
        <p>
          {razaoSocial}
          {cnpj ? `, CNPJ ${cnpj},` : ""} oferece o CRM.
        </p>
        <ul>
          <li>
            Para os dados da sua <strong>conta</strong> (quem usa o CRM), a {nome} é a controladora.
          </li>
          <li>
            Para os dados dos <strong>clientes</strong> que a imobiliária ou o corretor atende pelo CRM, quem decide
            é a imobiliária ou o corretor (controlador). A {nome} só guarda e processa esses dados para o CRM
            funcionar, como operadora, nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
          </li>
        </ul>
      </SecaoLegal>

      <SecaoLegal titulo="Que dados guardamos">
        <p>
          <strong>Da sua conta:</strong> nome, e-mail, telefone, CRECI, foto, a imobiliária a que você pertence e os
          registros de acesso e de uso (por exemplo, quando você entrou e o que alterou).
        </p>
        <p>
          <strong>Dos clientes atendidos:</strong> nome, telefone, e-mail, as mensagens e áudios trocados no
          WhatsApp conectado ao CRM, os imóveis de interesse, as visitas, as propostas e os documentos que o corretor
          anexar.
        </p>
        <p>
          <strong>Do uso do app:</strong> dados técnicos do aparelho e do navegador necessários para o login e para
          enviar notificações. Não usamos o app para anúncios nem vendemos dados.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="Para que usamos">
        <ul>
          <li>Fazer o CRM funcionar: organizar leads, conversas, agenda, imóveis e vendas.</li>
          <li>
            Responder os clientes no WhatsApp com a assistente de inteligência artificial, quando a imobiliária ou o
            corretor a liga.
          </li>
          <li>Enviar avisos e notificações sobre leads, visitas e a conta.</li>
          <li>Cobrar a assinatura, dar suporte e manter a segurança do serviço.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal titulo="Com quem os dados são compartilhados">
        <p>Só com os serviços que o CRM precisa para funcionar, cada um para a sua parte:</p>
        <ul>
          <li>Supabase, que hospeda o banco de dados e os arquivos, em servidores no Canadá.</li>
          <li>Vercel, que hospeda o site e o app.</li>
          <li>OpenAI, que processa as mensagens para a assistente responder e para transcrever áudios.</li>
          <li>
            O WhatsApp, pela conexão que o próprio corretor faz com o número dele. Essa conexão não é um serviço do
            WhatsApp nem da Meta.
          </li>
          <li>Os serviços que a imobiliária escolher ligar, como Gmail e anúncios da Meta.</li>
        </ul>
        <p>
          Como alguns desses serviços ficam fora do Brasil, há transferência internacional de dados, feita com
          fornecedores que adotam medidas de segurança compatíveis com a LGPD.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="Por quanto tempo">
        <p>
          Enquanto a conta da imobiliária ou do corretor estiver ativa. Quando a assinatura é cancelada, os dados
          ficam bloqueados por 90 dias, para o caso de a conta voltar ou de os dados serem exportados, e depois são
          apagados. Registros que a lei obriga a guardar, como os de cobrança, ficam pelo prazo da lei.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="Segurança">
        <p>
          Cada imobiliária só enxerga os próprios dados, e o gestor não lê as conversas dos corretores pelo CRM. O
          acesso é por login e senha, a conexão é criptografada e as ações importantes ficam registradas.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="Seus direitos">
        <p>
          Você pode pedir a confirmação, o acesso, a correção, a portabilidade ou a exclusão dos seus dados, e revogar
          um consentimento. Se você é cliente de uma imobiliária, o pedido vai primeiro para ela; nós ajudamos a
          cumprir.
        </p>
        <p>
          Para falar com a {nome}: <ContatoDaAstro />. Para apagar a sua conta, veja{" "}
          <Link href="/astro/excluir-conta" className="font-medium text-[var(--azul)] underline underline-offset-4">
            como excluir a conta
          </Link>
          .
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="Mudanças nesta política">
        <p>Quando esta política mudar, a data no topo muda junto, e avisamos no CRM se a mudança for importante.</p>
      </SecaoLegal>
    </PaginaLegal>
  );
}
