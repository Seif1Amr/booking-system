import { IsEmail, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBookingDto {
  @ApiProperty({
    description: 'UUID of the slot to book.',
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
  })
  @IsUUID('all', { message: 'slotId must be a valid UUID.' })
  slotId: string;

  @ApiProperty({
    description: 'Customer full name (trimmed; must not be empty).',
    example: 'Alex Morgan',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'customerName must be a string.' })
  @IsNotEmpty({ message: 'customerName must not be empty.' })
  customerName: string;

  @ApiProperty({
    description: 'Customer email address (trimmed; must be a valid email).',
    format: 'email',
    example: 'alex@example.com',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: 'customerEmail must be a valid email address.' })
  customerEmail: string;
}
