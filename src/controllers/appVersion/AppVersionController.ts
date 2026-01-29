import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class AppVersionController {
  // GET /app/version - Endpoint público (sem autenticação)
  async getVersion(request: Request, response: Response) {
    try {
      // Buscar a configuração de versão mais recente
      const appVersion = await prisma.appVersion.findFirst({
        orderBy: {
          updatedAt: 'desc'
        }
      });

      // Se não houver configuração, retornar valores padrão que não bloqueiam o app
      if (!appVersion) {
        return response.json({
          minimumVersion: "0.0.0",
          currentVersion: "1.84",
          forceUpdate: false,
          message: null
        });
      }

      return response.json({
        minimumVersion: appVersion.minimumVersion,
        currentVersion: appVersion.currentVersion || null,
        forceUpdate: appVersion.forceUpdate,
        message: appVersion.message || null
      });
    } catch (error) {
      // console.error("Erro ao buscar versão do app:", error);
      // Em caso de erro, retornar valores que não bloqueiam o app
      return response.json({
        minimumVersion: "0.0.0",
        currentVersion: "1.84",
        forceUpdate: false,
        message: null
      });
    }
  }

  // GET /app/version/admin - Endpoint protegido para buscar configuração atual
  async getVersionAdmin(request: Request, response: Response) {
    try {
      const appVersion = await prisma.appVersion.findFirst({
        orderBy: {
          updatedAt: 'desc'
        }
      });

      if (!appVersion) {
        return response.status(404).json({
          error: "Configuração de versão não encontrada"
        });
      }

      return response.json(appVersion);
    } catch (error) {
      // console.error("Erro ao buscar versão do app (admin):", error);
      return response.status(500).json({
        error: "Erro interno do servidor"
      });
    }
  }

  // PUT /app/version/admin - Endpoint protegido para atualizar configuração
  async updateVersion(request: Request, response: Response) {
    try {
      const { minimumVersion, currentVersion, forceUpdate, message } = request.body;

      // Validações
      if (!minimumVersion || typeof minimumVersion !== 'string') {
        return response.status(400).json({
          error: "minimumVersion é obrigatório e deve ser uma string"
        });
      }

      if (typeof forceUpdate !== 'boolean') {
        return response.status(400).json({
          error: "forceUpdate é obrigatório e deve ser um boolean"
        });
      }

      // Buscar configuração existente ou criar nova
      let appVersion = await prisma.appVersion.findFirst({
        orderBy: {
          updatedAt: 'desc'
        }
      });

      if (appVersion) {
        // Atualizar configuração existente
        appVersion = await prisma.appVersion.update({
          where: { id: appVersion.id },
          data: {
            minimumVersion,
            currentVersion: currentVersion || null,
            forceUpdate,
            message: message || null
          }
        });
      } else {
        // Criar nova configuração
        appVersion = await prisma.appVersion.create({
          data: {
            minimumVersion,
            currentVersion: currentVersion || null,
            forceUpdate,
            message: message || null
          }
        });
      }

      return response.json({
        success: true,
        data: appVersion
      });
    } catch (error) {
      // console.error("Erro ao atualizar versão do app:", error);
      return response.status(500).json({
        error: "Erro interno do servidor"
      });
    }
  }
}

