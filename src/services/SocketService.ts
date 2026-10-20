import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import Jwt from 'jsonwebtoken';
import { userHasAccessToCompany } from '../controllers/Files/fileAccess';

type CompanyRoomRequest = string | {
  companyId?: unknown;
  token?: unknown;
};

type SocketAcknowledgement = (result: {
  ok: boolean;
  companyId?: string;
  error?: string;
}) => void;

export class SocketService {
  private static io: SocketIOServer | null = null;

  private static companyRoom(companyId: string) {
    return `company:${companyId}`;
  }

  private static parseCompanyRoomRequest(request: CompanyRoomRequest) {
    if (typeof request === 'string') {
      return { companyId: request.trim(), token: null as string | null };
    }

    const companyId = typeof request?.companyId === 'string'
      ? request.companyId.trim()
      : '';
    const token = typeof request?.token === 'string' && request.token.trim()
      ? request.token.trim()
      : null;
    return { companyId, token };
  }

  private static normalizeBearerToken(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const trimmed = value.trim();
    return trimmed.toLowerCase().startsWith('bearer ')
      ? trimmed.slice(7).trim()
      : trimmed;
  }

  private static resolveSocketUserId(socket: any, eventToken?: string | null) {
    const secret = process.env.SECRET_JWT;
    if (!secret) return null;

    const handshakeAuthorization = Array.isArray(socket.handshake?.headers?.authorization)
      ? socket.handshake.headers.authorization[0]
      : socket.handshake?.headers?.authorization;
    const token = this.normalizeBearerToken(
      eventToken || socket.handshake?.auth?.token || handshakeAuthorization
    );
    if (!token) return null;

    try {
      const decoded = Jwt.verify(token, secret, { algorithms: ['HS256'] }) as any;
      if (!decoded || typeof decoded !== 'object' || decoded.purpose || decoded.type) {
        return null;
      }
      return typeof decoded.id === 'string'
        ? decoded.id
        : (typeof decoded.sub === 'string' ? decoded.sub : null);
    } catch {
      return null;
    }
  }

  static init(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.io.on('connection', (socket) => {
      console.log(`[SocketService] New connection: ${socket.id}`);

      // Usuários podem entrar em salas baseadas em seus IDs para receber notificações privadas
      socket.on('join', (userId: string) => {
        if (userId) {
          socket.join(userId);
          console.log(`[SocketService] User ${userId} joined room`);
        }
      });
      const verifiedLeases = new Map<string, ReturnType<typeof setTimeout>>();
      socket.on('disconnect', () => { for (const timer of verifiedLeases.values()) clearTimeout(timer); verifiedLeases.clear(); });
      socket.on('join_verified', async (request: { token?: string }) => {
        const userId = this.resolveSocketUserId(socket, request?.token);
        if (!userId) return;
        const { prisma } = await import('../utils/prisma');
        try {
          const user = await prisma.user.findFirst({ where: { id: userId, isDisabled: false }, select: { id: true } });
          const token = this.normalizeBearerToken(request?.token || socket.handshake?.auth?.token || socket.handshake?.headers?.authorization);
          const claims = token ? Jwt.verify(token, process.env.SECRET_JWT!, { algorithms: ['HS256'] }) as Jwt.JwtPayload : null;
          if (user && claims?.exp && claims.exp * 1000 > Date.now()) {
            const room = 'verified-user:' + userId;
            await socket.join(room);
            const previous = verifiedLeases.get(room); if (previous) clearTimeout(previous);
            const timer = setTimeout(() => { socket.leave(room); verifiedLeases.delete(room); }, Math.min(claims.exp * 1000 - Date.now(), 2147483647));
            timer.unref(); verifiedLeases.set(room, timer);
          }
        } catch { /* HTTP remains available when socket authorization fails. */ }
      });

      // Tracking 2.0 company rooms. The token can be sent on the event during
      // transition, or once through Socket.IO handshake auth/Authorization.
      // Existing clients that never join a company room remain connected and
      // continue receiving data through their HTTP polling fallback.
      socket.on(
        'join_company',
        async (request: CompanyRoomRequest, acknowledge?: SocketAcknowledgement) => {
          const { companyId, token } = this.parseCompanyRoomRequest(request);
          if (!companyId) {
            acknowledge?.({ ok: false, error: 'companyId is required' });
            return;
          }

          try {
            const userId = this.resolveSocketUserId(socket, token);
            if (!userId || !(await userHasAccessToCompany(userId, companyId))) {
              acknowledge?.({ ok: false, error: 'Unauthorized company room' });
              return;
            }

            await socket.join(this.companyRoom(companyId));
            acknowledge?.({ ok: true, companyId });
            console.log(`[SocketService] User ${userId} joined company room ${companyId}`);
          } catch (error) {
            console.error('[SocketService] Failed to join company room:', error);
            acknowledge?.({ ok: false, error: 'Company room is temporarily unavailable' });
          }
        }
      );

      socket.on(
        'leave_company',
        async (request: CompanyRoomRequest, acknowledge?: SocketAcknowledgement) => {
          const { companyId } = this.parseCompanyRoomRequest(request);
          if (!companyId) {
            acknowledge?.({ ok: false, error: 'companyId is required' });
            return;
          }

          await socket.leave(this.companyRoom(companyId));
          acknowledge?.({ ok: true, companyId });
        }
      );

      socket.on('disconnect', () => {
        console.log(`[SocketService] Disconnected: ${socket.id}`);
      });
    });

    // Dedicated namespace: an external account never joins a User room or a
    // company-wide employee room. The server derives its selected-access room.
    const external = this.io.of('/subcontractor');
    external.use(async (socket, next) => {
      try {
        const { verifyExternalSession } = await import('../utils/subcontractorIdentity');
        const { collaboration, externalRoom } = await import('./SubcontractorCollaborationService');
        const session = verifyExternalSession(socket.handshake.auth?.token || '');
        const scope = await collaboration.scope(session);
        socket.data.externalSession = session;
        socket.data.accessId = scope.accessId;
        socket.join(externalRoom(scope));
        next();
      } catch { next(new Error('ACCESS_DENIED')); }
    });
    external.on('connection', socket => {
      const timer = setInterval(async () => {
        try {
          const { collaboration } = await import('./SubcontractorCollaborationService');
          await collaboration.scope(socket.data.externalSession);
          const exp = (socket.data.externalSession as any).exp;
          if (!exp || exp * 1000 <= Date.now()) socket.disconnect(true);
        } catch { socket.disconnect(true); }
      }, 20000);
      timer.unref();
      socket.on('disconnect', () => clearInterval(timer));
    });

    return this.io;
  }

  static emitToUser(userId: string, event: string, data: any) {
    if (this.io) {
      this.io.to(userId).emit(event, data);
      console.log(`[SocketService] Emitting ${event} to user ${userId}`);
    }
  }

  static emitToExternalRoom(room: string, event: string, data: any) {
    this.io?.of('/subcontractor').to(room).emit(event, data);
  }
  static emitToVerifiedUser(userId: string, event: string, data: any) {
    this.io?.to(`verified-user:${userId}`).emit(event, data);
  }

  static disconnectExternalAccess(accessId: string) {
    this.io?.of('/subcontractor').sockets.forEach(socket => {
      if (socket.data.accessId === accessId) socket.disconnect(true);
    });
  }

  static emitToAll(event: string, data: any) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  static emitToCompany(companyId: string, event: string, data: any) {
    if (this.io && companyId) {
      this.io.to(this.companyRoom(companyId)).emit(event, data);
    }
  }
}
