import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';

export class SocketService {
  private static io: SocketIOServer | null = null;

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
}
