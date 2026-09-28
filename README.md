# Appointment Booking System

High-concurrency appointment booking REST API built with **NestJS**, **Prisma ORM**, **PostgreSQL**, and **Socket.IO** for real-time updates.

---

## 🎥 Video Walkthroughs

- 🇬🇧 **English Demo:** [Watch Video (Google Drive)](https://drive.google.com/file/d/1TyBNn9mI6fCscURi55YRQHUxvyP--rDx/view?usp=drive_link)
- 🇸🇦 **Arabic Demo:** [Watch Video (Google Drive)](https://drive.google.com/file/d/1HEja4NmRP9n6coWpqC7C7V1DY3XkWiM7/view?usp=drive_link)

---

## Prerequisites

| Tool | Version |
| -------------- | --------- |
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| Docker Desktop | Latest |

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/Seif1Amr/booking-system.git
cd booking-system
npm install
```

### 2. Environment Variables

Copy the example and adjust if needed:

```bash
cp .env.example .env
```

| Variable | Description | Default |
| -------------- | -------------------------------- | ------------------------------------------------------------ |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/booking_api` |
| `PORT` | HTTP server port | `3000` |

### 3. Start PostgreSQL (Docker)

```bash
docker compose up -d
```

This starts two PostgreSQL containers:

- **booking-api-db** → port `5432` (development)
- **booking-api-test-db** → port `5433` (testing)

### 4. Run Migrations & Seed

```bash
npx prisma migrate deploy
npx prisma db seed
```

### 5. Start the Server

```bash
npm run start:dev
```

The server runs at **http://localhost:3000**.

---

## API Endpoints

| Method | Path | Description |
| -------- | ----------------------- | ----------------------------- |
| `GET` | `/slots` | List available slots |
| `POST` | `/bookings` | Create a booking |
| `DELETE` | `/bookings/{bookingId}` | Cancel a booking |
| `GET` | `/docs` | Swagger UI documentation |
| `GET` | `/openapi.json` | OpenAPI 3.0 JSON spec |

### GET /slots

Returns only slots without an active booking, ordered by `startsAt` then `id`.

```bash
curl http://localhost:3000/slots
```

**200 Response:**

```json
{
  "slots": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "startsAt": "2030-01-15T09:00:00.000Z",
      "endsAt": "2030-01-15T09:30:00.000Z"
    }
  ]
}
```

### POST /bookings

All fields are mandatory. `customerName` and `customerEmail` are trimmed before validation.

```bash
curl -X POST http://localhost:3000/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "slotId": "11111111-1111-4111-8111-111111111111",
    "customerName": "Alex Morgan",
    "customerEmail": "alex@example.com"
  }'
```

**201 Response:**

```json
{
  "booking": {
    "id": "uuid",
    "slotId": "11111111-1111-4111-8111-111111111111",
    "customerName": "Alex Morgan",
    "customerEmail": "alex@example.com",
    "status": "active"
  }
}
```

**Error Codes:** `400 VALIDATION_ERROR`, `404 SLOT_NOT_FOUND`, `409 SLOT_UNAVAILABLE`, `500 INTERNAL_ERROR`

### DELETE /bookings/{bookingId}

Cancels an active booking. Idempotent: cancelling an already-cancelled booking returns 200 without side effects.

```bash
curl -X DELETE http://localhost:3000/bookings/<bookingId>
```

**200 Response:**

```json
{
  "booking": {
    "id": "uuid",
    "slotId": "11111111-1111-4111-8111-111111111111",
    "customerName": "Alex Morgan",
    "customerEmail": "alex@example.com",
    "status": "cancelled"
  }
}
```

**Error Codes:** `400 VALIDATION_ERROR`, `404 BOOKING_NOT_FOUND`, `500 INTERNAL_ERROR`

### Error Format

All errors follow a consistent shape:

```json
{
  "error": {
    "code": "SLOT_UNAVAILABLE",
    "message": "This slot already has an active booking."
  }
}
```

---

## Socket.IO — Real-Time Events

The Socket.IO server runs on the **same HTTP server** using the default namespace `/` and path `/socket.io`. No authentication, rooms, or client-sent application events are used.

### Events

#### `slot.booked`

Emitted once after a booking is successfully created.

```json
{
  "slotId": "11111111-1111-4111-8111-111111111111",
  "bookingId": "22222222-2222-4222-8222-222222222222",
  "available": false
}
```

#### `slot.released`

Emitted once after an active booking is successfully cancelled (not on repeat cancellations).

```json
{
  "slotId": "11111111-1111-4111-8111-111111111111",
  "bookingId": "22222222-2222-4222-8222-222222222222",
  "available": true
}
```

### Testing Socket.IO Without a Frontend

Start the server, then in another terminal:

```bash
npm run socket:test
# or
npx ts-node scripts/socket-test-client.ts
```

The script connects and prints events as they arrive. In a third terminal, fire API requests:

```bash
# Book a slot → triggers slot.booked
curl -X POST http://localhost:3000/bookings \
  -H "Content-Type: application/json" \
  -d '{"slotId":"11111111-1111-4111-8111-111111111111","customerName":"Test","customerEmail":"t@t.com"}'

# Cancel it → triggers slot.released
curl -X DELETE http://localhost:3000/bookings/<id-from-above>
```

---

## Testing

### Test Database Setup

The E2E tests use a **separate PostgreSQL instance** (port 5433) started by Docker Compose as `booking-api-test-db`. Tests are fully repeatable: each test cleans and re-seeds the database.

### Run Migrations on the Test Database

```bash
# Apply migrations to the test database
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5433/booking_api_test?schema=public"
npx prisma migrate deploy
```

Or on Linux/macOS:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/booking_api_test?schema=public" npx prisma migrate deploy
```

### Run Tests

```bash
npm run test:e2e
```

The test suite covers:

1. **Successful booking** (201) and slot disappearing from available list
2. **True concurrent requests** for the same slot → exactly one 201, one 409, one active booking in DB
3. **Cancellation** (200) → slot re-appears, re-booking succeeds
4. **Idempotent cancellation** of already-cancelled bookings
5. **Old cancelled booking** doesn't affect newer active booking
6. **Validation errors** (400), not-found (404)

---

## Concurrency Control — Design Decision

### Approach: Partial Unique Index

```sql
CREATE UNIQUE INDEX "bookings_unique_active_slot"
  ON "bookings" ("slot_id")
  WHERE "status" = 'active';
```

This PostgreSQL partial unique index guarantees that **at most one row** with `status = 'active'` can exist per `slot_id`. When two concurrent `INSERT` statements try to create active bookings for the same slot:

1. Both pass the application-level slot-existence check
2. Both attempt the `INSERT`
3. PostgreSQL serializes them at the index level
4. The **first** commit succeeds
5. The **second** hits a unique constraint violation (`P2002`)
6. The application catches `P2002` and returns `409 SLOT_UNAVAILABLE`

### Why This Approach?

| Alternative | Trade-off |
| -------------------------------- | ------------------------------------------------------------------- |
| `SELECT ... FOR UPDATE` | Requires explicit transactions, more complex code, pessimistic lock |
| Application-level mutex/lock | Doesn't scale across multiple server instances |
| Optimistic locking (version col) | Requires retry logic, more complex |
| **Partial unique index** ✅ | Zero application-level locking, DB enforces invariant, simple code |

The partial index is the most elegant solution because:

- **Correctness is guaranteed by the database**, not the application
- **No locking overhead** for reads or cancellations
- **Works across multiple server instances** without coordination
- **Cancelled bookings don't conflict** — the index only covers `active` rows
- **Simple code** — just catch the constraint violation error

---

## Key Design Decisions

### Data Model

- **Two tables**: `slots` and `bookings` with a one-to-many relationship
- Slots are immutable seed data; bookings track the lifecycle
- `BookingStatus` enum (`active` / `cancelled`) — cancelled bookings are soft-deleted, preserving history
- Column names use `snake_case` in PostgreSQL, mapped to `camelCase` in TypeScript via Prisma `@map()`
- UUIDs generated by PostgreSQL (`gen_random_uuid()`) for distributed-safe IDs

### Code Organization

- **Modular NestJS structure**: `PrismaModule` (global), `SlotsModule`, `BookingsModule`, `EventsModule` (global)
- **Global exception filter** normalizes all errors to `{ error: { code, message } }`
- **DTO validation** with `class-validator` + `class-transformer` for input trimming
- **EventsGateway** injected into `BookingsService` for tight event-after-commit coupling

### API Design

- Response wrappers (`{ slots: [...] }`, `{ booking: {...} }`) make the API extensible
- Idempotent DELETE follows REST best practices
- No authentication simplifies the API per requirements

---

## Possible Improvements

- **Authentication & Authorization** — JWT/OAuth2 for user-scoped bookings
- **Pagination** — cursor-based pagination for `GET /slots` at scale
- **Rate Limiting** — `@nestjs/throttler` to prevent abuse
- **Transactional Outbox** — guarantee Socket.IO events are sent even after crashes
- **Audit Log** — track who booked/cancelled and when
- **Health Check** — `/health` endpoint for monitoring
- **Graceful Shutdown** — drain connections on SIGTERM
- **CI/CD** — GitHub Actions for lint, test, build pipeline
- **Helmet & CORS** — security headers for production

---

## Time Spent & Incomplete Areas

- The project covers all required functionality: CRUD, concurrency control, Socket.IO events, OpenAPI docs, and E2E tests
- Socket.IO delivery is best-effort (no persistent queue or exactly-once guarantees, as specified)
- No frontend, authentication, payment, or cloud deployment (not required)

---

## AI Disclosure

This project was developed with the assistance of **Google Antigravity (Gemini AI)**. The AI was used to:

- Generate the initial project structure and boilerplate
- Write the NestJS modules, services, controllers, and DTOs
- Create the Prisma schema and migrations
- Write E2E tests and the Socket.IO test client
- Draft this README

**Review process:**

- All generated code was reviewed for correctness and consistency
- The concurrency control mechanism (partial unique index) was verified against PostgreSQL documentation
- E2E tests were run against a real PostgreSQL database to validate behavior
- The OpenAPI documentation was verified against the Swagger UI

I fully understand the code and can explain and modify any part of it.
