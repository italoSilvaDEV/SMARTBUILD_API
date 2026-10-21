/**
 * Detecta o idioma da mensagem (pt, en ou es) por palavras frequentes.
 * O modelo pequeno tende a seguir o idioma da interface ou dos dados;
 * decidir aqui deixa a regra determinística.
 */

const WORDS: Record<"pt" | "en" | "es", string[]> = {
  pt: ["que", "não", "nao", "como", "eu", "tenho", "meu", "minha", "quantos", "quantas", "qual", "onde", "você", "voce", "uma", "para", "por", "com", "está", "esta", "são", "sao", "fazer", "faço", "faco", "projetos", "faturas", "orçamento", "também", "então", "isso", "posso", "preciso", "do", "da", "dos", "das", "no", "na"],
  en: ["the", "how", "what", "where", "which", "do", "does", "i", "my", "is", "are", "can", "many", "much", "have", "has", "to", "of", "and", "in", "on", "for", "with", "this", "that", "why", "projects", "invoices", "show", "me", "you", "your", "it"],
  es: ["que", "qué", "cómo", "como", "cuántos", "cuantos", "cuántas", "dónde", "donde", "cuál", "tengo", "mi", "mis", "yo", "es", "son", "puedo", "para", "por", "con", "una", "el", "los", "las", "del", "proyectos", "facturas", "clientes", "hacer", "también", "está", "y", "en"],
};

export function detectLanguage(text: string): "pt" | "en" | "es" | null {
  const tokens = text
    .toLowerCase()
    .split(/[^a-záéíóúâêôãõçñü¿¡]+/i)
    .filter(Boolean);
  if (!tokens.length) return null;

  const score = { pt: 0, en: 0, es: 0 };
  for (const token of tokens) {
    (Object.keys(WORDS) as (keyof typeof WORDS)[]).forEach((lang) => {
      if (WORDS[lang].includes(token)) score[lang] += 1;
    });
  }
  if (/[ãõç]/.test(text)) score.pt += 2;
  if (/[ñ¿¡]/.test(text)) score.es += 2;

  const ranked = (Object.entries(score) as ["pt" | "en" | "es", number][]).sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] === 0 || ranked[0][1] === ranked[1][1]) return null;
  return ranked[0][0];
}

export const LANGUAGE_NAMES: Record<string, string> = { pt: "português do Brasil", en: "inglês (English)", es: "espanhol (Español)" };
