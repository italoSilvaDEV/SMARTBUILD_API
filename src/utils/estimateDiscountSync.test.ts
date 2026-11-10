import { syncEstimateDiscountedServices } from "./estimateDiscountSync";

const service = {
  id: "estimate-service-1",
  name: "Carpentry",
  description: "Doors and trim",
  quantity: 1,
  unitPrice: 22378,
  lineTotal: 22378,
  originalUnitPrice: 22378,
  originalLineTotal: 22378,
  notes: null,
  id_service: null,
  hours: 1,
  price: 22378,
  start_date: null,
  deadline: null,
  pos: 0,
};

function setup(legacyMatches: Array<{ id: string }>) {
  const db = {
    estimate: {
      findUnique: jest.fn().mockResolvedValue({
        id: "estimate-1",
        status: "approved",
        type_estimate: "estimateProject",
        projectId: "project-1",
        project: { company_id: "company-1" },
        amountPaid: 0,
        markupType: null,
        markupValue: null,
        discountType: null,
        discountValue: null,
        depositType: null,
        depositValue: null,
        serviceProjects: [service],
      }),
      update: jest.fn(),
    },
    estimateServiceProject: { update: jest.fn() },
    serviceProject: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue(legacyMatches),
      update: jest.fn(),
      create: jest.fn(),
    },
  };
  return db;
}

describe("legacy estimate service synchronization", () => {
  it("links the only exact unlinked project service without replacing its work history", async () => {
    const db = setup([{ id: "original-project-service" }]);
    await syncEstimateDiscountedServices(db, "estimate-1");

    expect(db.serviceProject.findMany).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        estimateServiceId: null,
        name: "Carpentry",
        description: "Doors and trim",
        price: 22378,
        hours: 1,
      },
      select: { id: true },
      take: 2,
    });
    expect(db.serviceProject.update).toHaveBeenCalledWith({
      where: { id: "original-project-service" },
      data: { estimateServiceId: "estimate-service-1" },
    });
    expect(db.serviceProject.create).not.toHaveBeenCalled();
  });

  it.each([
    { matches: [] as Array<{ id: string }> },
    { matches: [{ id: "one" }, { id: "two" }] },
  ])(
    "creates a separate service when the legacy match is absent or ambiguous: $matches",
    async ({ matches }) => {
      const db = setup(matches);
      await syncEstimateDiscountedServices(db, "estimate-1");
      expect(db.serviceProject.update).not.toHaveBeenCalled();
      expect(db.serviceProject.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId: "project-1",
          estimateServiceId: "estimate-service-1",
        }),
      });
    }
  );
});
