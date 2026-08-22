import type { EmailInboundInput, LeadExtraido, PortalOrigem } from "./types";
import { extrairLeadViaRegex, identificarPortalOrigem } from "./regexFallback";
import { algumProvedorConfigurado, chamarLlmJson } from "@/lib/whatsapp/llm";
import { normalizarTelefoneBrasileiro } from "./phoneUtils";

const PROMPT_SISTEMA_MULTI = `Você é um extrator de leads imobiliários de alta precisão.
Sua missão é ler o e-mail (que pode conter 1 lead individual OU uma lista/tabela/relatório com múltiplos leads, até 100) e extrair TODOS os contatos válidos encontrados.

Você DEVE responder EXCLUSIVAMENTE um objeto JSON válido, sem texto antes ou depois, sem crases markdown ou formatação adicional, no seguinte formato:
{
  "leads": [
    {
      "nome": "Nome do Cliente",
      "telefone": "DDD + Telefone sem formatação ou formatado",
      "email": "email do cliente ou null",
      "imovelInteresse": "Nome do empreendimento/casa/apto ou null",
      "codigoReferencia": "Código ou ref do imóvel se mencionado ou null",
      "portalOrigem": "zap_imoveis" | "vivareal" | "olx" | "imovelweb" | "meta_ads" | "site_direto" | "email_outro",
      "mensagemOriginal": "Mensagem ou dúvida enviada pelo cliente ou null",
      "corretorMencionado": "Nome do corretor se citado no e-mail ou null"
    }
  ]
}`;

import { extrairVariosLeadsViaRegex } from "./regexFallback";

/**
 * Extrai um ou múltiplos leads de um e-mail pela cascata de IA, com
 * fallback por regex quando nenhum provedor responde.
 */
export async function extrairVariosLeadsComIA(email: EmailInboundInput): Promise<LeadExtraido[]> {
  const corpoTexto = email.text || email.html || "";
  const entradaCompleta = `Assunto: ${email.subject || ""}\nDe: ${email.from || ""}\nPara: ${email.to || ""}\n\nCorpo:\n${corpoTexto.slice(0, 10000)}`;

  if (algumProvedorConfigurado() && corpoTexto.trim().length > 10) {
    try {
      // Pela cascata (NVIDIA → Gemini): um e-mail de portal que chega junto
      // com outros dez não pode virar lead perdido porque um provedor
      // estourou cota naquele minuto.
      const resultado = await chamarLlmJson(
        `${PROMPT_SISTEMA_MULTI}\n\nE-mail a ser analisado:\n${entradaCompleta}`,
        { temperature: 0.1, orcamentoMs: 12_000 },
      );

      if (resultado.ok) {
        {
          const parsed = resultado.json as { leads?: unknown };
          const listaBruta = Array.isArray(parsed.leads)
            ? parsed.leads
            : Array.isArray(parsed)
              ? parsed
              : [parsed];

          const resultados: LeadExtraido[] = [];
          for (const item of listaBruta) {
            const telefoneNormalizado = normalizarTelefoneBrasileiro(item.telefone);
            if (telefoneNormalizado) {
              resultados.push({
                nome: (item.nome || "Lead Interessado").trim(),
                telefone: telefoneNormalizado,
                email: item.email || null,
                imovelInteresse: item.imovelInteresse || null,
                codigoReferencia: item.codigoReferencia || null,
                portalOrigem: (item.portalOrigem as PortalOrigem) || identificarPortalOrigem(email),
                mensagemOriginal: item.mensagemOriginal || `Contato via ${item.portalOrigem || "e-mail"}`,
                corretorMencionado: item.corretorMencionado || null,
              });
            }
          }

          if (resultados.length > 0) return resultados;
        }
      }
    } catch (err) {
      console.warn("[inbound/aiParser] Falha na chamada da IA, acionando fallback por regex:", err);
    }
  }

  // Fallback por Regex em lote
  return extrairVariosLeadsViaRegex(email);
}

/**
 * Extrai 1 lead (compatibilidade).
 */
export async function extrairLeadComIA(email: EmailInboundInput): Promise<LeadExtraido | null> {
  const lista = await extrairVariosLeadsComIA(email);
  return lista.length > 0 ? lista[0] : null;
}
