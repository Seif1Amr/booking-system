import {
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  path: '/socket.io',
  cors: { origin: '*' },
})
export class EventsGateway {
  @WebSocketServer()
  server: Server;

  /**
   * Emit when a slot is booked (an active booking is created).
   */
  emitSlotBooked(slotId: string, bookingId: string): void {
    this.server.emit('slot.booked', {
      slotId,
      bookingId,
      available: false,
    });
  }

  /**
   * Emit when a slot is released (an active booking is cancelled).
   */
  emitSlotReleased(slotId: string, bookingId: string): void {
    this.server.emit('slot.released', {
      slotId,
      bookingId,
      available: true,
    });
  }
}
