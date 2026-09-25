import { Prisma } from "@prisma/client";

type CatalogServiceReference = {
  id_service?: string | null;
};

type CatalogServiceLookup = Pick<Prisma.TransactionClient, "service">;

const normalizeRequestedId = (value?: string | null) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
};

export async function resolveValidEstimateCatalogServiceIds(
  tx: CatalogServiceLookup,
  companyId: string,
  services: ReadonlyArray<CatalogServiceReference>,
  context: string
) {
  const requestedIds = Array.from(new Set(
    services
      .map((service) => normalizeRequestedId(service.id_service))
      .filter((id): id is string => Boolean(id))
  ));

  if (requestedIds.length === 0) return new Set<string>();

  const catalogServices = await tx.service.findMany({
    where: {
      id: { in: requestedIds },
      OR: [
        { company_id: companyId },
        { company_id: null },
      ],
    },
    select: { id: true },
  });

  const validIds = new Set(catalogServices.map((service) => service.id));
  const invalidIds = requestedIds.filter((id) => !validIds.has(id));

  if (invalidIds.length > 0) {
    console.warn("[EstimateCatalogServiceValidation] Ignoring invalid catalog service references", {
      context,
      companyId,
      invalidCount: invalidIds.length,
      invalidIds: invalidIds.slice(0, 10),
    });
  }

  return validIds;
}

export function sanitizeEstimateCatalogServiceId(
  value: string | null | undefined,
  validIds: ReadonlySet<string>
) {
  const normalized = normalizeRequestedId(value);
  return normalized && validIds.has(normalized) ? normalized : null;
}
