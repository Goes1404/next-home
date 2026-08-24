"use client";

import { Camada } from "./Camada";

/**
 * Duas manchas de luz que atravessam a seção em velocidades diferentes.
 *
 * Existe para as seções cujo CONTEÚDO não pode se mover: chip de região é
 * alvo de clique, item de lazer é alvo de toque. Mover o fundo dá a mesma
 * profundidade sem tirar nada do lugar sob o dedo.
 *
 * `aria-hidden` e `pointer-events-none`: é decoração, e não pode roubar
 * clique de nada.
 *
 * A seção que recebe isto PRECISA ter `relative overflow-hidden` — sem o
 * corte, as manchas vazam para a seção vizinha e criam barra de rolagem
 * horizontal no celular.
 */
export function FundoEmCamadas({ intensidade = 1 }: { intensidade?: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <Camada
        velocidade={0.35 * intensidade}
        className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-brand-500/10 blur-3xl"
      >
        <span />
      </Camada>
      <Camada
        velocidade={-0.22 * intensidade}
        className="absolute -right-32 -bottom-40 h-[28rem] w-[28rem] rounded-full bg-acento-forte/10 blur-3xl"
      >
        <span />
      </Camada>
    </div>
  );
}
