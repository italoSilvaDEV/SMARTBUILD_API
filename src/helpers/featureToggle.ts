
import { prisma } from '../utils/prisma';

export async function isMultiCompanyEnabled(): Promise<boolean> {
  try {
    const config = await prisma.config.findUnique({
      where: {
        id: '1'
      }
    })

    return config?.multiCompanyEnabled || false;
  } catch (error) {
    console.error("[featureToggle] Failed to load multi-company config:", error);
    return false;
  }
}
