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

    return this.io;
  }

  static emitToUser(userId: string, event: string, data: any) {
    if (this.io) {
      this.io.to(userId).emit(event, data);
      console.log(`[SocketService] Emitting ${event} to user ${userId}`);
    }
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
