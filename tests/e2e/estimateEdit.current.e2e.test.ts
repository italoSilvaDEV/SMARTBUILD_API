/// <reference types="jest" />

import express from "express";

const request = require("supertest");

type RecordMap = Record<string, any>;

const state = {
  estimates: [] as any[],
  projects: [] as any[],
  clients: [] as any[],
  estimateServices: [] as any[],
  serviceProjects: [] as any[],
  pdfProjects: [] as any[],
  imagesAttachments: [] as any[],
  serviceUpdates: 0,
  failOnServiceUpdateCall: 0,
};

const seedEstimateForEdit = () => {
  state.clients = [{
    id: "client-1",
    company_id: "company-1",
    name: "Ada Homeowner",
    email: "ada@example.com",
    phone: "555-0101",
  }];
  state.projects = [{
    id: "project-1",
    company_id: "company-1",
    client_id: "client-1",
    workContextId: "work-context-1",
    location: "123 Main St",
    lat: "40.7128",
    log: "-74.0060",
    radius: 25,
  }];
  state.estimates = [{
    id: "estimate-1",
    number: "1001",
    projectId: "project-1",
    status: "pending",
    type_estimate: "estimate",
    totalAmount: 300,
    finalAmount: 300,
    balanceDue: 300,
    amountPaid: 0,
    description: "Old intro",
    terms: "Old terms",
    multi_emails: "old@example.com",
    date_creation: new Date("2026-07-01T12:00:00.000Z"),
    discountType: null,
    discountValue: null,
    discountAmount: null,
  }];
  state.estimateServices = [
    {
      id: "estimate-service-1",
      estimateId: "estimate-1",
      name: "Old Roof",
      description: "Old roof description",
      quantity: 1,
      unitPrice: 200,
      lineTotal: 200,
      originalUnitPrice: 200,
      originalLineTotal: 200,
      notes: "Old roof description",
      hours: 1,
      price: 200,
      pos: 0,
    },
    {
      id: "estimate-service-2",
      estimateId: "estimate-1",
      name: "Remove Me",
      description: "Old delete description",
      quantity: 1,
      unitPrice: 100,
      lineTotal: 100,
      originalUnitPrice: 100,
      originalLineTotal: 100,
      notes: "Old delete description",
      hours: 1,
      price: 100,
      pos: 1,
    },
  ];
  state.serviceProjects = [{
    id: "service-project-1",
    projectId: "project-1",
    estimateServiceId: "estimate-service-2",
    name: "Remove Me",
  }];
  state.pdfProjects = [{
    id: "pdf-1",
    estimate_id: "estimate-1",
    project_id: "project-1",
    original_file_name: "old-estimate.pdf",
    uri: "s3/old-estimate.pdf",
    templateNumber: 1,
  }];
  state.imagesAttachments = [];
  state.serviceUpdates = 0;
  state.failOnServiceUpdateCall = 0;
};

const currentEditPayload = {
  fields: {
    description: "New intro",
    terms: "New terms",
    multi_emails: "client@example.com,owner@example.com",
    date_creation: "2026-07-06T12:00:00.000Z",
    totalAmount: 400,
    discountType: "fixed",
    discountValue: 25,
    workContextId: "work-context-1",
  },
  services: {
    update: [{
      id: "estimate-service-1",
      name: "Roof Repair",
      description: "Updated roof description",
      quantity: 2,
      unitPrice: 150,
      lineTotal: 300,
      hours: 2,
      price: 150,
      pos: 0,
    }],
    create: [{
      name: "Cleanup",
      description: "Site cleanup",
      quantity: 1,
      unitPrice: 100,
      lineTotal: 100,
      hours: 1,
      price: 100,
      pos: 1,
    }],
    delete: ["estimate-service-2"],
  },
  pdf: {
    templateNumber: 2,
  },
};

const comparableState = () => ({
  estimate: {
    description: state.estimates[0].description,
    terms: state.estimates[0].terms,
    multi_emails: state.estimates[0].multi_emails,
    totalAmount: state.estimates[0].totalAmount,
    finalAmount: state.estimates[0].finalAmount,
    balanceDue: state.estimates[0].balanceDue,
    discountType: state.estimates[0].discountType,
    discountValue: state.estimates[0].discountValue,
    discountAmount: state.estimates[0].discountAmount,
  },
  project: {
    workContextId: state.projects[0].workContextId,
    location: state.projects[0].location,
    lat: state.projects[0].lat,
    log: state.projects[0].log,
    radius: state.projects[0].radius,
  },
  services: state.estimateServices.map((service) => ({
    name: service.name,
    description: service.description,
    quantity: service.quantity,
    unitPrice: service.unitPrice,
    lineTotal: service.lineTotal,
    originalUnitPrice: service.originalUnitPrice,
    originalLineTotal: service.originalLineTotal,
    hours: service.hours,
    price: service.price,
    pos: service.pos,
  })),
  serviceProjects: state.serviceProjects.map((serviceProject) => ({
    estimateServiceId: serviceProject.estimateServiceId,
  })),
  pdf: {
    original_file_name: state.pdfProjects[0].original_file_name,
    templateNumber: state.pdfProjects[0].templateNumber,
  },
});

const mockPrisma: RecordMap = {
  $transaction: jest.fn(async (callback: (tx: any) => Promise<any>) => {
    const snapshot = JSON.parse(JSON.stringify(state));
    try {
      return await callback(mockPrisma);
    } catch (error) {
      Object.assign(state, snapshot);
      throw error;
    }
  }),
  estimate: {
    findUnique: jest.fn(async ({ where, select, include }: any) => {
      const estimate = state.estimates.find((item) => item.id === where.id);
      if (!estimate) return null;
      const project = state.projects.find((item) => item.id === estimate.projectId);
      const full = {
        ...estimate,
        project: project ? {
          ...project,
          client: state.clients.find((item) => item.id === project.client_id),
          company: { id: project.company_id, name: "ACME Construction", signature: null },
          workContext: { id: project.workContextId, Name: "Ada Homeowner" },
        } : null,
        serviceProjects: state.estimateServices.filter((service) => service.estimateId === estimate.id),
      };
      if (select?.project) {
        return {
          id: estimate.id,
          status: estimate.status,
          type_estimate: estimate.type_estimate,
          clientSignature: estimate.clientSignature,
          project: { company_id: project?.company_id },
        };
      }
      return include || select?.serviceProjects ? full : full;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const estimate = state.estimates.find((item) => item.id === where.id);
      Object.assign(estimate, data);
      return estimate;
    }),
  },
  project: {
    update: jest.fn(async ({ where, data }: any) => {
      const project = state.projects.find((item) => item.id === where.id);
      Object.assign(project, data);
      return project;
    }),
  },
  client: {
    findFirst: jest.fn(async ({ where }: any) => {
      return state.clients.find((item) => item.id === where.id && item.company_id === where.company_id) || null;
    }),
  },
  workContext: {
    findFirst: jest.fn(async ({ where }: any) => {
      if (where.id === "work-context-1" && where.clientId === "client-1") {
        return { id: "work-context-1" };
      }
      return null;
    }),
  },
  estimateServiceProject: {
    findUnique: jest.fn(async ({ where, select }: any) => {
      const service = state.estimateServices.find((item) => item.id === where.id);
      if (!service) return null;
      const estimate = state.estimates.find((item) => item.id === service.estimateId);
      const project = state.projects.find((item) => item.id === estimate?.projectId);
      if (select?.estimateId) {
        return {
          estimateId: service.estimateId,
          estimate: { project: { company_id: project?.company_id } },
        };
      }
      return {
        ...service,
        estimate: { project: { company_id: project?.company_id } },
      };
    }),
    aggregate: jest.fn(async ({ where }: any) => {
      const positions = state.estimateServices
        .filter((item) => item.estimateId === where.estimateId)
        .map((item) => item.pos)
        .filter((pos) => pos !== undefined && pos !== null);
      return { _max: { pos: positions.length ? Math.max(...positions) : null } };
    }),
    create: jest.fn(async ({ data }: any) => {
      const service = {
        id: `estimate-service-${state.estimateServices.length + 1}`,
        ...data,
      };
      state.estimateServices.push(service);
      return service;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      state.serviceUpdates += 1;
      if (state.failOnServiceUpdateCall === state.serviceUpdates) {
        throw new Error("forced service update failure");
      }
      const service = state.estimateServices.find((item) => item.id === where.id);
      Object.assign(service, data);
      return service;
    }),
    delete: jest.fn(async ({ where }: any) => {
      const index = state.estimateServices.findIndex((item) => item.id === where.id);
      const [deleted] = state.estimateServices.splice(index, 1);
      return deleted;
    }),
  },
  serviceProject: {
    findUnique: jest.fn(async ({ where }: any) => {
      return state.serviceProjects.find((item) => item.id === where.id) || null;
    }),
    findFirst: jest.fn(async ({ where }: any) => {
      return state.serviceProjects.find((item) => item.estimateServiceId === where.estimateServiceId) || null;
    }),
    delete: jest.fn(async ({ where }: any) => {
      const index = state.serviceProjects.findIndex((item) => item.id === where.id);
      const [deleted] = state.serviceProjects.splice(index, 1);
      return deleted;
    }),
  },
  pdfProject: {
    findFirst: jest.fn(async ({ where }: any) => {
      return state.pdfProjects.find((item) => item.estimate_id === where.estimate_id) || null;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const pdf = state.pdfProjects.find((item) => item.id === where.id);
      Object.assign(pdf, data);
      return pdf;
    }),
    findUnique: jest.fn(async ({ where }: any) => {
      return state.pdfProjects.find((item) => item.id === where.id) || null;
    }),
  },
  imagesAttachments: {
    create: jest.fn(async ({ data }: any) => {
      const image = {
        id: `image-${state.imagesAttachments.length + 1}`,
        ...data,
      };
      state.imagesAttachments.push(image);
      return image;
    }),
    findUnique: jest.fn(async ({ where }: any) => {
      return state.imagesAttachments.find((item) => item.id === where.id) || null;
    }),
    delete: jest.fn(async ({ where }: any) => {
      const index = state.imagesAttachments.findIndex((item) => item.id === where.id);
      const [deleted] = state.imagesAttachments.splice(index, 1);
      return deleted;
    }),
  },
};

jest.mock("../../src/middlewares/checkToken", () => ({
  checkToken: (req: any, _res: any, next: any) => {
    req.userId = "user-test";
    next();
  },
}));

jest.mock("../../src/utils/prisma", () => ({ prisma: mockPrisma }));
jest.mock("../../src/utils/S3/uploadFIleS3", () => ({
  uploadFileToS3_2: jest.fn(async (file: any) => `s3/${file.originalname}`),
}));
jest.mock("../../src/utils/S3/getPresignedUrl", () => ({
  getPresignedUrl: jest.fn(async (key: string) => `https://s3.test/${key}`),
}));
jest.mock("../../src/utils/S3/s3Storage", () => (
  jest.fn().mockImplementation(() => ({ deleteFile: jest.fn(async () => undefined) }))
));
jest.mock("../../src/utils/S3/deleteFileFromS3", () => ({
  deleteFileFromS3: jest.fn(async () => undefined),
}));
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn().mockResolvedValue({}) })),
  PutObjectCommand: jest.fn().mockImplementation((input: any) => input),
}));
jest.mock("../../src/utils/pdfEstimateSignatures", () => ({
  addCompanySignatureToPdfBuffer: jest.fn(async (buffer: Buffer) => buffer),
  addCompanySignatureImageToPdfBuffer: jest.fn(async (buffer: Buffer) => buffer),
  addClientSignatureImageToPdfBuffer: jest.fn(async (buffer: Buffer) => buffer),
  addManualApprovalClientSignatureToPdfBuffer: jest.fn(async (buffer: Buffer) => buffer),
}));
jest.mock("../../src/utils/estimateDiscountSync", () => ({
  syncEstimateDiscountedServices: jest.fn(async (_smartbuild: any, estimateId: string) => {
    const estimate = state.estimates.find((item) => item.id === estimateId);
    const subtotal = state.estimateServices
      .filter((service) => service.estimateId === estimateId)
      .reduce((sum, service) => sum + Number(service.originalLineTotal ?? service.lineTotal ?? 0), 0);
    const discountAmount = estimate.discountType === "fixed"
      ? Number(estimate.discountValue || 0)
      : estimate.discountType === "percentage"
        ? subtotal * (Number(estimate.discountValue || 0) / 100)
        : 0;

    Object.assign(estimate, {
      totalAmount: subtotal,
      discountAmount,
      finalAmount: subtotal - discountAmount,
      balanceDue: subtotal - discountAmount - Number(estimate.amountPaid || 0),
    });
  }),
}));
jest.mock("../../src/controllers/quickbooks/estimate/QuickBooksEstimateOutboundService", () => ({
  fireAndForgetUpsertEstimateToQBO: jest.fn(),
}));

import { estimateRoutes } from "../../src/routes/estimateRoutes";

const app = express()
  .use(express.json({ limit: "25mb" }))
  .use("/estimate", estimateRoutes);

const runCurrentEditSequence = async () => {
  const fieldsResponse = await request(app)
    .patch("/estimate/update/fields")
    .set("Authorization", "Bearer test")
    .send({
      estimateId: "estimate-1",
      description: "New intro",
      terms: "New terms",
      multi_emails: "client@example.com,owner@example.com",
      date_creation: "2026-07-06T12:00:00.000Z",
      discountType: "fixed",
      discountValue: 25,
      workContextId: "work-context-1",
    });

  const updateServiceResponse = await request(app)
    .patch("/estimate/update/service-fields")
    .set("Authorization", "Bearer test")
    .send({
      serviceId: "estimate-service-1",
      name: "Roof Repair",
      description: "Updated roof description",
      quantity: 2,
      unitPrice: 150,
      lineTotal: 300,
      hours: 2,
      price: 150,
      pos: 0,
    });

  const createServiceResponse = await request(app)
    .post("/estimate/new-service")
    .set("Authorization", "Bearer test")
    .send({
      estimateId: "estimate-1",
      name: "Cleanup",
      description: "Site cleanup",
      quantity: 1,
      unitPrice: 100,
      lineTotal: 100,
      hours: 1,
      price: 100,
      pos: 1,
    });

  const deleteServiceResponse = await request(app)
    .delete("/estimate/service/estimate-service-2")
    .set("Authorization", "Bearer test");

  const totalResponse = await request(app)
    .patch("/estimate/update/fields")
    .set("Authorization", "Bearer test")
    .send({
      estimateId: "estimate-1",
      totalAmount: 400,
      discountType: "fixed",
      discountValue: 25,
    });

  const pdfResponse = await request(app)
    .put("/estimate/update/pdf-estimate")
    .set("Authorization", "Bearer test")
    .field("estimateId", "estimate-1")
    .field("templateNumber", "2")
    .attach("file", Buffer.from("%PDF-1.4\n%%EOF"), "updated-estimate.pdf");

  return {
    fieldsResponse,
    updateServiceResponse,
    createServiceResponse,
    deleteServiceResponse,
    totalResponse,
    pdfResponse,
  };
};

describe("current estimate edit flow contract", () => {
  beforeEach(() => {
    seedEstimateForEdit();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    global.fetch = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => Buffer.from("%PDF-1.4\n%%EOF"),
    })) as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("documents the final persisted state produced by the current multi-call edit flow", async () => {
    const responses = await runCurrentEditSequence();

    expect(Object.values(responses).map((response: any) => response.status)).toEqual([200, 200, 201, 200, 200, 200]);
    expect(state.estimates[0]).toEqual(expect.objectContaining({
      description: "New intro",
      terms: "New terms",
      multi_emails: "client@example.com,owner@example.com",
      totalAmount: 400,
      discountType: "fixed",
      discountValue: 25,
    }));
    expect(state.projects[0]).toEqual(expect.objectContaining({
      workContextId: "work-context-1",
    }));
    expect(state.estimateServices).toEqual([
      expect.objectContaining({
        id: "estimate-service-1",
        name: "Roof Repair",
        quantity: 2,
        unitPrice: 150,
        lineTotal: 300,
        pos: 0,
      }),
      expect.objectContaining({
        name: "Cleanup",
        quantity: 1,
        unitPrice: 100,
        lineTotal: 100,
        pos: 1,
      }),
    ]);
    expect(state.serviceProjects).toHaveLength(0);
    expect(state.pdfProjects[0]).toEqual(expect.objectContaining({
      original_file_name: "updated-estimate.pdf",
      templateNumber: 2,
    }));
  });

  it("keeps the unified edit route final state equivalent to the old multi-call flow", async () => {
    const oldResponses = await runCurrentEditSequence();
    expect(Object.values(oldResponses).map((response: any) => response.status)).toEqual([200, 200, 201, 200, 200, 200]);
    const oldFinalState = comparableState();

    seedEstimateForEdit();

    const response = await request(app)
      .put("/estimate/update-full/estimate-1")
      .set("Authorization", "Bearer test")
      .field("payload", JSON.stringify(currentEditPayload))
      .attach("file", Buffer.from("%PDF-1.4\n%%EOF"), "updated-estimate.pdf");

    expect(response.status).toBe(200);
    expect(comparableState()).toEqual(oldFinalState);
  });

  it("rolls back all database changes when the unified edit route fails mid-update", async () => {
    const before = comparableState();
    state.failOnServiceUpdateCall = 1;

    const response = await request(app)
      .put("/estimate/update-full/estimate-1")
      .set("Authorization", "Bearer test")
      .field("payload", JSON.stringify(currentEditPayload))
      .attach("file", Buffer.from("%PDF-1.4\n%%EOF"), "updated-estimate.pdf");

    expect(response.status).toBe(500);
    expect(comparableState()).toEqual(before);
  });

  it("documents the current partial-state risk when a later edit call fails", async () => {
    state.failOnServiceUpdateCall = 1;

    const fieldsResponse = await request(app)
      .patch("/estimate/update/fields")
      .set("Authorization", "Bearer test")
      .send({
        estimateId: "estimate-1",
        description: "New intro",
        terms: "New terms",
      });

    const serviceResponse = await request(app)
      .patch("/estimate/update/service-fields")
      .set("Authorization", "Bearer test")
      .send({
        serviceId: "estimate-service-1",
        name: "Roof Repair",
        quantity: 2,
        unitPrice: 150,
        lineTotal: 300,
      });

    expect(fieldsResponse.status).toBe(200);
    expect(serviceResponse.status).toBe(500);
    expect(state.estimates[0]).toEqual(expect.objectContaining({
      description: "New intro",
      terms: "New terms",
    }));
    expect(state.estimateServices.find((service) => service.id === "estimate-service-1")).toEqual(expect.objectContaining({
      name: "Old Roof",
      quantity: 1,
      unitPrice: 200,
      lineTotal: 200,
    }));
    expect(state.pdfProjects[0]).toEqual(expect.objectContaining({
      original_file_name: "old-estimate.pdf",
    }));
  });
});
