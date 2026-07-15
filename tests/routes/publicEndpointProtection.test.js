const fs = require("fs");
const path = require("path");
const ts = require("typescript");

function getRouteArguments(fileName, method, routePath) {
  const filePath = path.resolve(__dirname, "../../src/routes", fileName);
  const sourceText = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  let result = null;

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === method
    ) {
      const args = node.arguments.map((argument) => argument.getText(sourceFile));
      const declaredPath = args[0]?.replace(/^['"]|['"]$/g, "");
      if (declaredPath === routePath) result = args;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  if (!result) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found in ${fileName}`);
  return result;
}

describe("routes that must never be public", () => {
  const protectedRoutes = [
    ["auditRoutes.ts", "get", "/user/:userId"],
    ["auditRoutes.ts", "get", "/"],
    ["extraEmployeeRoutes.ts", "get", "/config"],
    ["extraEmployeeRoutes.ts", "put", "/price"],
    ["extraEmployeeRoutes.ts", "get", "/company/:companyId"],
    ["extraEmployeeRoutes.ts", "get", "/company/:companyId/users"],
    ["extraEmployeeRoutes.ts", "post", "/company/:companyId"],
    ["extraEmployeeRoutes.ts", "post", "/company/:companyId/reduce"],
    ["quickBooksConfigRoutes.ts", "get", "/company/:companyId"],
    ["quickBooksConfigRoutes.ts", "get", "/company/:companyId/:configType"],
    ["quickBooksConfigRoutes.ts", "patch", "/company/:companyId"],
    ["quickBooksConfigRoutes.ts", "delete", "/company/:companyId/:configType"],
    ["userAttendanceRoutes.ts", "put", "/user-attendance/:id/update-times"],
  ];

  it.each(protectedRoutes)("protects %s %s %s with checkToken", (fileName, method, routePath) => {
    expect(getRouteArguments(fileName, method, routePath)).toContain("checkToken");
  });
});

describe("public business flows use scoped access middleware", () => {
  const scopedRoutes = [
    ["subscriptionRoutes.ts", "post", "/subscriptions", "checkTokenOrRegistrationToken"],
    ["estimateRoutes.ts", "get", "/:id", "checkTokenOrEstimatePublicAccess"],
    ["estimateRoutes.ts", "patch", "/:id/status", "checkTokenOrEstimatePublicAccess"],
    ["estimateRoutes.ts", "patch", "/:id/sign", "checkTokenOrEstimatePublicAccess"],
  ];

  it.each(scopedRoutes)("protects %s %s %s with %s", (fileName, method, routePath, middleware) => {
    expect(getRouteArguments(fileName, method, routePath)).toContain(middleware);
  });
});
