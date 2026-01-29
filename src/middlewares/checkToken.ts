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
  const token = authHeader && authHeader.split(" ")[1]
  const secret = `${process.env.SECRET_JWT}`
  Jwt.verify(token, String(secret), function (err, decoded: any) {
    if (err) {
      return res.status(401).json({ error: "Failed to authenticate token" });
    }

    // Atualizar last_acess do usuário com throttling
    const userId = req.headers['x-user-id'] as string || decoded?.userId || decoded?.id;
    
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
        });
      }
    }

    next();
  });
}
