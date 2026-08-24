"use client";

/**
 * Grade compartilhada pelas duas origens (PDF e Drive). Só cuida de
 * ESCOLHER — quem grava é quem chamou. É por isso que recebe as prévias
 * prontas: no PDF elas vêm em data URL gerada no servidor, no Drive vêm do
 * thumbnail do próprio Google, e a grade não precisa saber a diferença.
 */

export type ItemDaGrade = {
  chave: string;
  preview: string;
  legenda: string;
  aviso?: string;
};

export type EscolhaCuradoria = {
  chave: string;
  incluir: boolean;
  tipo: "foto" | "planta";
  capa: boolean;
};

export function GradeCuradoria({
  itens,
  escolhas,
  aoMudar,
}: {
  itens: ItemDaGrade[];
  escolhas: Record<string, EscolhaCuradoria>;
  aoMudar: (escolhas: Record<string, EscolhaCuradoria>) => void;
}) {
  const trocar = (chave: string, mudanca: Partial<EscolhaCuradoria>) => {
    const atual = escolhas[chave];
    if (!atual) return;

    const proximo = { ...escolhas, [chave]: { ...atual, ...mudanca } };

    // Capa é uma só: marcar uma desmarca a anterior. E capa que não entra na
    // galeria não faz sentido, então marcar capa também marca "usar".
    if (mudanca.capa) {
      proximo[chave] = { ...proximo[chave], incluir: true };
      for (const outra of Object.keys(proximo)) {
        if (outra !== chave) proximo[outra] = { ...proximo[outra], capa: false };
      }
    }

    aoMudar(proximo);
  };

  const trocarTodas = (incluir: boolean) => {
    aoMudar(Object.fromEntries(Object.entries(escolhas).map(([k, e]) => [k, { ...e, incluir }])));
  };

  const marcados = Object.values(escolhas).filter((e) => e.incluir).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-fluid-xs text-apoio">
          <strong className="text-corpo">{marcados}</strong> de {itens.length} selecionadas
        </p>
        <div className="flex gap-3 text-fluid-xs">
          <button type="button" className="min-h-[44px] px-2 text-acento font-bold" onClick={() => trocarTodas(true)}>
            Marcar todas
          </button>
          <button type="button" className="min-h-[44px] px-2 text-apoio" onClick={() => trocarTodas(false)}>
            Limpar
          </button>
        </div>
      </div>

      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {itens.map((item) => {
          const escolha = escolhas[item.chave];
          const dentro = escolha?.incluir ?? false;

          return (
            <li
              key={item.chave}
              className={`rounded-2xl overflow-hidden border transition-all ${
                escolha?.capa
                  ? "border-acento ring-acento ring-2"
                  : dentro
                    ? "border-linha-forte"
                    : "border-linha opacity-55"
              }`}
            >
              <button
                type="button"
                onClick={() => trocar(item.chave, { incluir: !dentro })}
                className="block w-full aspect-[4/3] bg-campo relative"
                aria-pressed={dentro}
                aria-label={`${dentro ? "Tirar" : "Usar"} ${item.legenda}`}
              >
                {/* Prévia é data URL (PDF) ou thumbnail do Google (Drive):
                    nenhuma das duas passa pelo otimizador do next/image. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.preview} alt={item.legenda} className="h-full w-full object-cover" />
                {dentro ? null : (
                  <span className="absolute inset-0 flex items-center justify-center bg-fundo/45 text-fluid-xs font-bold text-corpo">
                    fora
                  </span>
                )}
              </button>

              <div className="p-2 space-y-2">
                <div className="flex gap-1">
                  {(["foto", "planta"] as const).map((tipo) => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => trocar(item.chave, { tipo })}
                      className={`flex-1 min-h-[36px] rounded-lg text-fluid-xs font-bold transition-colors ${
                        escolha?.tipo === tipo ? "bg-acento text-white" : "bg-campo text-apoio"
                      }`}
                    >
                      {tipo === "foto" ? "Foto" : "Planta"}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => trocar(item.chave, { capa: true })}
                  className={`w-full min-h-[36px] rounded-lg text-fluid-xs transition-colors ${
                    escolha?.capa ? "bg-acento/15 text-acento font-bold" : "text-tenue"
                  }`}
                >
                  {escolha?.capa ? "É a capa" : "Usar como capa"}
                </button>

                <p className="text-fluid-xs text-tenue truncate" title={item.legenda}>
                  {item.legenda}
                </p>
                {item.aviso ? <p className="text-fluid-xs text-apoio">{item.aviso}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
