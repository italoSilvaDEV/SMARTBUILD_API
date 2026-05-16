/// <reference types="node" />
import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

const envPaths = [
  resolve(__dirname, "../.env"),
  resolve(process.cwd(), ".env"),
  resolve(__dirname, "../.env.local"),
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    config({ path: envPath });
    console.log(`Environment loaded from: ${envPath}`);
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  config();
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not found.");
  process.exit(1);
}

import { prisma } from "../src/utils/prisma";

const OWNER_FULL_ACCESS_DATA = {
  invoiceEditAll: true,
  projectEditAll: true,
  estimateEditAll: true,
  projectVisibilityMode: "allActive",
} as const;

async function main() {
  const ownerLinks = await prisma.userCompany.findMany({
    where: {
      office: {
        name: {
          equals: "Owner",
        },
      },
    },
    select: {
      userId: true,
      companyId: true,
      user: {
        select: {
          email: true,
          name: true,
        },
      },
      office: {
        select: {
          name: true,
        },
      },
    },
  });

  const directOwnerUsers = await prisma.user.findMany({
    where: {
      office: {
        name: {
          equals: "Owner",
        },
      },
    },
    select: {
      id: true,
      company_id: true,
      email: true,
      name: true,
    },
  });

  const ownerUserIds = [
    ...new Set([
      ...ownerLinks.map((link) => link.userId),
      ...directOwnerUsers.map((user) => user.id),
    ]),
  ];

  if (ownerUserIds.length === 0) {
    console.log("No owner users found.");
    return;
  }

  const result = await prisma.user.updateMany({
    where: {
      id: {
        in: ownerUserIds,
      },
    },
    data: OWNER_FULL_ACCESS_DATA,
  });

  console.log("Owner full-access backfill completed.");
  console.log({
    ownerLinksFound: ownerLinks.length,
    directOwnerUsersFound: directOwnerUsers.length,
    uniqueOwnerUsersUpdated: result.count,
  });
}

main()
  .catch((error) => {
    console.error("Owner full-access backfill failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
