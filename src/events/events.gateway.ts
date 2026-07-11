import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  }
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  @WebSocketServer()
  server!: Server;

  handleConnection(client: any) {
   try {
      console.log(555, client);
      console.log(`Client connected: ${client.id}`);
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, { secret: this.configService.get('JWT_ACCESS_SECRET') });
      client.join(`user-${payload.sub}`);
    } catch (error) {
      console.error('Error occurred while handling connection:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: any) {
    console.log(`Client disconnected: ${client.id}`);
  }
}