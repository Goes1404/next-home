/**
 * A página ficou velha: a Server Action que ela chama não existe mais.
 *
 * Toda build do Next gera um ID por Server Action. Uma aba aberta durante um
 * deploy (ou durante um `npm run build` local) continua com o JavaScript do
 * build anterior e manda o ID antigo; o servidor responde **404 no POST da
 * própria rota da página**, e o `await` da action LANÇA no cliente.
 *
 * Sem separar esse caso, ele cai no `catch` genérico de rede — e "Sem
 * conexão" é a pior frase possível aqui, por duas razões:
 *
 * 1. É falsa. A conexão está boa; foi o app que mudou por baixo da aba.
 * 2. Manda tentar de novo, que é justamente o que NÃO resolve: enquanto a
 *    aba não recarregar, o ID continua o mesmo e o erro se repete para
 *    sempre. O corretor conclui que o recurso está quebrado.
 *
 * No Estúdio o custo é maior ainda: a imagem já foi gerada, carimbada,
 * guardada e PAGA antes desta etapa. Dizer "sem conexão" faz alguém pagar de
 * novo por uma arte que já está na galeria.
 *
 * Módulo puro de propósito — a classificação é a parte que erra, e precisa de
 * teste sem navegador. Mesma razão de `classificarFalhaDeStorage` e de
 * `motivoDoErro` viverem fora do `fetch`.
 */

/**
 * As duas frases vêm do próprio Next (`failed-to-find-server-action`). São
 * casadas em minúsculas e por trecho porque a redação muda entre versões — o
 * que não muda é o nome do mecanismo e a menção ao build de outra versão.
 */
const ASSINATURAS = [
  "failed to find server action",
  "older or newer deployment",
  "an unexpected response was received from the server", // o mesmo caso, quando a resposta não é JSON
];

export function ehActionDeOutroBuild(erro: unknown): boolean {
  const texto =
    erro instanceof Error
      ? `${erro.message} ${erro.name}`
      : typeof erro === "string"
        ? erro
        : "";
  const alvo = texto.toLowerCase();
  return ASSINATURAS.some((a) => alvo.includes(a));
}

/**
 * O texto que a tela mostra. Diz as três coisas que faltavam: que o trabalho
 * NÃO se perdeu, que tentar de novo não adianta, e qual é o gesto que resolve.
 */
export function avisoDePaginaVelha(oQueJaFoiSalvo?: string): string {
  const salvo = oQueJaFoiSalvo ? ` ${oQueJaFoiSalvo}` : "";
  return `O aplicativo foi atualizado enquanto esta página estava aberta.${salvo} Recarregue a página (Ctrl+Shift+R) para continuar — tentar de novo aqui vai dar o mesmo erro.`;
}
