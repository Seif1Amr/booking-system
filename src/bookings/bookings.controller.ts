import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseFilters,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';

// ── Shared OpenAPI error schema ──────────────────────────────────────
const errorSchema = (code: string, message: string) => ({
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string', example: code },
        message: { type: 'string', example: message },
      },
    },
  },
});

// ── Booking response schema ──────────────────────────────────────────
const bookingResponseSchema = {
  type: 'object' as const,
  required: ['booking'],
  properties: {
    booking: {
      type: 'object' as const,
      required: ['id', 'slotId', 'customerName', 'customerEmail', 'status'],
      properties: {
        id: { type: 'string' as const, format: 'uuid', example: '22222222-2222-4222-8222-222222222222' },
        slotId: { type: 'string' as const, format: 'uuid', example: '11111111-1111-4111-8111-111111111111' },
        customerName: { type: 'string' as const, example: 'Alex Morgan' },
        customerEmail: { type: 'string' as const, format: 'email', example: 'alex@example.com' },
        status: { type: 'string' as const, enum: ['active', 'cancelled'], example: 'active' },
      },
    },
  },
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@ApiTags('Bookings')
@Controller('bookings')
@UseFilters(AllExceptionsFilter)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // ─── POST /bookings ──────────────────────────────────────────────
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a booking',
    description:
      'Books the specified slot for the customer. Each slot accepts at most one active booking. ' +
      'Leading/trailing whitespace is stripped from `customerName` and `customerEmail` before validation. ' +
      'All three fields are mandatory. Concurrent requests for the same slot are handled safely: ' +
      'exactly one succeeds with 201 and the other receives 409.',
  })
  @ApiBody({ type: CreateBookingDto })
  @ApiCreatedResponse({
    description: 'Booking created successfully.',
    schema: {
      ...bookingResponseSchema,
      example: {
        booking: {
          id: '22222222-2222-4222-8222-222222222222',
          slotId: '11111111-1111-4111-8111-111111111111',
          customerName: 'Alex Morgan',
          customerEmail: 'alex@example.com',
          status: 'active',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Validation error: missing or invalid fields, malformed JSON, or non-UUID slotId.',
    schema: errorSchema('VALIDATION_ERROR', 'slotId must be a valid UUID.'),
  })
  @ApiNotFoundResponse({
    description: 'The slot UUID is valid but does not exist.',
    schema: errorSchema('SLOT_NOT_FOUND', 'The specified slot does not exist.'),
  })
  @ApiConflictResponse({
    description: 'The slot already has an active booking.',
    schema: errorSchema('SLOT_UNAVAILABLE', 'This slot already has an active booking.'),
  })
  @ApiInternalServerErrorResponse({
    description: 'An unexpected server error occurred.',
    schema: errorSchema('INTERNAL_ERROR', 'An unexpected error occurred.'),
  })
  async createBooking(@Body() dto: CreateBookingDto) {
    const booking = await this.bookingsService.create(dto);
    return { booking };
  }

  // ─── DELETE /bookings/:bookingId ──────────────────────────────────
  @Delete(':bookingId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a booking',
    description:
      'Cancels an active booking, changing its status to `cancelled` and making the slot available again. ' +
      'Cancelling an already-cancelled booking is idempotent: returns 200 with the unchanged booking ' +
      'and does **not** emit a Socket.IO event or affect any newer active booking on the same slot.',
  })
  @ApiParam({
    name: 'bookingId',
    description: 'UUID of the booking to cancel.',
    format: 'uuid',
    example: '22222222-2222-4222-8222-222222222222',
  })
  @ApiOkResponse({
    description:
      'Booking cancelled (or was already cancelled). The returned booking has `status: "cancelled"`.',
    schema: {
      ...bookingResponseSchema,
      example: {
        booking: {
          id: '22222222-2222-4222-8222-222222222222',
          slotId: '11111111-1111-4111-8111-111111111111',
          customerName: 'Alex Morgan',
          customerEmail: 'alex@example.com',
          status: 'cancelled',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'The bookingId path parameter is not a valid UUID.',
    schema: errorSchema('VALIDATION_ERROR', 'bookingId must be a valid UUID.'),
  })
  @ApiNotFoundResponse({
    description: 'No booking exists with the given UUID.',
    schema: errorSchema('BOOKING_NOT_FOUND', 'The specified booking does not exist.'),
  })
  @ApiInternalServerErrorResponse({
    description: 'An unexpected server error occurred.',
    schema: errorSchema('INTERNAL_ERROR', 'An unexpected error occurred.'),
  })
  async cancelBooking(@Param('bookingId') bookingId: string) {
    // Validate UUID format in the path param
    if (!UUID_REGEX.test(bookingId)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'bookingId must be a valid UUID.',
      });
    }

    const booking = await this.bookingsService.cancel(bookingId);
    return { booking };
  }
}
