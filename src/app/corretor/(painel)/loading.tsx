import { Esqueleto, EsqueletoCartao, AvisoDeCarregamento } from "./_componentes/Esqueleto";

/**
 * A espera do Início.
 *
 * Vale para a navegação de rota inteira; dentro da página, cada bloco tem o
 * próprio `<Suspense>`, então na prática esta tela aparece por muito pouco
 * tempo — o que se quer é que o painel NUNCA fique parado sem dizer nada.
 */
export default function CarregandoInicio() {
  return (
    <div className="space-y-8">
      <AvisoDeCarregamento>Carregando seu painel…</AvisoDeCarregamento>
      <div>
        <Esqueleto className="h-8 w-48" />
        <Esqueleto className="mt-2 h-4 w-64" />
      </div>
      <EsqueletoCartao linhas={4} />
      <EsqueletoCartao linhas={2} />
    </div>
  );
}
