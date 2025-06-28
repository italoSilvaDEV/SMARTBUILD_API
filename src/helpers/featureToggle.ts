
import { prisma } from '../utils/prisma';


// Helper function para verificar se multi-company está habilitado
export async function isMultiCompanyEnabled(): Promise<boolean> {
  const config = await prisma.config.findUnique({
    where: {
      id: '1'
    }
  })
  return config?.multiCompanyEnabled || false;
}
