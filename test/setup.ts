/**
 * Jest setup file for E2E tests.
 * Forces tests to use the test database on port 5433.
 */
process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5433/booking_api_test?schema=public';
