import { EstimateController } from "../../../src/controllers/projects/EstimateController";
import { Request, Response } from "express";
import { prisma } from "../../../src/utils/prisma";
import { getPresignedUrl } from "../../../src/utils/S3/getPresignedUrl";
import nodemailer from "nodemailer";
import { returnPayLoad } from "../../../src/config/returnPayLoad";

// Mock dependencies
jest.mock("../../../src/utils/prisma", () => ({
  prisma: {
    project: {
      findUnique: jest.fn(),
    },
    contractNotes: {
      findMany: jest.fn(),
    },
    estimate: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    estimateServiceProject: {
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    estimateTimeline: {
      create: jest.fn(),
    },
    estimateEmailLog: {
      create: jest.fn(),
    },
  },
}));

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({
    verify: jest.fn((callback) => callback(null, true)),
    sendMail: jest.fn().mockResolvedValue(true),
  })),
}));

jest.mock("../../../src/utils/S3/getPresignedUrl", () => ({
  getPresignedUrl: jest.fn().mockResolvedValue("mocked-presigned-url"),
}));

jest.mock("../../../src/config/returnPayLoad", () => ({
  returnPayLoad: jest.fn(),
}));

// Mock SMTP config
jest.mock("../../../src/config/smtp", () => ({
  host: "smtp.example.com",
  port: 587,
  user: "test@example.com",
  pass: "password123",
}));

describe("EstimateController", () => {
  let controller: EstimateController;
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    controller = new EstimateController();
    req = {
      params: {},
      body: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe("create", () => {
    it("should create a new estimate", async () => {
      // Setup
      req.body = { projectId: "project-123" };
      
      const mockProject = {
        id: "project-123",
        company_id: "company-123",
        contract_number: "C001",
        serviceProject: [
          { name: "Service 1", price: 100, hours: 10, description: "Description 1" },
        ],
        client: { email: "client@example.com" },
        company: { name: "Test Company" },
        estimates: [],
      };

      const mockContractNotes = [
        { notes: "Term 1", updatedAt: new Date() },
      ];

      const mockEstimate = {
        id: "estimate-123",
        number: "0001",
        description: "Estimate #0001 for Project C001",
        status: "pending",
      };

      (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProject);
      (prisma.contractNotes.findMany as jest.Mock).mockResolvedValue(mockContractNotes);
      (prisma.estimate.create as jest.Mock).mockResolvedValue(mockEstimate);
      
      // Execute
      await controller.create(req as Request, res as Response);

      // Assert
      expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: "project-123" },
        include: expect.any(Object),
      });
      
      expect(prisma.estimate.create).toHaveBeenCalled();
      expect(nodemailer.createTransport).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockEstimate);
    });

    it("should return 404 if project not found", async () => {
      // Setup
      req.body = { projectId: "non-existent" };
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);
      
      // Execute
      await controller.create(req as Request, res as Response);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Project not found" });
    });

    it("should handle errors properly", async () => {
      // Setup
      req.body = { projectId: "project-123" };
      (prisma.project.findUnique as jest.Mock).mockRejectedValue(new Error("Database error"));
      
      // Execute
      await controller.create(req as Request, res as Response);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to create change order" });
    });
  });

  describe("findByProject", () => {
    it("should fetch estimates for a project", async () => {
      // Setup
      req.params = { projectId: "project-123" };
      const mockEstimates = [
        { id: "estimate-1", number: "0001" },
        { id: "estimate-2", number: "0002" },
      ];
      (prisma.estimate.findMany as jest.Mock).mockResolvedValue(mockEstimates);
      
      // Execute
      await controller.findByProject(req as Request, res as Response);

      // Assert
      expect(prisma.estimate.findMany).toHaveBeenCalledWith({
        where: { projectId: "project-123" },
        include: expect.any(Object),
        orderBy: { date_creation: 'desc' },
      });
      expect(res.json).toHaveBeenCalledWith(mockEstimates);
    });

    it("should handle errors properly", async () => {
      // Setup
      req.params = { projectId: "project-123" };
      (prisma.estimate.findMany as jest.Mock).mockRejectedValue(new Error("Database error"));
      
      // Execute
      await controller.findByProject(req as Request, res as Response);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to fetch estimates" });
    });
  });

  describe("findById", () => {
    it("should fetch an estimate by id", async () => {
      // Setup
      req.params = { id: "estimate-123" };
      const mockEstimate = {
        id: "estimate-123",
        number: "0001",
        project: {
          company: {
            avatar: "avatar-url",
          },
        },
      };
      (prisma.estimate.findUnique as jest.Mock).mockResolvedValue(mockEstimate);
      
      // Execute
      await controller.findById(req as Request, res as Response);

      // Assert
      expect(prisma.estimate.findUnique).toHaveBeenCalledWith({
        where: { id: "estimate-123" },
        include: expect.any(Object),
      });
      expect(getPresignedUrl).toHaveBeenCalledWith("avatar-url");
      expect(res.json).toHaveBeenCalledWith({
        ...mockEstimate,
        project: {
          company: {
            avatar: "mocked-presigned-url",
          },
        },
      });
    });

    it("should return 404 if estimate not found", async () => {
      // Setup
      req.params = { id: "non-existent" };
      (prisma.estimate.findUnique as jest.Mock).mockResolvedValue(null);
      
      // Execute
      await controller.findById(req as Request, res as Response);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Estimate not found" });
    });

    it("should handle errors properly", async () => {
      // Setup
      req.params = { id: "estimate-123" };
      (prisma.estimate.findUnique as jest.Mock).mockRejectedValue(new Error("Database error"));
      
      // Execute
      await controller.findById(req as Request, res as Response);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to fetch estimate" });
    });
  });

  describe("update", () => {
    it("should update an estimate", async () => {
      // Setup
      req.params = { id: "estimate-123" };
      req.body = {
        description: "Updated description",
        terms: "Updated terms",
        totalAmount: 2000,
      };
      const mockUpdatedEstimate = {
        id: "estimate-123",
        description: "Updated description",
        terms: "Updated terms",
        totalAmount: 2000,
      };
      (prisma.estimate.update as jest.Mock).mockResolvedValue(mockUpdatedEstimate);
      
      // Execute
      await controller.update(req as Request, res as Response);

      // Assert
      expect(prisma.estimate.update).toHaveBeenCalledWith({
        where: { id: "estimate-123" },
        data: {
          description: "Updated description",
          terms: "Updated terms",
          totalAmount: 2000,
          date_update: expect.any(Date),
        },
      });
      expect(res.json).toHaveBeenCalledWith(mockUpdatedEstimate);
    });

    it("should handle errors properly", async () => {
      // Setup
      req.params = { id: "estimate-123" };
      req.body = { description: "Updated description" };
      (prisma.estimate.update as jest.Mock).mockRejectedValue(new Error("Database error"));
      
      // Execute
      await controller.update(req as Request, res as Response);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to update estimate" });
    });
  });

  describe("updateStatus", () => {
    it("should update estimate status", async () => {
      // Setup
      req.params = { id: "estimate-123" };
      req.body = { status: "approved" };
      
      const mockEstimate = {
        id: "estimate-123",
        status: "approved",
        projectId: "project-123",
      };
      
      const mockProject = {
        id: "project-123",
        contract_number: "C001",
        user: {
          email: "user@example.com",
        },
      };
      
      (prisma.estimate.update as jest.Mock).mockResolvedValue(mockEstimate);
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProject);
      
      // Execute
      await controller.updateStatus(req as Request, res as Response);

      // Assert
      expect(prisma.estimate.update).toHaveBeenCalledWith({
        where: { id: "estimate-123" },
        data: {
          status: "approved",
          date_update: expect.any(Date),
        },
      });
      expect(res.json).toHaveBeenCalledWith(mockEstimate);
    });

    it("should return 400 for invalid status", async () => {
      // Setup
      req.params = { id: "estimate-123" };
      req.body = { status: "invalid-status" };
      
      // Execute
      await controller.updateStatus(req as Request, res as Response);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid status" });
    });

    it("should handle errors properly", async () => {
      // Setup
      req.params = { id: "estimate-123" };
      req.body = { status: "approved" };
      (prisma.estimate.update as jest.Mock).mockRejectedValue(new Error("Database error"));
      
      // Execute
      await controller.updateStatus(req as Request, res as Response);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to update estimate status" });
    });
  });

  describe("addSignature", () => {
    it("should add signature and approve estimate", async () => {
      // Setup
      req.params = { id: "estimate-123" };
      req.body = { signature: "base64-signature-data" };
      
      const mockEstimate = {
        id: "estimate-123",
        status: "approved",
        projectId: "project-123",
      };
      
      const mockProject = {
        id: "project-123",
        user: {
          email: "user@example.com",
        },
      };
      
      (prisma.estimate.update as jest.Mock).mockResolvedValue(mockEstimate);
      (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProject);
      
      // Execute
      await controller.addSignature(req as Request, res as Response);

      // Assert
      expect(prisma.estimate.update).toHaveBeenCalledWith({
        where: { id: "estimate-123" },
        data: {
          clientSignature: JSON.stringify({ signature: "base64-signature-data" }),
          status: "approved",
          date_update: expect.any(Date),
        },
      });
      expect(res.json).toHaveBeenCalledWith(mockEstimate);
    });

    it("should handle errors properly", async () => {
      // Setup
      req.params = { id: "estimate-123" };
      req.body = { signature: "base64-signature-data" };
      (prisma.estimate.update as jest.Mock).mockRejectedValue(new Error("Database error"));
      
      // Execute
      await controller.addSignature(req as Request, res as Response);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to add signature to estimate" });
    });
  });

  describe("cancel", () => {
    it("should cancel an estimate", async () => {
      // Setup
      req.params = { id: "estimate-123" };
      req.body = { cancellationReason: "Client requested cancellation" };
      
      const mockPayload = { id: "user-123" };
      (returnPayLoad as jest.Mock).mockReturnValue(mockPayload);
      
      const mockEstimate = {
        id: "estimate-123",
        status: "canceled",
        projectId: "project-123",
      };
      
      (prisma.estimate.update as jest.Mock).mockResolvedValue(mockEstimate);
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        id: "project-123",
      });
      
      // Execute
      await controller.cancel(req as Request, res as Response);

      // Assert
      expect(prisma.estimate.update).toHaveBeenCalledWith({
        where: { id: "estimate-123" },
        data: {
          status: "canceled",
          canceledAt: expect.any(Date),
          canceledById: "user-123",
          cancellationReason: "Client requested cancellation",
          date_update: expect.any(Date),
        },
      });
      expect(res.json).toHaveBeenCalledWith(mockEstimate);
    });

    it("should return 401 if user not authenticated", async () => {
      // Setup
      req.params = { id: "estimate-123" };
      req.body = { cancellationReason: "Client requested cancellation" };
      
      (returnPayLoad as jest.Mock).mockReturnValue(null);
      
      // Execute
      await controller.cancel(req as Request, res as Response);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to cancel estimate" });
    });

    it("should handle errors properly", async () => {
      // Setup
      req.params = { id: "estimate-123" };
      req.body = { cancellationReason: "Client requested cancellation" };
      
      const mockPayload = { id: "user-123" };
      (returnPayLoad as jest.Mock).mockReturnValue(mockPayload);
      
      (prisma.estimate.update as jest.Mock).mockRejectedValue(new Error("Database error"));
      
      // Execute
      await controller.cancel(req as Request, res as Response);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to cancel estimate" });
    });
  });

  describe("addService", () => {
    it("should add a service to an estimate", async () => {
      // Setup
      req.params = { id: "estimate-123" };
      req.body = {
        name: "New Service",
        quantity: 5,
        unitPrice: 100,
        lineTotal: 500,
        notes: "Service notes",
      };
      
      const mockServiceProject = {
        id: "service-123",
        name: "New Service",
        quantity: 5,
        unitPrice: 100,
        lineTotal: 500,
      };
      
      const mockEstimate = {
        id: "estimate-123",
        serviceProjects: [
          mockServiceProject,
          { id: "service-456", lineTotal: 300 },
        ],
      };
      
      (prisma.estimateServiceProject.create as jest.Mock).mockResolvedValue(mockServiceProject);
      (prisma.estimate.findUnique as jest.Mock).mockResolvedValue(mockEstimate);
      
      // Execute
      await controller.addService(req as Request, res as Response);

      // Assert
      expect(prisma.estimateServiceProject.create).toHaveBeenCalledWith({
        data: {
          estimate: {
            connect: { id: "estimate-123" },
          },
          name: "New Service",
          quantity: 5,
          unitPrice: 100,
          lineTotal: 500,
          notes: "Service notes",
        },
      });
      
      expect(prisma.estimate.update).toHaveBeenCalledWith({
        where: { id: "estimate-123" },
        data: {
          totalAmount: 800, // 500 + 300
          date_update: expect.any(Date),
        },
      });
      
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockServiceProject);
    });

    it("should handle errors properly", async () => {
      // Setup
      req.params = { id: "estimate-123" };
      req.body = {
        name: "New Service",
        quantity: 5,
        unitPrice: 100,
        lineTotal: 500,
      };
      
      (prisma.estimateServiceProject.create as jest.Mock).mockRejectedValue(new Error("Database error"));
      
      // Execute
      await controller.addService(req as Request, res as Response);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to add service to estimate" });
    });
  });

  describe("removeService", () => {
    it("should remove a service from an estimate", async () => {
      // Setup
      req.params = { id: "service-123" };
      
      const mockServiceProject = {
        id: "service-123",
        estimateId: "estimate-123",
      };
      
      const mockEstimate = {
        id: "estimate-123",
        serviceProjects: [
          { id: "service-456", lineTotal: 300 },
        ],
      };
      
      (prisma.estimateServiceProject.findFirst as jest.Mock).mockResolvedValue(mockServiceProject);
      (prisma.estimateServiceProject.delete as jest.Mock).mockResolvedValue(mockServiceProject);
      (prisma.estimate.findUnique as jest.Mock).mockResolvedValue(mockEstimate);
      
      // Execute
      await controller.removeService(req as Request, res as Response);

      // Assert
      expect(prisma.estimateServiceProject.findFirst).toHaveBeenCalledWith({
        where: { id: "service-123" },
      });
      
      expect(prisma.estimateServiceProject.delete).toHaveBeenCalledWith({
        where: { id: "service-123" },
      });
      
      expect(prisma.estimate.update).toHaveBeenCalledWith({
        where: { id: "estimate-123" },
        data: {
          totalAmount: 300,
          date_update: expect.any(Date),
        },
      });
      
      expect(res.json).toHaveBeenCalledWith({ message: "Service removed from estimate" });
    });

    it("should return 404 if service not found", async () => {
      // Setup
      req.params = { id: "non-existent" };
      (prisma.estimateServiceProject.findFirst as jest.Mock).mockResolvedValue(null);
      
      // Execute
      await controller.removeService(req as Request, res as Response);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Service not found in this change order" });
    });

    it("should handle errors properly", async () => {
      // Setup
      req.params = { id: "service-123" };
      (prisma.estimateServiceProject.findFirst as jest.Mock).mockRejectedValue(new Error("Database error"));
      
      // Execute
      await controller.removeService(req as Request, res as Response);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to remove service from estimate" });
    });
  });

  describe("updateService", () => {
    it("should update a service in an estimate", async () => {
      // Setup
      req.params = { id: "service-123" };
      req.body = {
        quantity: 10,
        unitPrice: 50,
        lineTotal: 500,
        notes: "Updated notes",
      };
      
      const mockServiceProject = {
        id: "service-123",
        estimateId: "estimate-123",
      };
      
      const updatedServiceProject = {
        ...mockServiceProject,
        quantity: 10,
        unitPrice: 50,
        lineTotal: 500,
        notes: "Updated notes",
      };
      
      const mockEstimate = {
        id: "estimate-123",
        serviceProjects: [
          updatedServiceProject,
          { id: "service-456", lineTotal: 300 },
        ],
      };
      
      (prisma.estimateServiceProject.findFirst as jest.Mock).mockResolvedValue(mockServiceProject);
      (prisma.estimateServiceProject.update as jest.Mock).mockResolvedValue(updatedServiceProject);
      (prisma.estimate.findUnique as jest.Mock).mockResolvedValue(mockEstimate);
      
      // Execute
      await controller.updateService(req as Request, res as Response);

      // Assert
      expect(prisma.estimateServiceProject.findFirst).toHaveBeenCalledWith({
        where: { id: "service-123" },
      });
      
      expect(prisma.estimateServiceProject.update).toHaveBeenCalledWith({
        where: { id: "service-123" },
        data: {
          quantity: 10,
          unitPrice: 50,
          lineTotal: 500,
          notes: "Updated notes",
          date_update: expect.any(Date),
        },
      });
      
      expect(prisma.estimate.update).toHaveBeenCalledWith({
        where: { id: "estimate-123" },
        data: {
          totalAmount: 800, // 500 + 300
          date_update: expect.any(Date),
        },
      });
      
      expect(res.json).toHaveBeenCalledWith(updatedServiceProject);
    });

    it("should return 404 if service not found", async () => {
      // Setup
      req.params = { id: "non-existent" };
      req.body = { quantity: 10 };
      (prisma.estimateServiceProject.findFirst as jest.Mock).mockResolvedValue(null);
      
      // Execute
      await controller.updateService(req as Request, res as Response);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Service not found in this change order" });
    });

    it("should handle errors properly", async () => {
      // Setup
      req.params = { id: "service-123" };
      req.body = { quantity: 10 };
      (prisma.estimateServiceProject.findFirst as jest.Mock).mockRejectedValue(new Error("Database error"));
      
      // Execute
      await controller.updateService(req as Request, res as Response);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to update service in estimate" });
    });
  });

  describe("resendEmail", () => {
    it("should resend emails to multiple recipients", async () => {
      // Setup
      req.params = { id: "estimate-123" };
      req.body = { emails: ["client1@example.com", "client2@example.com"] };
      
      const mockEstimate = {
        id: "estimate-123",
        number: "0001",
        status: "pending",
        totalAmount: 1000,
        project: {
          contract_number: "C001",
        },
      };
      
      (prisma.estimate.findUnique as jest.Mock).mockResolvedValue(mockEstimate);
      
      // Execute
      await controller.resendEmail(req as Request, res as Response);

      // Assert
      expect(prisma.estimate.findUnique).toHaveBeenCalledWith({
        where: { id: "estimate-123" },
        include: expect.any(Object),
      });
      
      expect(nodemailer.createTransport().sendMail).toHaveBeenCalledTimes(2);
      expect(prisma.estimateEmailLog.create).toHaveBeenCalledTimes(2);
      
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        results: [
          { email: "client1@example.com", status: "success" },
          { email: "client2@example.com", status: "success" },
        ],
      });
    });

    it("should return 400 if no emails provided", async () => {
      // Setup
      req.params = { id: "estimate-123" };
      req.body = { emails: [] };
      
      // Execute
      await controller.resendEmail(req as Request, res as Response);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Please provide at least one email address" });
    });

    it("should return 404 if estimate not found", async () => {
      // Setup
      req.params = { id: "non-existent" };
      req.body = { emails: ["client@example.com"] };
      (prisma.estimate.findUnique as jest.Mock).mockResolvedValue(null);
      
      // Execute
      await controller.resendEmail(req as Request, res as Response);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Estimate not found" });
    });

    it("should handle email sending errors", async () => {
      // Setup
      req.params = { id: "estimate-123" };
      req.body = { emails: ["client@example.com"] };
      
      const mockEstimate = {
        id: "estimate-123",
        number: "0001",
        status: "pending",
        project: {
          contract_number: "C001",
        },
      };
      
      (prisma.estimate.findUnique as jest.Mock).mockResolvedValue(mockEstimate);
      (nodemailer.createTransport().sendMail as jest.Mock).mockRejectedValue(new Error("SMTP error"));
      
      // Execute
      await controller.resendEmail(req as Request, res as Response);

      // Assert
      expect(prisma.estimateEmailLog.create).toHaveBeenCalledWith({
        data: {
          estimate: { connect: { id: "estimate-123" } },
          recipient: "client@example.com",
          status: "error",
          errorMessage: "SMTP error",
          sentAt: expect.any(Date),
        },
      });
      
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        results: [
          { email: "client@example.com", status: "error", message: "SMTP error" },
        ],
      });
    });

    it("should handle general errors", async () => {
      // Setup
      req.params = { id: "estimate-123" };
      req.body = { emails: ["client@example.com"] };
      (prisma.estimate.findUnique as jest.Mock).mockRejectedValue(new Error("Database error"));
      
      // Execute
      await controller.resendEmail(req as Request, res as Response);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Failed to resend estimate email" });
    });
  });
}); 