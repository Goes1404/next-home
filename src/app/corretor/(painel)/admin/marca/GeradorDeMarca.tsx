"use client";

import { useMemo, useState } from "react";
import { lerMarca, type Marca } from "@/lib/marca";

type Props = { atual: Marca };

const CAMPO = "w-full rounded-xl border border-linha-forte bg-campo px-3 py-2.5 text-fluid-sm text-titulo outline-none";

/**
 * Monta o valor de `NEXT_PUBLIC_MARCA` a partir de um formulário. Nada é
 * gravado daqui: a marca é da INSTALAÇÃO, e muda com a variável na Vercel e
 * um redeploy. O que sai do formulário passa por `lerMarca` na tela, o
 * mesmo leitor do site — o que ele descartar aparece como aviso antes de ir
 * para a Vercel.
 */
export function GeradorDeMarca({ atual }: Props) {
  const [m, setM] = useState({
    nome: atual.nome ?? "",
    nomeCompleto: atual.nomeCompleto ?? "",
    wordmark1: atual.wordmark?.[0] ?? "",
    wordmark2: atual.wordmark?.[1] ?? "",
    creci: atual.creci ?? "",
    descricao: atual.descricao ?? "",
    assistente: atual.assistente ?? "",
    logradouro: atual.endereco?.logradouro ?? "",
    bairro: atual.endereco?.bairro ?? "",
    cidade: atual.endereco?.cidade ?? "",
    uf: atual.endereco?.uf ?? "",
    cep: atual.endereco?.cep ?? "",
    lat: String(atual.endereco?.lat ?? ""),
    lng: String(atual.endereco?.lng ?? ""),
    whatsapp: (atual.whatsapp ?? []).map((w) => w.numero).join(", "),
    instagram: atual.social?.instagram ?? "",
    facebook: atual.social?.facebook ?? "",
    regioes: (atual.regioes ?? []).join(", "),
  });
  const [copiado, setCopiado] = useState(false);

  const json = useMemo(() => {
    const lista = (t: string) => t.split(",").map((x) => x.trim()).filter(Boolean);
    const obj = {
      nome: m.nome,
      nomeCompleto: m.nomeCompleto,
      wordmark: [m.wordmark1, m.wordmark2],
      creci: m.creci,
      descricao: m.descricao,
      assistente: m.assistente,
      endereco: {
        logradouro: m.logradouro,
        bairro: m.bairro,
        cidade: m.cidade,
        uf: m.uf,
        cep: m.cep,
        lat: Number(m.lat.replace(",", ".")),
        lng: Number(m.lng.replace(",", ".")),
      },
      whatsapp: lista(m.whatsapp).map((n) => {
        const d = n.replace(/\D/g, "");
        const num = d.length === 10 || d.length === 11 ? `55${d}` : d;
        const local = num.slice(2);
        return { numero: num, label: local.length === 11 ? `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}` : local };
      }),
      social: { instagram: m.instagram, facebook: m.facebook },
      regioes: lista(m.regioes),
    };
    return JSON.stringify(lerMarca(JSON.stringify(obj)));
  }, [m]);
  const lido = lerMarca(json);
  const faltando = [
    !lido.nome && "nome",
    !lido.wordmark && "logotipo em texto (as duas partes)",
    !lido.creci && "CRECI",
    !lido.endereco && "endereço completo com latitude e longitude",
    !lido.whatsapp && "WhatsApp",
  ].filter(Boolean);

  const campo = (k: keyof typeof m, rotulo: string, extra = "") => (
    <label className={`block ${extra}`}>
      <span className="text-fluid-xs text-apoio">{rotulo}</span>
      <input value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} className={`mt-1 ${CAMPO}`} />
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="cartao grid gap-3 p-4 sm:grid-cols-2">
        {campo("nome", "Nome curto (ex.: Next Home)")}
        {campo("nomeCompleto", "Razão social / nome completo")}
        {campo("wordmark1", "Logotipo em texto — primeira parte")}
        {campo("wordmark2", "Logotipo em texto — parte destacada")}
        {campo("creci", "CRECI da imobiliária")}
        {campo("assistente", "Nome padrão da assistente de IA")}
        {campo("descricao", "Descrição (SEO)", "sm:col-span-2")}
        {campo("logradouro", "Endereço (rua, número)", "sm:col-span-2")}
        {campo("bairro", "Bairro")}
        {campo("cidade", "Cidade")}
        {campo("uf", "UF")}
        {campo("cep", "CEP")}
        {campo("lat", "Latitude")}
        {campo("lng", "Longitude")}
        {campo("whatsapp", "WhatsApp (separe por vírgula)", "sm:col-span-2")}
        {campo("instagram", "Instagram (https://…)")}
        {campo("facebook", "Facebook (https://…)")}
        {campo("regioes", "Regiões de atuação (separe por vírgula; a primeira é a principal)", "sm:col-span-2")}
      </div>
      {faltando.length > 0 && (
        <p role="status" className="text-fluid-xs text-alerta">
          Faltando (o site usa o padrão da Next Home nesses campos): {faltando.join(", ")}.
        </p>
      )}
      <div className="cartao space-y-2 p-4">
        <p className="text-fluid-sm font-semibold text-titulo">NEXT_PUBLIC_MARCA</p>
        <pre className="max-h-48 overflow-auto rounded-xl bg-vidro p-3 text-[12px] break-all whitespace-pre-wrap text-corpo">{json}</pre>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(json);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            } catch {
              /* sem permissão: o texto está selecionável acima */
            }
          }}
          className="min-h-11 rounded-xl bg-acento px-4 text-fluid-xs font-bold text-sobre-cor"
        >
          {copiado ? "Copiado!" : "Copiar valor"}
        </button>
      </div>
    </div>
  );
}
