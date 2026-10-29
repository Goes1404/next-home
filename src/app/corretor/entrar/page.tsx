import { ehEnderecoSoDoPainel } from "@/lib/enderecosDoPainel";
import { MARCA_DA_PLATAFORMA } from "@/lib/marcaDaPlataforma";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { FormularioLogin } from "./FormularioLogin";
import { COR_DA_BARRA_DO_ACESSO } from "../ComportamentoDeApp";
import { LinkDaFolha, TelaDeAcesso } from "../TelaDeAcesso";

/**
 * Login da Astro Soluções — redesenhado em 29/10/2026 para o app no celular.
 *
 * No celular, a marca fica no alto, sobre a noite azul com a órbita do logo,
 * e o formulário numa folha clara presa ao pé da tela: o e-mail aparece sem
 * rolar, e o polegar alcança tudo. No computador, duas colunas (`telaDeAcesso.module.css`).
 *
 * A entrada é SEMPRE da plataforma (Astro Soluções), em qualquer endereço; a
 * imobiliária aparece depois do login, na barra do topo do painel. O endereço
 * só muda o pé: no site de um cliente há "Voltar para o site".
 *
 * A casca (céu animado + folha) é a mesma das outras telas de acesso:
 * `TelaDeAcesso.tsx`.
 */

type Rodape = "convite" | "site";

async function rodapeDoEndereco(): Promise<Rodape> {
  const host = (await headers()).get("host");
  return ehEnderecoSoDoPainel(host) ? "convite" : "site";
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { absolute: `Entrar · ${MARCA_DA_PLATAFORMA.nome}` },
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = { themeColor: COR_DA_BARRA_DO_ACESSO };

const RECURSOS = ["IA que responde seus leads no WhatsApp", "Funil, agenda de visitas e vendas", "A equipe inteira num lugar só"];

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ link?: string; next?: string | string[] }>;
}) {
  const parametros = await searchParams;
  const rodape = await rodapeDoEndereco();
  // Link do convite ou da recuperação que já foi usado, venceu ou chegou
  // adulterado (`/auth/confirmar`): explica e aponta a saída.
  const linkExpirado = parametros.link === "expirado";
  // Para onde voltar depois de entrar (o proxy manda quando `/plataforma`
  // abre sem sessão). Só repassado: a action confere com `destinoSeguro`.
  const next = typeof parametros.next === "string" ? parametros.next : undefined;

  return (
    <TelaDeAcesso
      titulo="Entrar"
      apoio="Use o e-mail do convite."
      chamada="Seus leads estão esperando."
      textoDaChamada={MARCA_DA_PLATAFORMA.apoio}
      recursos={RECURSOS}
      aviso={linkExpirado ? "Este link já foi usado ou expirou. Peça outro em 'Esqueci a senha'." : undefined}
      rodape={rodape === "site" ? <LinkDaFolha href="/">Voltar para o site</LinkDaFolha> : undefined}
    >
      <FormularioLogin next={next} />
    </TelaDeAcesso>
  );
}
