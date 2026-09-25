/**
 * O fundo do painel: a aurora (três manchas de luz que derivam devagar) e o
 * grão. Só marcação — todo o comportamento está em `globals.css`
 * ("Profundidade e movimento do painel").
 *
 * Fica atrás de tudo (`-z-10`, dentro do `isolate` do <main>) e é o que os
 * cartões translúcidos e o vidro-herói deixam transparecer — vidro sobre
 * fundo liso é só cinza. Antes eram dois `<div>` com `blur-3xl`: filtro de
 * desfoque repinta caro; aqui o desfoque é o próprio gradiente, e o que anima
 * é só `transform`, em camada própria.
 */
export function FundoDoPainel() {
  return (
    <>
      <div aria-hidden className="painel-aurora">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div aria-hidden className="painel-bolhas">
        <b />
        <b />
        <b />
        <b />
        <b />
      </div>
      <div aria-hidden className="painel-grao" />
    </>
  );
}
