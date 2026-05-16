export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function trimForWhatsapp(value: string, maxLength: number) {
  const text = value.trim();
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    const slice = remaining.slice(0, maxLength);
    const breakAt = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(". "), slice.lastIndexOf(" "));
    const safeBreak = breakAt > maxLength * 0.55 ? breakAt + 1 : maxLength;
    chunks.push(remaining.slice(0, safeBreak).trim());
    remaining = remaining.slice(safeBreak).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

export function isCloseConversationRequest(value: string) {
  const text = normalizeText(value);
  if (!text) return false;

  const exactMatches = new Set([
    "encerrar",
    "finalizar",
    "acabou",
    "era isso",
    "era so isso",
    "so isso",
    "nao preciso mais",
    "nao precisa mais",
    "pode finalizar",
    "pode encerrar",
    "fecha o atendimento",
    "encerrar atendimento",
    "finalizar atendimento",
    "obrigado era isso",
    "valeu era isso",
    "thanks thats it",
    "that is all",
    "thats all",
    "done",
  ]);

  if (exactMatches.has(text)) return true;

  return [
    /\b(pode|pode sim|vamos)\s+(encerrar|finalizar)\b/,
    /\b(nao|n)\s+(preciso|quero)\s+mais\b/,
    /\b(era|e)\s+(so\s+)?isso\b/,
    /\b(fechar|encerra|finaliza)\s+(o\s+)?atendimento\b/,
  ].some((pattern) => pattern.test(text));
}

export function extractContactEmail(value: string) {
  return value.match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0] || null;
}

