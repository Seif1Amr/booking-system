import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { IoAdapter } from '@nestjs/platform-socket.io';

// ── Seed slots (same as prisma/seed.ts) ────────────────────────────
const SEED_SLOTS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    startsAt: new Date('2030-01-15T09:00:00.000Z'),
    endsAt: new Date('2030-01-15T09:30:00.000Z'),
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    startsAt: new Date('2030-01-15T10:00:00.000Z'),
    endsAt: new Date('2030-01-15T10:30:00.000Z'),
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    startsAt: new Date('2030-01-15T11:00:00.000Z'),
    endsAt: new Date('2030-01-15T11:30:00.000Z'),
  },
];

const VALID_UUID = '00000000-0000-4000-8000-000000000000';

describe('Booking API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Reset DB to a clean seeded state before each test. */
  beforeEach(async () => {
    await prisma.booking.deleteMany();
    await prisma.slot.deleteMany();
    for (const slot of SEED_SLOTS) {
      await prisma.slot.create({ data: slot });
    }
  });

  // ────────────────────────────────────────────────────────────────
  // GET /slots
  // ────────────────────────────────────────────────────────────────
  describe('GET /slots', () => {
    it('returns all seeded slots when none are booked', async () => {
      const res = await request(app.getHttpServer()).get('/slots').expect(200);
      expect(res.body.slots).toHaveLength(SEED_SLOTS.length);
      // Ordered by startsAt ascending
      expect(res.body.slots[0].id).toBe(SEED_SLOTS[0].id);
    });

    it('excludes a slot after it is booked', async () => {
      // Book the first slot
      await request(app.getHttpServer())
        .post('/bookings')
        .send({
          slotId: SEED_SLOTS[0].id,
          customerName: 'Test User',
          customerEmail: 'test@example.com',
        })
        .expect(201);

      const res = await request(app.getHttpServer()).get('/slots').expect(200);
      const ids = res.body.slots.map((s: any) => s.id);
      expect(ids).not.toContain(SEED_SLOTS[0].id);
      expect(res.body.slots).toHaveLength(SEED_SLOTS.length - 1);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // POST /bookings
  // ────────────────────────────────────────────────────────────────
  describe('POST /bookings', () => {
    it('returns 201 and the booking on success', async () => {
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .send({
          slotId: SEED_SLOTS[0].id,
          customerName: '  Alex Morgan  ',
          customerEmail: '  alex@example.com  ',
        })
        .expect(201);

      expect(res.body.booking).toMatchObject({
        slotId: SEED_SLOTS[0].id,
        customerName: 'Alex Morgan',        // trimmed
        customerEmail: 'alex@example.com',   // trimmed
        status: 'active',
      });
      expect(res.body.booking.id).toBeDefined();
    });

    it('returns 400 for missing fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .send({})
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid email', async () => {
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .send({
          slotId: SEED_SLOTS[0].id,
          customerName: 'Alex',
          customerEmail: 'not-an-email',
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for non-existent slot', async () => {
      const res = await request(app.getHttpServer())
        .post('/bookings')
        .send({
          slotId: VALID_UUID,
          customerName: 'Alex',
          customerEmail: 'alex@example.com',
        })
        .expect(404);

      expect(res.body.error.code).toBe('SLOT_NOT_FOUND');
    });

    it('returns 409 when slot already has an active booking', async () => {
      await request(app.getHttpServer())
        .post('/bookings')
        .send({
          slotId: SEED_SLOTS[0].id,
          customerName: 'First',
          customerEmail: 'first@example.com',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/bookings')
        .send({
          slotId: SEED_SLOTS[0].id,
          customerName: 'Second',
          customerEmail: 'second@example.com',
        })
        .expect(409);

      expect(res.body.error.code).toBe('SLOT_UNAVAILABLE');
    });

    // ──── MANDATORY: True concurrent requests ────────────────────
    it('handles two truly concurrent requests: exactly one 201 and one 409', async () => {
      const payload1 = {
        slotId: SEED_SLOTS[1].id,
        customerName: 'Alice',
        customerEmail: 'alice@example.com',
      };
      const payload2 = {
        slotId: SEED_SLOTS[1].id,
        customerName: 'Bob',
        customerEmail: 'bob@example.com',
      };

      // Fire both requests at the same instant
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer()).post('/bookings').send(payload1),
        request(app.getHttpServer()).post('/bookings').send(payload2),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);

      // Verify exactly one active booking exists in the database
      const activeBookings = await prisma.booking.findMany({
        where: { slotId: SEED_SLOTS[1].id, status: 'active' },
      });
      expect(activeBookings).toHaveLength(1);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // DELETE /bookings/:bookingId
  // ────────────────────────────────────────────────────────────────
  describe('DELETE /bookings/:bookingId', () => {
    it('cancels an active booking and re-enables the slot', async () => {
      // Create a booking
      const createRes = await request(app.getHttpServer())
        .post('/bookings')
        .send({
          slotId: SEED_SLOTS[0].id,
          customerName: 'Alex',
          customerEmail: 'alex@example.com',
        })
        .expect(201);

      const bookingId = createRes.body.booking.id;

      // Slot should NOT be available
      let slotsRes = await request(app.getHttpServer()).get('/slots').expect(200);
      expect(slotsRes.body.slots.map((s: any) => s.id)).not.toContain(SEED_SLOTS[0].id);

      // Cancel
      const cancelRes = await request(app.getHttpServer())
        .delete(`/bookings/${bookingId}`)
        .expect(200);

      expect(cancelRes.body.booking.status).toBe('cancelled');
      expect(cancelRes.body.booking.id).toBe(bookingId);

      // Slot should be available again
      slotsRes = await request(app.getHttpServer()).get('/slots').expect(200);
      expect(slotsRes.body.slots.map((s: any) => s.id)).toContain(SEED_SLOTS[0].id);
    });

    it('allows re-booking after cancellation', async () => {
      // Book → Cancel → Re-book
      const createRes = await request(app.getHttpServer())
        .post('/bookings')
        .send({
          slotId: SEED_SLOTS[0].id,
          customerName: 'Alex',
          customerEmail: 'alex@example.com',
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/bookings/${createRes.body.booking.id}`)
        .expect(200);

      const rebookRes = await request(app.getHttpServer())
        .post('/bookings')
        .send({
          slotId: SEED_SLOTS[0].id,
          customerName: 'Bob',
          customerEmail: 'bob@example.com',
        })
        .expect(201);

      expect(rebookRes.body.booking.status).toBe('active');
      expect(rebookRes.body.booking.slotId).toBe(SEED_SLOTS[0].id);
    });

    it('is idempotent: cancelling an already-cancelled booking returns 200', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/bookings')
        .send({
          slotId: SEED_SLOTS[0].id,
          customerName: 'Alex',
          customerEmail: 'alex@example.com',
        })
        .expect(201);

      const bookingId = createRes.body.booking.id;

      // First cancel
      await request(app.getHttpServer()).delete(`/bookings/${bookingId}`).expect(200);

      // Second cancel (idempotent)
      const res = await request(app.getHttpServer())
        .delete(`/bookings/${bookingId}`)
        .expect(200);

      expect(res.body.booking.status).toBe('cancelled');
      expect(res.body.booking.id).toBe(bookingId);
    });

    it('cancelling an old booking does not affect a newer active booking on the same slot', async () => {
      // Book → Cancel → Re-book → Cancel OLD booking again
      const first = await request(app.getHttpServer())
        .post('/bookings')
        .send({
          slotId: SEED_SLOTS[0].id,
          customerName: 'First',
          customerEmail: 'first@example.com',
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/bookings/${first.body.booking.id}`)
        .expect(200);

      const second = await request(app.getHttpServer())
        .post('/bookings')
        .send({
          slotId: SEED_SLOTS[0].id,
          customerName: 'Second',
          customerEmail: 'second@example.com',
        })
        .expect(201);

      // Cancel the OLD (already cancelled) booking again
      await request(app.getHttpServer())
        .delete(`/bookings/${first.body.booking.id}`)
        .expect(200);

      // The newer active booking should still be active
      const activeBookings = await prisma.booking.findMany({
        where: { slotId: SEED_SLOTS[0].id, status: 'active' },
      });
      expect(activeBookings).toHaveLength(1);
      expect(activeBookings[0].id).toBe(second.body.booking.id);

      // Slot should NOT be available (newer booking still active)
      const slotsRes = await request(app.getHttpServer()).get('/slots').expect(200);
      expect(slotsRes.body.slots.map((s: any) => s.id)).not.toContain(SEED_SLOTS[0].id);
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await request(app.getHttpServer())
        .delete('/bookings/not-a-uuid')
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for non-existent booking', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/bookings/${VALID_UUID}`)
        .expect(404);

      expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
    });
  });
});
