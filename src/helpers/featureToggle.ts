
import { prisma } from '../utils/prisma';

export async function isMultiCompanyEnabled(): Promise<boolean> {
  const config = await prisma.config.findUnique({
    where: {
      id: '1'
    }
  })

  return config?.multiCompanyEnabled || false;
}
