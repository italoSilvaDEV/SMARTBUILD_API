import Jwt from "jsonwebtoken";

jest.useFakeTimers();

jest.mock("../../src/utils/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  },
}));

const { prisma } = require("../../src/utils/prisma");
const { checkToken } = require("../../src/middlewares/checkToken");

describe("checkToken session revocation", () => {
  const secret = "test-session-secret";

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SECRET_JWT = secret;
  });

  function runMiddleware(token: string) {
    return new Promise<{
      req: any;
      res: any;
      next: jest.Mock;
    }>((resolve) => {
      const req: any = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      };
      let next: jest.Mock;
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(() => resolve({ req, res, next })),
      };
      next = jest.fn(() => resolve({ req, res, next }));

      checkToken(req, res, next);
    });
  }

  it("accepts a valid session for an enabled user", async () => {
    prisma.user.findUnique.mockResolvedValue({ isDisabled: false });
    const token = Jwt.sign({ id: "enabled-user" }, secret, {
      algorithm: "HS256",
      expiresIn: "5m",
    });

    const { req, res, next } = await runMiddleware(token);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "enabled-user" },
      select: { isDisabled: true },
    });
    expect(req.userId).toBe("enabled-user");
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it("revokes an existing token when the user is disabled", async () => {
    prisma.user.findUnique.mockResolvedValue({ isDisabled: true });
    const token = Jwt.sign({ id: "disabled-user" }, secret, {
      algorithm: "HS256",
      expiresIn: "5m",
    });

    const { req, res, next } = await runMiddleware(token);

    expect(req.userId).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Access denied" });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects a token whose user no longer exists", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const token = Jwt.sign({ id: "missing-user" }, secret, {
      algorithm: "HS256",
      expiresIn: "5m",
    });

    const { res, next } = await runMiddleware(token);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Access denied" });
  });
});
