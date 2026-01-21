import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);

// Check booking 210001
const [bookings] = await connection.execute(
  'SELECT * FROM bookings WHERE id = ?',
  [210001]
);

console.log('Booking 210001:', JSON.stringify(bookings, null, 2));

// Get the slot information
if (bookings.length > 0) {
  const [slots] = await connection.execute(
    'SELECT * FROM slots WHERE id = ?',
    [bookings[0].slotId]
  );
  console.log('\nSlot information:', JSON.stringify(slots, null, 2));
}

await connection.end();
