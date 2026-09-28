import { Controller, Get } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
} from '@nestjs/swagger';
import { SlotsService } from './slots.service';

class SlotDto {
  /** @example "11111111-1111-4111-8111-111111111111" */
  id: string;
  /** @example "2030-01-15T09:00:00.000Z" */
  startsAt: string;
  /** @example "2030-01-15T09:30:00.000Z" */
  endsAt: string;
}

class SlotsResponseDto {
  slots: SlotDto[];
}

@ApiTags('Slots')
@Controller()
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) {}

  @Get('slots')
  @ApiOperation({
    summary: 'List available slots',
    description:
      'Returns all slots that do not have an active booking, ordered ascending by `startsAt` then `id`. ' +
      'No query parameters or request body required. Returns `{"slots":[]}` when no slots are available.',
  })
  @ApiOkResponse({
    description: 'List of available slots.',
    schema: {
      type: 'object',
      required: ['slots'],
      properties: {
        slots: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'startsAt', 'endsAt'],
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
                example: '11111111-1111-4111-8111-111111111111',
              },
              startsAt: {
                type: 'string',
                format: 'date-time',
                description: 'ISO 8601 UTC',
                example: '2030-01-15T09:00:00.000Z',
              },
              endsAt: {
                type: 'string',
                format: 'date-time',
                description: 'ISO 8601 UTC',
                example: '2030-01-15T09:30:00.000Z',
              },
            },
          },
        },
      },
      example: {
        slots: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            startsAt: '2030-01-15T09:00:00.000Z',
            endsAt: '2030-01-15T09:30:00.000Z',
          },
        ],
      },
    },
  })
  async getSlots() {
    const slots = await this.slotsService.findAvailable();
    return { slots };
  }
}
