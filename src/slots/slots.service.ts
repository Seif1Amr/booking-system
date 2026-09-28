import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Return all slots that have no active booking,
   * ordered by startsAt ASC, then id ASC.
   */
  async findAvailable() {
    const slots = await this.prisma.slot.findMany({
      where: {
        bookings: {
          none: {
            status: 'active',
          },
        },
      },
      orderBy: [
        { startsAt: 'asc' },
        { id: 'asc' },
      ],
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
      },
    });

    return slots;
  }
}
