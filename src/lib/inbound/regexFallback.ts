import type { EmailInboundInput, LeadExtraido, PortalOrigem } from "./types";
import { normalizarTelefoneBrasileiro } from "./phoneUtils";

/**
 * Remove tags HTML e decodifica entidades básicas para texto limpo.
 */
function htmlParaTexto(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*[\/]?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split("\n")
    .map((linha) => linha.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Identifica o portal de origem a partir do remetente, assunto ou corpo do e-mail.
 */
export function identificarPortalOrigem(email: EmailInboundInput): PortalOrigem {
  const haystack = `${email.from || ""} ${email.subject || ""} ${email.text || ""} ${email.html || ""}`.toLowerCase();

  if (haystack.includes("zapimoveis") || haystack.includes("zap imóveis") || haystack.includes("grupozap")) {
    return "zap_imoveis";
  }
  if (haystack.includes("vivareal") || haystack.includes("viva real")) {
    return "vivareal";
  }
  if (haystack.includes("olx.com.br") || haystack.includes("olx")) {
    return "olx";
  }
  if (haystack.includes("imovelweb")) {
    return "imovelweb";
  }
  if (haystack.includes("facebookmail") || haystack.includes("meta ads") || haystack.includes("lead ads")) {
    return "meta_ads";
  }
  if (haystack.includes("formulario") || haystack.includes("site next home") || haystack.includes("contato")) {
    return "site_direto";
  }

  return "email_outro";
}

/**
 * Extrator via Regex resiliente para emails estruturados de portais (suporta 1 ou múltiplos leads).
 */
export function extrairVariosLeadsViaRegex(email: EmailInboundInput): LeadExtraido[] {
  const texto = email.text || (email.html ? htmlParaTexto(email.html) : "");
  const assunto = email.subject || "";
  const portal = identificarPortalOrigem(email);

  if (!texto && !assunto) return [];

  // Se o e-mail tem estrutura de 1 lead detalhado (ex: e-mail de portal tradicional com "Nome:", "Telefone:"),
  // testa primeiro o extrator de lead único detalhado
  const leadUnico = extrairLeadViaRegex(email);

  // Conta quantos telefones distintos existem no texto
  const todosTelefones = (texto.match(/(?:\(?\d{2}\)?\s*)?9?\d{4}[-.\s]?\d{4}/g) || [])
    .map(normalizarTelefoneBrasileiro)
    .filter((t): t is string => Boolean(t));

  const telefonesUnicos = Array.from(new Set(todosTelefones));

  // Se só tem 1 telefone único e o leadUnico identificou nome válido, retorna ele
  if (telefonesUnicos.length <= 1 && leadUnico && leadUnico.nome !== "Lead Interessado") {
    return [leadUnico];
  }

  // Quebra o texto por blocos ou linhas para detectar múltiplos contatos
  const linhas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  const leads: LeadExtraido[] = [];
  const telefonesVistos = new Set<string>();

  const rotulosDescartar = [
    "telefone", "tel", "celular", "whats", "whatsapp", "fone", "contato",
    "email", "e-mail", "mail", "nome", "cliente", "lead", "interessado",
    "mensagem", "obs", "imovel", "imóvel", "ref"
  ];

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const matchTelefone = linha.match(/(?:\(?\d{2}\)?\s*)?9?\d{4}[-.\s]?\d{4}/);
    if (matchTelefone) {
      const telefone = normalizarTelefoneBrasileiro(matchTelefone[0]);
      if (telefone && !telefonesVistos.has(telefone)) {
        telefonesVistos.add(telefone);

        // Busca nome na mesma linha ou nas linhas adjacentes
        let nomeRaw = "";
        const matchNomeLinha = linha.match(/(?:nome|cliente|lead)[\s:]*([A-Za-zÀ-ÖØ-öø-ÿ\s]{3,40})/i);
        if (matchNomeLinha) {
          nomeRaw = matchNomeLinha[1];
        } else if (i > 0) {
          const linhaAnt = linhas[i - 1];
          const matchNomeAnt = linhaAnt.match(/(?:nome|cliente|lead)[\s:]*([A-Za-zÀ-ÖØ-öø-ÿ\s]{3,40})/i);
          if (matchNomeAnt) {
            nomeRaw = matchNomeAnt[1];
          } else if (/^[A-Za-zÀ-ÖØ-öø-ÿ\s]{3,40}$/.test(linhaAnt) && !rotulosDescartar.includes(linhaAnt.toLowerCase())) {
            nomeRaw = linhaAnt;
          }
        }

        if (!nomeRaw) {
          // Pega palavras antes do telefone se houver
          const partes = linha.split(matchTelefone[0])[0].replace(/[:\-–\s]+$/g, "").trim();
          if (partes.length >= 3 && partes.length <= 40 && !rotulosDescartar.includes(partes.toLowerCase())) {
            nomeRaw = partes;
          }
        }

        let nome = nomeRaw.replace(/^[:\-–\s]+|[:\-–\s]+$/g, "").trim();
        const nomesInvalidos = [
          "viva real", "vivareal", "zap", "zap imoveis", "zap imóveis", "grupozap",
          "olx", "imovelweb", "novo lead", "lead", ...rotulosDescartar
        ];
        if (nomesInvalidos.includes(nome.toLowerCase()) || nome.length < 2) {
          nome = "Lead Interessado";
        }

        const matchEmail = linha.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

        leads.push({
          nome,
          telefone,
          email: matchEmail ? matchEmail[0] : null,
          portalOrigem: portal,
          imovelInteresse: null,
          codigoReferencia: null,
          mensagemOriginal: `Contato ${leads.length + 1} recebido via ${portal}.`,
        });
      }
    }
  }

  if (leads.length > 0) return leads;
  return leadUnico ? [leadUnico] : [];
}

/**
 * Extrator de lead único via Regex (retrocompatibilidade).
 */
export function extrairLeadViaRegex(email: EmailInboundInput): LeadExtraido | null {
  const texto = email.text || (email.html ? htmlParaTexto(email.html) : "");
  const assunto = email.subject || "";
  const portal = identificarPortalOrigem(email);

  if (!texto && !assunto) return null;

  // 1. Extração de Telefone
  const regexTelefone =
    /(?:telefone|tel|celular|whats(?:app)?|fone|contato)[\s:]*([+]?[0-9\s().-]{8,20})/i;
  const matchTelefone = texto.match(regexTelefone);
  let telefoneRaw = matchTelefone ? matchTelefone[1] : null;

  if (!telefoneRaw) {
    const matchSolto = texto.match(/(?:\(?\d{2}\)?\s*)?9?\d{4}[-.\s]?\d{4}/);
    if (matchSolto) telefoneRaw = matchSolto[0];
  }

  const telefone = normalizarTelefoneBrasileiro(telefoneRaw);
  if (!telefone) return null;

  // 2. Extração de Nome
  const regexNomePrioritario =
    /(?:nome(?:\s+completo|\s+do\s+cliente)?|cliente|interessado|comprador|locat[aá]rio|remetente)[\s:]*([A-Za-zÀ-ÖØ-öø-ÿ.\s]{3,50})(?:\n|\r|<|$|\s{2,}|[-–|])/i;
  let matchNome = texto.match(regexNomePrioritario);

  if (!matchNome) {
    const regexNomeSecundario =
      /(?:lead)[\s:]+([A-Za-zÀ-ÖØ-öø-ÿ.\s]{3,50})(?:\n|\r|<|$|\s{2,}|[-–|])/i;
    matchNome = texto.match(regexNomeSecundario);
  }

  let nome = matchNome ? matchNome[1].trim() : "Lead Interessado";
  nome = nome.replace(/^[:\-–\s]+|[:\-–\s]+$/g, "").trim();

  const nomesInvalidos = ["viva real", "vivareal", "zap", "zap imoveis", "zap imóveis", "grupozap", "olx", "imovelweb", "novo lead", "lead"];
  if (nomesInvalidos.includes(nome.toLowerCase()) || nome.length < 2) {
    nome = "Lead Interessado";
  }

  // 3. Extração de E-mail
  const matchEmail = texto.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const emailCliente = matchEmail ? matchEmail[0] : null;

  // 4. Extração de Imóvel / Código de Referência
  const regexImovel =
    /(?:imóvel|imovel|empreendimento|anúncio|anuncio|código|ref(?:erência)?)[\s:]*([A-Za-z0-9À-ÖØ-öø-ÿ\s-]{3,60})(?:\n|\r|<|$|\s{2,}|[-–|])/i;
  const matchImovel = texto.match(regexImovel) || assunto.match(/(?:sobre|em|no|imóvel|ref)[\s:]+([A-Za-z0-9À-ÖØ-öø-ÿ\s-]{3,50})/i);
  const imovelInteresse = matchImovel ? matchImovel[1].trim() : null;

  // 5. Extração de Mensagem
  const regexMensagem =
    /(?:mensagem|observação|duvida|comentário)[\s:]*([^\n\r<]{5,300})/i;
  const matchMensagem = texto.match(regexMensagem);
  const mensagem = matchMensagem ? matchMensagem[1].trim() : `Contato recebido via ${portal}.`;

  return {
    nome,
    telefone,
    email: emailCliente,
    imovelInteresse,
    portalOrigem: portal,
    mensagemOriginal: mensagem,
    codigoReferencia: null,
  };
}

