import type { Metadata } from "next";
import { MARCA_DA_PLATAFORMA } from "@/lib/marcaDaPlataforma";
import { SECOES_DOS_TERMOS, TERMOS_SAO_RASCUNHO, VERSAO_DOS_TERMOS } from "@/lib/termos/termos";
import { PaginaLegal, SecaoLegal } from "../_componentes/PaginaLegal";

/**
 * Os termos de uso em página pública (28/10/2026), para a Play Store e para
 * quem ainda não entrou. O texto é O MESMO que o painel pede para aceitar
 * (`src/lib/termos/termos.ts`): uma fonte só, para não existirem dois termos.
 */
export const metadata: Metadata = {
  title: { absolute: `Termos de uso · ${MARCA_DA_PLATAFORMA.nome}` },
  description: `As regras de uso do CRM da ${MARCA_DA_PLATAFORMA.nome}.`,
};

function dataDaVersao(versao: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(versao);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : versao;
}

export default function TermosDaAstro() {
  return (
    <PaginaLegal
      titulo="Termos de uso"
      atualizadaEm={dataDaVersao(VERSAO_DOS_TERMOS)}
      introducao={
        <p>
          Estas são as regras de uso do CRM da {MARCA_DA_PLATAFORMA.nome}. O mesmo texto é apresentado para aceite no
          primeiro acesso.
          {TERMOS_SAO_RASCUNHO ? " Ele ainda passará por revisão jurídica." : ""}
        </p>
      }
    >
      {SECOES_DOS_TERMOS.map((secao) => (
        <SecaoLegal key={secao.titulo} titulo={secao.titulo}>
          {secao.paragrafos.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </SecaoLegal>
      ))}
    </PaginaLegal>
  );
}
