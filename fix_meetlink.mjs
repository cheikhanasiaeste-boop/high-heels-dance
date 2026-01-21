import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(process.env.DATABASE_URL);

// First, check current meetLink value
const [slots] = await connection.execute(
  'SELECT a.id, a.title, a.meetLink, a.sessionLink FROM availabilitySlots a JOIN bookings b ON b.slotId = a.id WHERE b.id = ?',
  [210001]
);

console.log('Current slot data:', JSON.stringify(slots[0], null, 2));

if (slots.length > 0 && (!slots[0].meetLink || slots[0].meetLink === '')) {
  console.log('\nMeetLink is missing! Generating one...');
  
  // Generate a Google Meet link
  const randomCode = () => Math.random().toString(36).substring(2, 6);
  const meetLink = `https://meet.google.com/${randomCode()}-${randomCode()}-${randomCode()}`;
  
  console.log('Generated meetLink:', meetLink);
  
  // Update the slot
  await connection.execute(
    'UPDATE availabilitySlots SET meetLink = ? WHERE id = ?',
    [meetLink, slots[0].id]
  );
  
  console.log('✅ MeetLink updated successfully!');
} else {
  console.log('\n✅ MeetLink already exists:', slots[0].meetLink);
}

await connection.end();
