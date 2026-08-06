type WorkSiteSource = {
  location?: string | null;
  addressOffice?: string | null;
} | null | undefined;

function normalizeAddress(value?: string | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function getInvoiceWorkSiteAddress(
  workContext: WorkSiteSource,
  fallbackAddress?: string | null,
  projectAddress?: string | null,
) {
  return (
    normalizeAddress(projectAddress) ||
    normalizeAddress(workContext?.location) ||
    normalizeAddress(workContext?.addressOffice) ||
    normalizeAddress(fallbackAddress)
  );
}
