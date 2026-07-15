const assert = require("assert/strict");
const Jwt = require("jsonwebtoken");
const { prisma } = require("../../src/utils/prisma");
const {
  issueEstimatePublicToken,
  issueRegistrationToken,
  verifyEstimatePublicToken,
  verifyRegistrationToken,
} = require("../../src/utils/publicAccessTokens");
const {
  checkTokenOrEstimatePublicAccess,
  checkTokenOrRegistrationToken,
} = require("../../src/middlewares/publicAccess");
const { checkToken } = require("../../src/middlewares/checkToken");

const createResponse = () => {
  const response = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return response;
};

async function run() {
  const registrationToken = issueRegistrationToken("company-1", "user-1");
  assert.deepEqual(
    {
      purpose: verifyRegistrationToken(registrationToken).purpose,
      companyId: verifyRegistrationToken(registrationToken).companyId,
      userId: verifyRegistrationToken(registrationToken).userId,
    },
    { purpose: "company_registration", companyId: "company-1", userId: "user-1" }
  );

  const wrongPurposeToken = issueEstimatePublicToken("estimate-1", "client@example.com");
  assert.throws(() => verifyRegistrationToken(wrongPurposeToken), /Invalid registration token/);

  const estimateToken = issueEstimatePublicToken("estimate-1", " Client@Example.COM ");
  const estimatePayload = verifyEstimatePublicToken(estimateToken);
  assert.equal(estimatePayload.estimateId, "estimate-1");
  assert.equal(estimatePayload.email, "client@example.com");

  const publicTokenAsAuthenticationResponse = createResponse();
  let authenticationNextCalls = 0;
  checkToken(
    { headers: { authorization: `Bearer ${estimateToken}` } },
    publicTokenAsAuthenticationResponse,
    () => authenticationNextCalls++
  );
  assert.equal(publicTokenAsAuthenticationResponse.statusCode, 401);
  assert.equal(authenticationNextCalls, 0);

  const purposeTokenSignedWithAuthenticationSecret = Jwt.sign(
    { purpose: "company_registration", userId: "user-1", companyId: "company-1" },
    process.env.SECRET_JWT,
    { algorithm: "HS256" }
  );
  const purposeTokenResponse = createResponse();
  checkToken(
    { headers: { authorization: `Bearer ${purposeTokenSignedWithAuthenticationSecret}` } },
    purposeTokenResponse,
    () => authenticationNextCalls++
  );
  assert.equal(purposeTokenResponse.statusCode, 401);
  assert.equal(authenticationNextCalls, 0);

  const originalUserUpdate = prisma.user.update;
  try {
    prisma.user.update = async () => ({ id: "user-1" });
    const authenticationToken = Jwt.sign(
      { id: "user-1", name: "Test User" },
      process.env.SECRET_JWT,
      { algorithm: "HS256" }
    );
    const authenticationResponse = createResponse();
    checkToken(
      { headers: { authorization: `Bearer ${authenticationToken}` } },
      authenticationResponse,
      () => authenticationNextCalls++
    );
    assert.equal(authenticationResponse.statusCode, null);
    assert.equal(authenticationNextCalls, 1);
  } finally {
    prisma.user.update = originalUserUpdate;
  }

  let nextCalls = 0;
  const registrationRequest = {
    headers: {},
    body: { companyId: "company-1", registrationToken },
  };
  checkTokenOrRegistrationToken(registrationRequest, createResponse(), () => nextCalls++);
  assert.equal(nextCalls, 1);
  assert.equal(registrationRequest.userId, "user-1");

  const wrongCompanyResponse = createResponse();
  checkTokenOrRegistrationToken(
    { headers: {}, body: { companyId: "company-2", registrationToken } },
    wrongCompanyResponse,
    () => nextCalls++
  );
  assert.equal(wrongCompanyResponse.statusCode, 403);
  assert.equal(nextCalls, 1);

  const missingRegistrationResponse = createResponse();
  checkTokenOrRegistrationToken(
    { headers: {}, body: {} },
    missingRegistrationResponse,
    () => nextCalls++
  );
  assert.equal(missingRegistrationResponse.statusCode, 400);
  assert.equal(nextCalls, 1);

  const signedRequest = {
    headers: {},
    query: { publicToken: estimateToken },
    body: {},
    params: { id: "estimate-1" },
  };
  await checkTokenOrEstimatePublicAccess(signedRequest, createResponse(), () => nextCalls++);
  assert.equal(nextCalls, 2);
  assert.equal(signedRequest.publicEstimateAccess, true);
  assert.equal(signedRequest.publicEstimateEmail, "client@example.com");

  const wrongEstimateResponse = createResponse();
  await checkTokenOrEstimatePublicAccess(
    { headers: {}, query: { publicToken: estimateToken }, body: {}, params: { id: "estimate-2" } },
    wrongEstimateResponse,
    () => nextCalls++
  );
  assert.equal(wrongEstimateResponse.statusCode, 403);
  assert.equal(nextCalls, 2);

  const expiredEstimateToken = Jwt.sign(
    { purpose: "estimate_response", estimateId: "estimate-1", email: "client@example.com" },
    process.env.SECRET_JWT,
    { algorithm: "HS256", expiresIn: -1 }
  );
  const expiredEstimateResponse = createResponse();
  await checkTokenOrEstimatePublicAccess(
    {
      headers: {},
      query: { publicToken: expiredEstimateToken },
      body: {},
      params: { id: "estimate-1" },
    },
    expiredEstimateResponse,
    () => nextCalls++
  );
  assert.equal(expiredEstimateResponse.statusCode, 401);
  assert.equal(nextCalls, 2);

  const originalFindUnique = prisma.estimate.findUnique;
  try {
    prisma.estimate.findUnique = async () => ({
      project: { client: { email: "client@example.com" } },
    });
    const legacyRequest = {
      headers: {},
      query: { publicToken: Buffer.from("Client@Example.com").toString("base64") },
      body: {},
      params: { id: "estimate-1" },
    };
    await checkTokenOrEstimatePublicAccess(legacyRequest, createResponse(), () => nextCalls++);
    assert.equal(nextCalls, 3);
    assert.equal(legacyRequest.publicEstimateEmail, "client@example.com");

    const legacyMismatchResponse = createResponse();
    await checkTokenOrEstimatePublicAccess(
      {
        headers: {},
        query: { publicToken: Buffer.from("attacker@example.com").toString("base64") },
        body: {},
        params: { id: "estimate-1" },
      },
      legacyMismatchResponse,
      () => nextCalls++
    );
    assert.equal(legacyMismatchResponse.statusCode, 401);
    assert.equal(nextCalls, 3);
  } finally {
    prisma.estimate.findUnique = originalFindUnique;
  }

  const missingEstimateResponse = createResponse();
  await checkTokenOrEstimatePublicAccess(
    { headers: {}, query: {}, body: {}, params: { id: "estimate-1" } },
    missingEstimateResponse,
    () => nextCalls++
  );
  assert.equal(missingEstimateResponse.statusCode, 400);
  assert.equal(nextCalls, 3);
}

run().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
