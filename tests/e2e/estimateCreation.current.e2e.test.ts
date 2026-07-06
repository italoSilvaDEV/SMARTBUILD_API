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
    serviceProject: 1,
    image: 1,
    attachment: 1,
    aiSession: 1,
    aiMessage: 1,
  },
  clients: [] as any[],
  projects: [] as any[],
  pdfProjects: [] as any[],
  estimates: [] as any[],
  estimateServices: [] as any[],
  serviceProjects: [] as any[],
  imgServiceProjects: [] as any[],
  imagesAttachments: [] as any[],
  aiSessions: [] as any[],
  aiMessages: [] as any[],
  aiAttachments: [] as any[],
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
    serviceProject: 1,
    image: 1,
    attachment: 1,
    aiSession: 1,
    aiMessage: 1,
  };
  mockState.clients = [];
  mockState.projects = [];
  mockState.pdfProjects = [];
  mockState.estimates = [];
  mockState.estimateServices = [];
  mockState.serviceProjects = [];
  mockState.imgServiceProjects = [];
  mockState.imagesAttachments = [];
  mockState.aiSessions = [];
  mockState.aiMessages = [];
  mockState.aiAttachments = [];
  mockState.serviceCreateCalls = 0;
  mockState.failOnServiceCreateCall = 0;
};

const sortDesc = (records: any[], field: string) => {
  return [...records].sort((a, b) => String(b[field] ?? "").localeCompare(String(a[field] ?? "")));
};

const mockPrisma: RecordMap = {
  $transaction: jest.fn(async (callback: (tx: any) => Promise<any>) => {
    const snapshot = {
      clients: [...mockState.clients],
      projects: [...mockState.projects],
      pdfProjects: [...mockState.pdfProjects],
      estimates: [...mockState.estimates],
      estimateServices: [...mockState.estimateServices],
      serviceProjects: [...mockState.serviceProjects],
      imgServiceProjects: [...mockState.imgServiceProjects],
      imagesAttachments: [...mockState.imagesAttachments],
      aiSessions: [...mockState.aiSessions],
      aiMessages: [...mockState.aiMessages],
      aiAttachments: [...mockState.aiAttachments],
      ids: { ...mockState.ids },
      serviceCreateCalls: mockState.serviceCreateCalls,
    };

    try {
      return await callback(mockPrisma);
    } catch (error) {
      Object.assign(mockState, snapshot);
      throw error;
    }
  }),
  company: {
    findUnique: jest.fn(async ({ where }: any) => {
      if (where.id !== "company-1") return null;
      return {
        id: "company-1",
        name: "ACME Construction",
        email: "office@acme.test",
        signature: null,
      };
    }),
  },
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
        serviceProject: mockState.serviceProjects.filter((service) => service.projectId === project.id),
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
    findUnique: jest.fn(async ({ where, select, include }: any) => {
      const estimate = mockState.estimates.find((item) => item.id === where.id);
      if (!estimate) return null;
      const project = mockState.projects.find((item) => item.id === estimate.projectId);
      const fullEstimate = {
        ...estimate,
        project: project
          ? {
            ...project,
            client: mockState.clients.find((client) => client.id === project.client_id),
            company: {
              id: project.company_id,
              name: "ACME Construction",
              email: "office@acme.test",
              signature: null,
            },
            serviceProject: mockState.serviceProjects.filter((service) => service.projectId === project.id),
          }
          : null,
        serviceProjects: mockState.estimateServices.filter((service) => service.estimateId === estimate.id),
        PdfProject: mockState.pdfProjects.filter((pdf) => pdf.estimate_id === estimate.id),
        timelineEvents: [],
        imagesAttachments: mockState.imagesAttachments.filter((image) => image.estimateId === estimate.id),
        emailLogs: [],
      };

      if (include || select?.serviceProjects) {
        return fullEstimate;
      }

      if (select?.project) {
        return {
          id: estimate.id,
          project: {
            company_id: project?.company_id,
          },
        };
      }
      return fullEstimate;
    }),
    create: jest.fn(async ({ data }: any) => {
      const estimate = {
        id: nextId("estimate", "estimate"),
        number: data.number,
        approvedAt: data.approvedAt,
        totalAmount: data.totalAmount,
        balanceDue: data.balanceDue,
        amountPaid: data.amountPaid,
        markupType: data.markupType,
        markupValue: data.markupValue,
        markupAmount: data.markupAmount,
        finalAmount: data.finalAmount,
        discountValue: data.discountValue,
        discountAmount: data.discountAmount,
        depositType: data.depositType,
        depositValue: data.depositValue,
        depositAmount: data.depositAmount,
        description: data.description,
        terms: data.terms,
        status: data.status,
        type_estimate: data.type_estimate,
        assignatureRequired: data.assignatureRequired,
        multi_emails: data.multi_emails,
        isStandaloneEstimate: data.isStandaloneEstimate,
        date_creation: data.date_creation || new Date("2026-07-03T12:02:00.000Z"),
        projectId: data.project.connect.id,
      };
      mockState.estimates.push(estimate);
      return estimate;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const estimate = mockState.estimates.find((item) => item.id === where.id);
      Object.assign(estimate, data);
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
    update: jest.fn(async ({ where, data }: any) => {
      const service = mockState.estimateServices.find((item) => item.id === where.id);
      Object.assign(service, data);
      return service;
    }),
    findUnique: jest.fn(async ({ where }: any) => {
      return mockState.estimateServices.find((item) => item.id === where.id) || null;
    }),
  },
  serviceProject: {
    findMany: jest.fn(async () => mockState.serviceProjects),
    findFirst: jest.fn(async ({ where }: any) => {
      return mockState.serviceProjects.find((item) => item.estimateServiceId === where.estimateServiceId) || null;
    }),
    create: jest.fn(async ({ data }: any) => {
      const serviceProject = {
        id: nextId("serviceProject", "service-project"),
        ...data,
      };
      mockState.serviceProjects.push(serviceProject);
      return serviceProject;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const serviceProject = mockState.serviceProjects.find((item) => item.id === where.id);
      Object.assign(serviceProject, data);
      return serviceProject;
    }),
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
  estimateAiSession: {
    findUnique: jest.fn(async ({ where }: any) => {
      return mockState.aiSessions.find((session) => session.estimateId === where.estimateId) || null;
    }),
    create: jest.fn(async ({ data }: any) => {
      const session = { id: nextId("aiSession", "ai-session"), ...data };
      mockState.aiSessions.push(session);
      return session;
    }),
  },
  estimateAiMessage: {
    create: jest.fn(async ({ data }: any) => {
      const message = { id: nextId("aiMessage", "ai-message"), ...data };
      mockState.aiMessages.push(message);
      return message;
    }),
  },
  estimateAiAttachment: {
    createMany: jest.fn(async ({ data }: any) => {
      mockState.aiAttachments.push(...data);
      return { count: data.length };
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
  DeleteObjectCommand: jest.fn().mockImplementation((input: any) => input),
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
import { addCompanySignatureToPdfBuffer } from "../../src/utils/pdfEstimateSignatures";

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

  it("creates a full estimate for an existing project through a single route", async () => {
    const projectResponse = await request(app)
      .post("/project")
      .set(auth)
      .send({
        seller_user_id: "seller-1",
        price: 0,
        status_project: "Pre-Start",
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

    const response = await request(app)
      .post(`/estimate/create-full/project/${projectResponse.body.id}`)
      .set(auth)
      .field("payload", JSON.stringify({
        pdf: {
          type_pdf: "estimate",
          templateNumber: 2,
        },
        estimate: {
          preGeneratedNumber: "1001-01",
          totalAmount: 300,
          discountType: null,
          discountValue: null,
          type_estimate: "estimateProject",
          description: "Estimate letter",
          terms: "Estimate terms",
          multi_emails: "client@example.com,owner@example.com",
          date_creation: "2026-07-03",
          workContextId: "work-context-1",
          cancelEstimates: true,
        },
        services: [
          {
            name: "Roof Repair",
            description: "Repair damaged roof area",
            quantity: 2,
            unitPrice: 100,
            lineTotal: 200,
            hours: 2,
            price: 100,
            pos: 0,
          },
          {
            name: "Cleanup",
            description: "Site cleanup",
            quantity: 1,
            unitPrice: 100,
            lineTotal: 100,
            hours: 1,
            price: 100,
            pos: 1,
          },
        ],
        attachments: [{ title: "Before photo" }],
        smartBuilderSession: {
          metadata: { source: "project-existing-test" },
          messages: [{ role: "user", content: "Create estimate inside project" }],
        },
      }))
      .attach("file", Buffer.from("%PDF-1.4\n%%EOF"), "project-estimate.pdf")
      .attach("attachments", Buffer.from("image-bytes"), "before.jpg");

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(expect.objectContaining({
      id: "estimate-1",
      number: "1001-01",
      projectId: projectResponse.body.id,
    }));
    expect(mockState.projects).toHaveLength(1);
    expect(mockState.pdfProjects).toEqual([
      expect.objectContaining({
        id: "pdf-1",
        project_id: projectResponse.body.id,
        estimate_id: "estimate-1",
        templateNumber: 2,
        type_pdf: "estimate",
      }),
    ]);
    expect(mockState.estimates).toEqual([
      expect.objectContaining({
        id: "estimate-1",
        totalAmount: 300,
        type_estimate: "estimateProject",
        isStandaloneEstimate: false,
      }),
    ]);
    expect(mockState.estimateServices).toEqual([
      expect.objectContaining({ id: "estimate-service-1", name: "Roof Repair", estimateId: "estimate-1", pos: 0 }),
      expect.objectContaining({ id: "estimate-service-2", name: "Cleanup", estimateId: "estimate-1", pos: 1 }),
    ]);
    expect(mockState.imagesAttachments).toEqual([
      expect.objectContaining({
        projectId: projectResponse.body.id,
        estimateId: "estimate-1",
        original_filename: "before.jpg",
        title: "Before photo",
      }),
    ]);
    expect(mockState.aiSessions).toEqual([
      expect.objectContaining({
        estimateId: "estimate-1",
        companyId: "company-1",
        createdById: "user-test",
      }),
    ]);
  });

  it("rolls back full estimate creation for an existing project when a service fails", async () => {
    const projectResponse = await request(app)
      .post("/project")
      .set(auth)
      .send({
        seller_user_id: "seller-1",
        price: 0,
        status_project: "Pre-Start",
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
    mockState.failOnServiceCreateCall = 2;

    const response = await request(app)
      .post(`/estimate/create-full/project/${projectResponse.body.id}`)
      .set(auth)
      .field("payload", JSON.stringify({
        pdf: {
          type_pdf: "estimate",
          templateNumber: 2,
        },
        estimate: {
          preGeneratedNumber: "1001-01",
          totalAmount: 300,
          type_estimate: "estimateProject",
        },
        services: [
          { name: "Service created before failure", quantity: 1, unitPrice: 100, lineTotal: 100, pos: 0 },
          { name: "Service that fails", quantity: 1, unitPrice: 200, lineTotal: 200, pos: 1 },
        ],
      }))
      .attach("file", Buffer.from("%PDF-1.4\n%%EOF"), "project-estimate.pdf");

    expect(response.status).toBe(500);
    expect(mockState.projects).toHaveLength(1);
    expect(mockState.pdfProjects).toHaveLength(0);
    expect(mockState.estimates).toHaveLength(0);
    expect(mockState.estimateServices).toHaveLength(0);
    expect(mockState.imagesAttachments).toHaveLength(0);
  });

  it("creates project, pdf, estimate, services, photos, attachments and SmartBuilder session through the unified route", async () => {
    const payload = {
      project: {
        seller_user_id: "seller-1",
        price: 300,
        status_project: "Pending",
        company_id: "company-1",
        client: {
          name: "Client One",
          email: "client@example.com",
          phone: "555-0101",
        },
        location: "123 Main St",
        lat: "40.7128",
        log: "-74.0060",
        radius: "25",
        work_context_id: "work-context-1",
      },
      pdf: {
        type_pdf: "estimate",
        templateNumber: 2,
      },
      estimate: {
        preGeneratedNumber: "1001",
        totalAmount: 300,
        discountType: null,
        discountValue: null,
        type_estimate: "estimate",
        description: "Estimate letter",
        terms: "Estimate terms",
        multi_emails: "client@example.com,owner@example.com",
        date_creation: "2026-07-03",
      },
      services: [
        {
          name: "Roof Repair",
          description: "Repair damaged roof area",
          quantity: 2,
          unitPrice: 100,
          lineTotal: 200,
          hours: 2,
          price: 100,
          pos: 0,
          photos: [{ id: "s3/service-photo-1.jpg" }],
        },
        {
          name: "Cleanup",
          description: "Site cleanup",
          quantity: 1,
          unitPrice: 100,
          lineTotal: 100,
          hours: 1,
          price: 100,
          pos: 1,
        },
      ],
      attachments: [{ title: "Before photo" }],
      smartBuilderSession: {
        metadata: { source: "test" },
        messages: [{ role: "user", content: "Create this estimate" }],
      },
    };

    const response = await request(app)
      .post("/estimate/create-full")
      .set(auth)
      .field("payload", JSON.stringify(payload))
      .attach("file", Buffer.from("%PDF-1.4\n%%EOF"), "estimate.pdf")
      .attach("attachments", Buffer.from("image-bytes"), "before.jpg");

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(expect.objectContaining({
      id: "estimate-1",
      number: "1001",
      projectId: "project-1",
    }));

    expect(mockState.clients).toHaveLength(1);
    expect(mockState.projects).toEqual([
      expect.objectContaining({
        id: "project-1",
        price: 300,
        balanceDue: 300,
        workContextId: "work-context-1",
      }),
    ]);
    expect(mockState.pdfProjects).toEqual([
      expect.objectContaining({
        id: "pdf-1",
        project_id: "project-1",
        estimate_id: "estimate-1",
        templateNumber: 2,
        type_pdf: "estimate",
      }),
    ]);
    expect(mockState.estimates).toEqual([
      expect.objectContaining({
        id: "estimate-1",
        totalAmount: 300,
        multi_emails: "client@example.com,owner@example.com",
        isStandaloneEstimate: false,
      }),
    ]);
    expect(mockState.estimateServices).toEqual([
      expect.objectContaining({ id: "estimate-service-1", name: "Roof Repair", estimateId: "estimate-1", pos: 0 }),
      expect.objectContaining({ id: "estimate-service-2", name: "Cleanup", estimateId: "estimate-1", pos: 1 }),
    ]);
    expect(mockState.serviceProjects).toEqual([
      expect.objectContaining({
        id: "service-project-1",
        projectId: "project-1",
        estimateServiceId: "estimate-service-1",
      }),
    ]);
    expect(mockState.imgServiceProjects).toEqual([
      expect.objectContaining({
        uri: "s3/service-photo-1.jpg",
        serviceProjectId: "service-project-1",
      }),
    ]);
    expect(mockState.imagesAttachments).toEqual([
      expect.objectContaining({
        projectId: "project-1",
        estimateId: "estimate-1",
        original_filename: "before.jpg",
        title: "Before photo",
      }),
    ]);
    expect(mockState.aiSessions).toEqual([
      expect.objectContaining({
        estimateId: "estimate-1",
        companyId: "company-1",
        createdById: "user-test",
      }),
    ]);
    expect(mockState.aiMessages).toEqual([
      expect.objectContaining({
        sessionId: "ai-session-1",
        role: "user",
        content: "Create this estimate",
      }),
    ]);
  });

  it("creates a project-flow estimate with every service mirrored into the project services", async () => {
    const payload = {
      project: {
        seller_user_id: "seller-1",
        price: 300,
        status_project: "Pre-Start",
        company_id: "company-1",
        client: {
          name: "Client One",
          email: "client@example.com",
          phone: "555-0101",
        },
        location: "123 Main St",
        lat: "40.7128",
        log: "-74.0060",
        radius: "25",
        start_date: "2026-07-10",
        deadline: "2026-07-20",
      },
      pdf: {
        type_pdf: "estimate",
        templateNumber: 2,
      },
      estimate: {
        preGeneratedNumber: "1001",
        totalAmount: 300,
        type_estimate: "estimateProject",
        status: "approved",
        isProjectFlow: true,
      },
      services: [
        {
          name: "Roof Repair",
          description: "Repair damaged roof area",
          quantity: 2,
          unitPrice: 100,
          lineTotal: 200,
          hours: 2,
          price: 100,
          pos: 0,
          photos: [{ id: "s3/service-photo-1.jpg" }],
        },
        {
          name: "Cleanup",
          description: "Site cleanup",
          quantity: 1,
          unitPrice: 100,
          lineTotal: 100,
          hours: 1,
          price: 100,
          pos: 1,
        },
      ],
    };

    const response = await request(app)
      .post("/estimate/create-full")
      .set(auth)
      .field("payload", JSON.stringify(payload))
      .attach("file", Buffer.from("%PDF-1.4\n%%EOF"), "estimate.pdf");

    expect(response.status).toBe(201);
    expect(mockState.projects).toEqual([
      expect.objectContaining({
        id: "project-1",
        status_project: "Pre-Start",
        start_date: "2026-07-10",
        deadline: "2026-07-20",
      }),
    ]);
    expect(mockState.estimates).toEqual([
      expect.objectContaining({
        id: "estimate-1",
        type_estimate: "estimateProject",
        status: "approved",
        assignatureRequired: true,
      }),
    ]);
    expect(mockState.estimateServices).toEqual([
      expect.objectContaining({ id: "estimate-service-1", name: "Roof Repair", estimateId: "estimate-1", pos: 0 }),
      expect.objectContaining({ id: "estimate-service-2", name: "Cleanup", estimateId: "estimate-1", pos: 1 }),
    ]);
    expect(mockState.serviceProjects).toEqual([
      expect.objectContaining({
        id: "service-project-1",
        projectId: "project-1",
        estimateServiceId: "estimate-service-1",
        name: "Roof Repair",
      }),
      expect.objectContaining({
        id: "service-project-2",
        projectId: "project-1",
        estimateServiceId: "estimate-service-2",
        name: "Cleanup",
      }),
    ]);
    expect(mockState.imgServiceProjects).toEqual([
      expect.objectContaining({
        uri: "s3/service-photo-1.jpg",
        serviceProjectId: "service-project-1",
      }),
    ]);
  });

  it("rolls back the unified route when a service fails inside the transaction", async () => {
    mockState.failOnServiceCreateCall = 2;

    const response = await request(app)
      .post("/estimate/create-full")
      .set(auth)
      .field("payload", JSON.stringify({
        project: {
          seller_user_id: "seller-1",
          price: 300,
          status_project: "Pending",
          company_id: "company-1",
          client: {
            name: "Client One",
            email: "client@example.com",
            phone: "555-0101",
          },
          location: "123 Main St",
          lat: "40.7128",
          log: "-74.0060",
          radius: "25",
        },
        pdf: {
          type_pdf: "estimate",
          templateNumber: 2,
        },
        estimate: {
          preGeneratedNumber: "1001",
          totalAmount: 300,
          type_estimate: "estimate",
        },
        services: [
          {
            name: "Service created before failure",
            quantity: 1,
            unitPrice: 100,
            lineTotal: 100,
          },
          {
            name: "Service that fails",
            quantity: 1,
            unitPrice: 200,
            lineTotal: 200,
          },
        ],
      }))
      .attach("file", Buffer.from("%PDF-1.4\n%%EOF"), "estimate.pdf");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: "Internal server error while creating full estimate",
    });

    expect(mockState.clients).toEqual([]);
    expect(mockState.projects).toEqual([]);
    expect(mockState.pdfProjects).toEqual([]);
    expect(mockState.estimates).toEqual([]);
    expect(mockState.estimateServices).toEqual([]);
    expect(mockState.serviceProjects).toEqual([]);
    expect(mockState.imgServiceProjects).toEqual([]);
    expect(mockState.imagesAttachments).toEqual([]);
    expect(mockState.aiSessions).toEqual([]);
  });

  it("keeps creating the unified estimate when the company PDF signature step fails", async () => {
    (addCompanySignatureToPdfBuffer as jest.Mock).mockRejectedValueOnce(new Error("signature failed"));

    const response = await request(app)
      .post("/estimate/create-full")
      .set(auth)
      .field("payload", JSON.stringify({
        project: {
          seller_user_id: "seller-1",
          price: 100,
          status_project: "Pending",
          company_id: "company-1",
          client: {
            name: "Client One",
            email: "client@example.com",
            phone: "555-0101",
          },
          location: "123 Main St",
          lat: "40.7128",
          log: "-74.0060",
          radius: "25",
        },
        pdf: {
          type_pdf: "estimate",
          templateNumber: 2,
        },
        estimate: {
          preGeneratedNumber: "1001",
          totalAmount: 100,
          type_estimate: "estimate",
        },
        services: [
          {
            name: "Roof Repair",
            quantity: 1,
            unitPrice: 100,
            lineTotal: 100,
          },
        ],
      }))
      .attach("file", Buffer.from("%PDF-1.4\n%%EOF"), "estimate.pdf");

    expect(response.status).toBe(201);
    expect(mockState.projects).toHaveLength(1);
    expect(mockState.estimates).toHaveLength(1);
    expect(mockState.pdfProjects).toEqual([
      expect.objectContaining({
        project_id: "project-1",
        estimate_id: "estimate-1",
      }),
    ]);
  });
});
