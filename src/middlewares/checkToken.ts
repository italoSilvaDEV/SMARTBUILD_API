import { Request, Response, NextFunction } from "express";
import Jwt from 'jsonwebtoken'
import { prisma } from '../utils/prisma'

// Cache em memória para throttling de updates do last_acess
// Formato: Map<userId, lastUpdateTimestamp>
const lastAccessCache = new Map<string, number>();

// Intervalo mínimo entre updates (10 minutos em ms)
const UPDATE_THROTTLE_MS = 10 * 60 * 1000;

// Limpar cache a cada hora para evitar memory leak
setInterval(() => {
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  
  for (const [userId, timestamp] of lastAccessCache.entries()) {
    if (timestamp < oneHourAgo) {
      lastAccessCache.delete(userId);
    }
  }
}, 60 * 60 * 1000); // Executa a cada 1 hora

export function checkToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization']
  if (!authHeader) {

    return res.status(400).json({ error: "Token not informed" });
  }
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Failed to authenticate token" });
  }

  const secret = process.env.SECRET_JWT;
  if (!secret) {
    console.error("SECRET_JWT is not configured");
    return res.status(500).json({ error: "Authentication is not configured" });
  }

  Jwt.verify(token, secret, { algorithms: ["HS256"] }, async function (err, decoded: any) {
    if (err) {
      return res.status(401).json({ error: "Failed to authenticate token" });
    }

    // Purpose/type tokens are capabilities for narrow flows, never user sessions.
    if (!decoded || typeof decoded !== "object" || decoded.purpose || decoded.type) {
      return res.status(401).json({ error: "Failed to authenticate token" });
    }

    // Atualizar last_acess do usuário com throttling
    const userId = typeof decoded.id === "string"
      ? decoded.id
      : (typeof decoded.sub === "string" ? decoded.sub : null);
    if (!userId) {
      return res.status(401).json({ error: "Failed to authenticate token" });
    }

    try {
      const sessionUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { isDisabled: true },
      });

      if (!sessionUser || sessionUser.isDisabled) {
        return res.status(403).json({ error: "Access denied" });
      }
    } catch (error) {
      console.error("Failed to validate session user:", error);
      return res.status(503).json({ error: "Unable to validate access" });
    }

    (req as any).userId = userId;

    if (userId) {
      const now = Date.now();
      const lastUpdate = lastAccessCache.get(userId);
      
      // Só atualiza se passou mais de X minutos desde o último update
      if (!lastUpdate || (now - lastUpdate) >= UPDATE_THROTTLE_MS) {
        lastAccessCache.set(userId, now);
        
        // Executa em background sem bloquear a requisição
        prisma.user.update({
          where: { id: userId },
          data: { last_acess: new Date() }
        }).catch((error) => {
          // Log do erro mas não bloqueia a requisição
          console.error('Erro ao atualizar last_acess:', error);
        });
      }
    }

    next();
  });
}
