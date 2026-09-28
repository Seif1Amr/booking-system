import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { Prisma } from '@prisma/client';
import { CreateBookingDto } from './dto/create-booking.dto';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  /**
   * Create a booking for a slot.
   *
   * Concurrency safety: a partial unique index on bookings(slot_id)
   * WHERE status='active' ensures only one active booking per slot
   * at the database level. A duplicate INSERT raises P2002 which we
   * translate to 409 SLOT_UNAVAILABLE.
   */
  async create(dto: CreateBookingDto) {
    // 1. Verify the slot exists
    const slot = await this.prisma.slot.findUnique({
      where: { id: dto.slotId },
    });

    if (!slot) {
      throw new NotFoundException({
        code: 'SLOT_NOT_FOUND',
        message: 'The specified slot does not exist.',
      });
    }

    // 2. Attempt to insert the booking
    try {
      const booking = await this.prisma.booking.create({
        data: {
          slotId: dto.slotId,
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          status: 'active',
        },
        select: {
          id: true,
          slotId: true,
          customerName: true,
          customerEmail: true,
          status: true,
        },
      });

      // 3. Emit real-time event after successful commit
      this.events.emitSlotBooked(booking.slotId, booking.id);

      return booking;
    } catch (error) {
      // Unique constraint violation from partial index → slot already booked
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'SLOT_UNAVAILABLE',
          message: 'This slot already has an active booking.',
        });
      }
      throw error; // unexpected error → will be caught by AllExceptionsFilter
    }
  }

  /**
   * Cancel a booking by ID.
   *
   * - Active → cancelled: update + emit event + return 200.
   * - Already cancelled: return 200 with unchanged booking (idempotent, no event).
   * - Not found: 404.
   */
  async cancel(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        slotId: true,
        customerName: true,
        customerEmail: true,
        status: true,
      },
    });

    if (!booking) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: 'The specified booking does not exist.',
      });
    }

    // Already cancelled → idempotent return, no event
    if (booking.status === 'cancelled') {
      return booking;
    }

    // Transition active → cancelled
    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'cancelled' },
      select: {
        id: true,
        slotId: true,
        customerName: true,
        customerEmail: true,
        status: true,
      },
    });

    // Emit event after successful DB update
    this.events.emitSlotReleased(updated.slotId, updated.id);

    return updated;
  }
}
