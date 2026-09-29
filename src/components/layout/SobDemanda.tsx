"use client";

import dynamic from "next/dynamic";

/**
 * Peças do layout que não aparecem na primeira tela vão sob demanda: o
 * JavaScript delas chega depois da hidratação, e não entra na conta de peso
 * da rota (`scripts/bundleTeto.mjs`).
 *
 * `ssr: false` é seguro nas duas porque nenhuma pinta nada no servidor: o
 * aviso de versão só aparece depois de um deploy, e a barra de favoritos lê o
 * `localStorage`, que o servidor não tem.
 */
export const AvisoDeVersaoNovaSobDemanda = dynamic(
  () => import("./AvisoDeVersaoNova").then((m) => m.AvisoDeVersaoNova),
  { ssr: false },
);

export const BarraDeFavoritosSobDemanda = dynamic(
  () => import("../empreendimento/BarraDeFavoritos").then((m) => m.BarraDeFavoritos),
  { ssr: false },
);
