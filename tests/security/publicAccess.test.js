const { execFileSync } = require("child_process");
const path = require("path");

describe("scoped public access behavior", () => {
  it("validates registration, signed estimate, legacy estimate and authentication fallbacks", () => {
    const runner = path.resolve(__dirname, "publicAccess.behavior.cjs");

    try {
      execFileSync(
        process.execPath,
        ["-r", "ts-node/register/transpile-only", runner],
        {
          cwd: path.resolve(__dirname, "../.."),
          env: {
            ...process.env,
            SECRET_JWT: "test-only-public-access-secret",
          },
          encoding: "utf8",
          timeout: 15_000,
          stdio: "pipe",
        }
      );
    } catch (error) {
      const details = [error.stdout, error.stderr].filter(Boolean).join("\n");
      throw new Error(`Public access behavior check failed:\n${details || error.message}`);
    }
  });
});
