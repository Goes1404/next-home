/**
 * O 404 do site (fase 3): endereço de nenhum grupo, grupo encerrado e
 * página que não existe. A mesma página neutra do raiz, aqui porque o
 * `notFound()` dos layouts de grupo de rotas e das páginas é pego por esta
 * fronteira — com o HTML inteiro no servidor.
 */
export { default, metadata } from "../../not-found";
