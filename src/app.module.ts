import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { SlotsModule } from './slots/slots.module';
import { BookingsModule } from './bookings/bookings.module';
import { EventsModule } from './events/events.module';

@Module({
  imports: [PrismaModule, SlotsModule, BookingsModule, EventsModule],
})
export class AppModule {}
