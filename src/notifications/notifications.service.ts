import { Injectable } from '@nestjs/common';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class NotificationsService {
  constructor(private readonly eventsGateway: EventsGateway) {}

  sendNotification(userId: string, notification: {
    title: string,
    message: string,
    type: string,
  }): void {
    this.eventsGateway.server.to(`user-${userId}`).emit('notification', notification);
  }
}
