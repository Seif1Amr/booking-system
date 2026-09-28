import { io } from 'socket.io-client';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

console.log(`Connecting to ${SERVER_URL} ...`);

const socket = io(SERVER_URL, {
  path: '/socket.io',
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log(`✓ Connected (id: ${socket.id})`);
  console.log('Listening for events: slot.booked, slot.released');
  console.log('─'.repeat(50));
  console.log('Tip: In another terminal, create or cancel bookings:');
  console.log('  curl -X POST http://localhost:3000/bookings \\');
  console.log('    -H "Content-Type: application/json" \\');
  console.log('    -d \'{"slotId":"11111111-1111-4111-8111-111111111111","customerName":"Test","customerEmail":"t@t.com"}\'');
  console.log('─'.repeat(50));
});

socket.on('slot.booked', (data: unknown) => {
  console.log('\n📌 slot.booked:', JSON.stringify(data, null, 2));
});

socket.on('slot.released', (data: unknown) => {
  console.log('\n🔓 slot.released:', JSON.stringify(data, null, 2));
});

socket.on('disconnect', (reason: string) => {
  console.log(`✗ Disconnected: ${reason}`);
});

socket.on('connect_error', (err: Error) => {
  console.error('Connection error:', err.message);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nDisconnecting...');
  socket.disconnect();
  process.exit(0);
});
