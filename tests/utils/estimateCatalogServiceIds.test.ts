import {
  resolveValidEstimateCatalogServiceIds,
  sanitizeEstimateCatalogServiceId,
} from "../../src/utils/estimateCatalogServiceIds";

describe("estimate catalog service id validation", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("skips the catalog query when no service reference was supplied", async () => {
    const findMany = jest.fn();

    const validIds = await resolveValidEstimateCatalogServiceIds(
      { service: { findMany } } as any,
      "company-1",
      [{ id_service: null }, { id_service: "" }, {}],
      "test"
    );

    expect(findMany).not.toHaveBeenCalled();
    expect(validIds.size).toBe(0);
  });

  it("keeps company and legacy global catalog ids while rejecting temporary, missing and cross-company ids", async () => {
    const warning = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const findMany = jest.fn().mockResolvedValue([
      { id: "company-service" },
      { id: "global-service" },
    ]);

    const validIds = await resolveValidEstimateCatalogServiceIds(
      { service: { findMany } } as any,
      "company-1",
      [
        { id_service: " company-service " },
        { id_service: "global-service" },
        { id_service: "draft-service-0" },
        { id_service: "missing-or-cross-company" },
        { id_service: "draft-service-0" },
      ],
      "estimate.create-full"
    );

    expect(findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: [
            "company-service",
            "global-service",
            "draft-service-0",
            "missing-or-cross-company",
          ],
        },
        OR: [
          { company_id: "company-1" },
          { company_id: null },
        ],
      },
      select: { id: true },
    });
    expect([...validIds]).toEqual(["company-service", "global-service"]);
    expect(sanitizeEstimateCatalogServiceId(" company-service ", validIds)).toBe("company-service");
    expect(sanitizeEstimateCatalogServiceId("global-service", validIds)).toBe("global-service");
    expect(sanitizeEstimateCatalogServiceId("draft-service-0", validIds)).toBeNull();
    expect(sanitizeEstimateCatalogServiceId("missing-or-cross-company", validIds)).toBeNull();
    expect(warning).toHaveBeenCalledWith(
      "[EstimateCatalogServiceValidation] Ignoring invalid catalog service references",
      expect.objectContaining({
        context: "estimate.create-full",
        companyId: "company-1",
        invalidCount: 2,
        invalidIds: ["draft-service-0", "missing-or-cross-company"],
      })
    );
  });
});
