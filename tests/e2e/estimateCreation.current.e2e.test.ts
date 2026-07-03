/// <reference types="jest" />

import express from "express";

const request = require("supertest");

type RecordMap = Record<string, any>;

const mockState = {
  ids: {
    client: 1,
    project: 1,
    pdf: 1,
    estimate: 1,
    estimateService: 1,
    image: 1,
    attachment: 1,
  },
  clients: [] as any[],
  projects: [] as any[],
  pdfProjects: [] as any[],
  estimates: [] as any[],
  estimateServices: [] as any[],
  imgServiceProjects: [] as any[],
  imagesAttachments: [] as any[],
  serviceCreateCalls: 0,
  failOnServiceCreateCall: 0,
};

const nextId = (name: keyof typeof mockState.ids, prefix: string) => {
  const value = mockState.ids[name]++;
  return `${prefix}-${value}`;
};

const resetState = () => {
  mockState.ids = {
    client: 1,
    project: 1,
    pdf: 1,
    estimate: 1,
    estimateService: 1,
    image: 1,
    attachment: 1,
  };
  mockState.clients = [];
  mockState.projects = [];
  mockState.pdfProjects = [];
  mockState.estimates = [];
  mockState.estimateServices = [];
  mockState.imgServiceProjects = [];
  mockState.imagesAttachments = [];
  mockState.serviceCreateCalls = 0;
  mockState.failOnServiceCreateCall = 0;
};

const sortDesc = (records: any[], field: string) => {
  return [...records].sort((a, b) => String(b[field] ?? "").localeCompare(String(a[field] ?? "")));
};

const mockPrisma: RecordMap = {
  $transaction: jest.fn(async (callback: (tx: any) => Promise<any>) => callback(mockPrisma)),
  user: {
    update: jest.fn().mockResolvedValue({}),
  },
  client: {
    findUnique: jest.fn(async ({ where }: any) => {
      const unique = where?.email_company_id;
      if (unique) {
        return mockState.clients.find(
          (client) => client.email === unique.email && client.company_id === unique.company_id
        ) || null;
      }
      return mockState.clients.find((client) => client.id === where?.id) || null;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const client = mockState.clients.find((item) => item.id === where.id);
      Object.assign(client, data);
      return client;
    }),
    create: jest.fn(async ({ data }: any) => {
      const client = { id: nextId("client", "client"), ...data };
      mockState.clients.push(client);
      return client;
    }),
  },
  project: {
    findFirst: jest.fn(async ({ where, orderBy }: any) => {
      let projects = mockState.projects;
      if (where?.company_id) {
        projects = projects.filter((project) => project.company_id === where.company_id);
      }
      if (where?.contract_number?.not === null) {
        projects = projects.filter((project) => project.contract_number !== null && project.contract_number !== undefined);
      }
      if (orderBy?.contract_number === "desc") {
        return sortDesc(projects, "contract_number")[0] || null;
      }
      return projects[0] || null;
    }),
    findUnique: jest.fn(async ({ where }: any) => {
      const project = mockState.projects.find((item) => item.id === where.id);
      if (!project) return null;
      return {
        ...project,
        company: {
          id: project.company_id,
          name: "ACME Construction",
          email: "office@acme.test",
          signature: null,
        },
        client: mockState.clients.find((client) => client.id === project.client_id),
        serviceProject: [],
      };
    }),
    create: jest.fn(async ({ data }: any) => {
      const project = {
        id: nextId("project", "project"),
        ...data,
        date_creation: new Date("2026-07-03T12:00:00.000Z"),
      };
      mockState.projects.push(project);
      return project;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const project = mockState.projects.find((item) => item.id === where.id);
      Object.assign(project, data);
      return project;
    }),
  },
  pdfProject: {
    create: jest.fn(async ({ data, select }: any) => {
      const pdfProject = {
        id: nextId("pdf", "pdf"),
        ...data,
        date_creation: new Date("2026-07-03T12:01:00.000Z"),
      };
      mockState.pdfProjects.push(pdfProject);
      if (!select) return pdfProject;
      return Object.fromEntries(Object.keys(select).map((key) => [key, pdfProject[key]]));
    }),
    findUnique: jest.fn(async ({ where }: any) => {
      return mockState.pdfProjects.find((item) => item.id === where.id) || null;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const pdfProject = mockState.pdfProjects.find((item) => item.id === where.id);
      Object.assign(pdfProject, data);
      return pdfProject;
    }),
  },
  estimate: {
    findFirst: jest.fn(async ({ where, orderBy }: any) => {
      let estimates = mockState.estimates;
      if (where?.project?.company_id) {
        estimates = estimates.filter((estimate) => {
          const project = mockState.projects.find((item) => item.id === estimate.projectId);
          return project?.company_id === where.project.company_id;
        });
      }
      if (orderBy?.date_creation === "desc") {
        return [...estimates].sort((a, b) => +new Date(b.date_creation) - +new Date(a.date_creation))[0] || null;
      }
      return estimates[0] || null;
    }),
    findMany: jest.fn(async () => mockState.estimates),
    findUnique: jest.fn(async ({ where, select }: any) => {
      const estimate = mockState.estimates.find((item) => item.id === where.id);
      if (!estimate) return null;
      const project = mockState.projects.find((item) => item.id === estimate.projectId);
      if (select?.project) {
        return {
          id: estimate.id,
          project: {
            company_id: project?.company_id,
          },
        };
      }
      return {
        ...estimate,
        project,
        serviceProjects: mockState.estimateServices.filter((service) => service.estimateId === estimate.id),
      };
    }),
    create: jest.fn(async ({ data }: any) => {
      const estimate = {
        id: nextId("estimate", "estimate"),
        number: data.number,
        approvedAt: data.approvedAt,
        totalAmount: data.totalAmount,
        balanceDue: data.balanceDue,
        amountPaid: data.amountPaid,
        finalAmount: data.finalAmount,
        description: data.description,
        terms: data.terms,
        status: data.status,
        type_estimate: data.type_estimate,
        multi_emails: data.multi_emails,
        isStandaloneEstimate: data.isStandaloneEstimate,
        date_creation: data.date_creation || new Date("2026-07-03T12:02:00.000Z"),
        projectId: data.project.connect.id,
      };
      mockState.estimates.push(estimate);
      return estimate;
    }),
  },
  estimateServiceProject: {
    aggregate: jest.fn(async ({ where }: any) => {
      const positions = mockState.estimateServices
        .filter((service) => service.estimateId === where.estimateId)
        .map((service) => service.pos)
        .filter((pos) => pos !== null && pos !== undefined);
      return { _max: { pos: positions.length ? Math.max(...positions) : null } };
    }),
    create: jest.fn(async ({ data }: any) => {
      mockState.serviceCreateCalls++;
      if (mockState.failOnServiceCreateCall === mockState.serviceCreateCalls) {
        throw new Error("forced service creation failure");
      }
      const service = {
        id: nextId("estimateService", "estimate-service"),
        ...data,
        date_creation: new Date("2026-07-03T12:03:00.000Z"),
        date_update: new Date("2026-07-03T12:03:00.000Z"),
      };
      mockState.estimateServices.push(service);
      return service;
    }),
    findUnique: jest.fn(async ({ where }: any) => {
      return mockState.estimateServices.find((item) => item.id === where.id) || null;
    }),
  },
  serviceProject: {
    findMany: jest.fn(async () => []),
  },
  imgServiceProject: {
    create: jest.fn(async ({ data }: any) => {
      const img = { id: nextId("image", "img"), ...data };
      mockState.imgServiceProjects.push(img);
      return img;
    }),
  },
  imagesAttachments: {
    create: jest.fn(async ({ data }: any) => {
      const attachment = {
        id: nextId("attachment", "attachment"),
        ...data,
        date_creation: new Date("2026-07-03T12:04:00.000Z"),
      };
      mockState.imagesAttachments.push(attachment);
      return attachment;
    }),
  },
};

jest.mock("../../src/middlewares/checkToken", () => ({
  checkToken: (req: any, _res: any, next: any) => {
    req.userId = "user-test";
    next();
  },
}));

jest.mock("../../src/utils/prisma", () => ({
  prisma: mockPrisma,
}));

jest.mock("../../src/utils/S3/uploadFIleS3", () => ({
  uploadFileToS3_2: jest.fn(async (file: any) => `s3/${file.originalname}`),
}));

jest.mock("../../src/utils/S3/getPresignedUrl", () => ({
  getPresignedUrl: jest.fn(async (key: string) => `https://s3.test/${key}`),
}));

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  PutObjectCommand: jest.fn().mockImplementation((input: any) => input),
}));

jest.mock("../../src/utils/pdfEstimateSignatures", () => ({
  addCompanySignatureToPdfBuffer: jest.fn(async (buffer: Buffer) => buffer),
  addCompanySignatureImageToPdfBuffer: jest.fn(async (buffer: Buffer) => buffer),
}));

jest.mock("../../src/utils/estimateDiscountSync", () => ({
  syncEstimateDiscountedServices: jest.fn(async () => undefined),
}));

jest.mock("../../src/controllers/quickbooks/estimate/QuickBooksEstimateOutboundService", () => ({
  fireAndForgetUpsertEstimateToQBO: jest.fn(),
}));

import { estimateRoutes } from "../../src/routes/estimateRoutes";
import { projectRoutes } from "../../src/routes/projectRoutes";
import { imagesAttachmentsRoutes } from "../../src/routes/imagesAttachments";

const createTestApp = () => {
  const app = express();
  app.use(express.json({ limit: "25mb" }));
  app.use(projectRoutes);
  app.use("/estimate", estimateRoutes);
  app.use(imagesAttachmentsRoutes);
  return app;
};

const auth = { Authorization: "Bearer test-token" };

const createProjectPdfAndEstimate = async (app: any) => {
  const projectResponse = await request(app)
    .post("/project")
    .set(auth)
    .send({
      seller_user_id: "seller-1",
      price: 0,
      status_project: "Pending",
      company_id: "company-1",
      client: {
        name: "Client One",
        email: "client@example.com",
        phone: "555-0101",
      },
      estimateNumber: "1001",
      location: "123 Main St",
      lat: "40.7128",
      log: "-74.0060",
      radius: "25",
    });

  expect(projectResponse.status).toBe(201);

  const pdfResponse = await request(app)
    .post("/pdfproject/estimate-invoice")
    .set(auth)
    .field("type_pdf", "estimate")
    .field("templateNumber", "2")
    .attach("file", Buffer.from("%PDF-1.4\n%%EOF"), "estimate.pdf");

  expect(pdfResponse.status).toBe(200);

  const estimateResponse = await request(app)
    .post("/estimate/new-estimate")
    .set(auth)
    .send({
      projectId: projectResponse.body.id,
      idPdfProject: pdfResponse.body.id,
      preGeneratedNumber: "1001",
      totalAmount: 300,
      discountType: null,
      discountValue: null,
      type_estimate: "estimate",
      description: "Estimate letter",
      terms: "Estimate terms",
      multi_emails: "client@example.com,owner@example.com",
      date_creation: "2026-07-03",
    });

  expect(estimateResponse.status).toBe(201);

  return {
    project: projectResponse.body,
    pdf: pdfResponse.body,
    estimate: estimateResponse.body.data,
  };
};

describe("current estimate creation user flow (isolated E2E contract)", () => {
  let app: any;

  beforeEach(() => {
    resetState();
    app = createTestApp();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    global.fetch = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => Buffer.from("%PDF-1.4\n%%EOF"),
    })) as any;
  });

  it("creates the same persisted records as the current Save flow without touching the real database", async () => {
    const { project, pdf, estimate } = await createProjectPdfAndEstimate(app);

    const linkPdfResponse = await request(app)
      .put("/pdfproject/estimate-invoice/update-estimate-id")
      .set(auth)
      .send({
        pdfId: pdf.id,
        estimateId: estimate.id,
      });

    expect(linkPdfResponse.status).toBe(200);

    const firstServiceResponse = await request(app)
      .post("/estimate/new-service")
      .set(auth)
      .send({
        estimateId: estimate.id,
        name: "Roof Repair",
        description: "Repair damaged roof area",
        quantity: 2,
        unitPrice: 100,
        lineTotal: 200,
        hours: 2,
        price: 100,
        pos: 0,
      });

    const secondServiceResponse = await request(app)
      .post("/estimate/new-service")
      .set(auth)
      .send({
        estimateId: estimate.id,
        name: "Cleanup",
        description: "Site cleanup",
        quantity: 1,
        unitPrice: 100,
        lineTotal: 100,
        hours: 1,
        price: 100,
        pos: 1,
      });

    expect(firstServiceResponse.status).toBe(201);
    expect(secondServiceResponse.status).toBe(201);
    expect(firstServiceResponse.body).toEqual({
      message: "Service created successfully",
      data: expect.objectContaining({
        id: "estimate-service-1",
        estimateId: estimate.id,
        name: "Roof Repair",
        pos: 0,
      }),
    });

    const attachmentResponse = await request(app)
      .post("/images-attachments/upload")
      .set(auth)
      .field("estimateId", estimate.id)
      .field("title", "Before photo")
      .attach("file", Buffer.from("image-bytes"), "before.jpg");

    expect(attachmentResponse.status).toBe(201);

    expect(mockState.clients).toHaveLength(1);
    expect(mockState.projects).toEqual([
      expect.objectContaining({
        id: project.id,
        status_project: "Pending",
        price: 300,
        balanceDue: 300,
        location: "123 Main St",
      }),
    ]);
    expect(mockState.pdfProjects).toEqual([
      expect.objectContaining({
        id: pdf.id,
        type_pdf: "estimate",
        project_id: project.id,
        estimate_id: estimate.id,
        templateNumber: 2,
      }),
    ]);
    expect(mockState.estimates).toEqual([
      expect.objectContaining({
        id: estimate.id,
        number: "1001",
        projectId: project.id,
        totalAmount: 300,
        multi_emails: "client@example.com,owner@example.com",
      }),
    ]);
    expect(mockState.estimateServices).toEqual([
      expect.objectContaining({ id: "estimate-service-1", name: "Roof Repair", estimateId: estimate.id, pos: 0 }),
      expect.objectContaining({ id: "estimate-service-2", name: "Cleanup", estimateId: estimate.id, pos: 1 }),
    ]);
    expect(mockState.imagesAttachments).toEqual([
      expect.objectContaining({
        estimateId: estimate.id,
        original_filename: "before.jpg",
        title: "Before photo",
      }),
    ]);
  });

  it("documents the current partial-state behavior when one service fails after the estimate was created", async () => {
    const { project, pdf, estimate } = await createProjectPdfAndEstimate(app);
    mockState.failOnServiceCreateCall = 2;

    const firstServiceResponse = await request(app)
      .post("/estimate/new-service")
      .set(auth)
      .send({
        estimateId: estimate.id,
        name: "Service created before failure",
        quantity: 1,
        unitPrice: 100,
        lineTotal: 100,
        pos: 0,
      });

    const failedServiceResponse = await request(app)
      .post("/estimate/new-service")
      .set(auth)
      .send({
        estimateId: estimate.id,
        name: "Service that fails",
        quantity: 1,
        unitPrice: 200,
        lineTotal: 200,
        pos: 1,
      });

    expect(firstServiceResponse.status).toBe(201);
    expect(failedServiceResponse.status).toBe(500);
    expect(failedServiceResponse.body).toEqual({
      error: "Internal server error while creating service estimate",
    });

    expect(mockState.projects).toEqual([
      expect.objectContaining({
        id: project.id,
        price: 300,
        balanceDue: 300,
      }),
    ]);
    expect(mockState.pdfProjects).toEqual([
      expect.objectContaining({
        id: pdf.id,
        project_id: project.id,
        estimate_id: estimate.id,
      }),
    ]);
    expect(mockState.estimates).toEqual([
      expect.objectContaining({
        id: estimate.id,
        number: "1001",
        totalAmount: 300,
      }),
    ]);
    expect(mockState.estimateServices).toEqual([
      expect.objectContaining({
        id: "estimate-service-1",
        name: "Service created before failure",
        estimateId: estimate.id,
      }),
    ]);
  });
});
