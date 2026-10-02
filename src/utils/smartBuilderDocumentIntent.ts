const COPY_IMPORT_TERMS = [
  "copy",
  "import",
  "replicate",
  "recreate",
  "duplicate",
  "extract",
  "transcribe",
  "convert this pdf",
  "turn this pdf",
  "use this pdf",
  "use the pdf",
  "use this file",
  "use the file",
  "from this pdf",
  "from the pdf",
  "based on this pdf",
  "based on the pdf",
  "same scope",
  "same price",
  "same prices",
  "use the values",
  "use these values",
  "orcamento",
  "orçamento",
  "proposta",
  "copie",
  "copia",
  "copiar",
  "importe",
  "importar",
  "replicar",
  "recriar",
  "extrair",
  "transcrever",
  "converter esse pdf",
  "usar esse pdf",
  "usar este pdf",
  "use esse pdf",
  "use este pdf",
  "a partir desse pdf",
  "a partir deste pdf",
  "igual ao pdf",
  "igual no pdf",
  "iguais ao pdf",
  "iguais no pdf",
  "igual ao documento",
  "iguais ao documento",
  "igual no documento",
  "iguais no documento",
  "mesmo escopo",
  "mesmos valores",
  "usar os valores",
];

export function hasSmartBuilderDocumentImportIntent(message: string, hasAttachments: boolean) {
  if (!hasAttachments) return false;

  const normalized = String(message || "").toLowerCase();
  if (COPY_IMPORT_TERMS.some((term) => normalized.includes(term))) return true;

  const englishAllServicesPattern = /\b(?:create|add|make|generate|build)\b.*\b(?:all|every)\b.*\b(?:services?|line items?)\b.*\b(?:pdf|document|file|attachment|attached)\b/i;
  const portugueseAllServicesPattern = /\b(?:criar|crie|adicionar|adicione|gerar|gere|montar|monte)\b.*\b(?:todos?|todas?)\b.*\b(?:servi[cç]os?|itens?)\b.*\b(?:pdf|documento|arquivo|anexo|anexado)\b/i;
  const servicesLikeDocumentPattern = /\b(?:services?|servi[cç]os?|line items?|itens?)\b.*\b(?:same|like|from|based|igual|iguais|como|conforme)\b.*\b(?:pdf|document|documento|file|arquivo|attachment|anexo)\b/i;

  return englishAllServicesPattern.test(normalized)
    || portugueseAllServicesPattern.test(normalized)
    || servicesLikeDocumentPattern.test(normalized);
}

export function getExpectedDocumentServiceCount(documentContext: any) {
  const lineItems = Array.isArray(documentContext?.lineItems) ? documentContext.lineItems : [];
  const scopeGroups = Array.isArray(documentContext?.scopeGroups) ? documentContext.scopeGroups : [];

  return lineItems.length || scopeGroups.length || 0;
}
