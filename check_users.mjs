import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { users } from './drizzle/schema.ts';

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);

const allUsers = await db.select().from(users).where(sql`email IN ('cheikhanas.iaeste@gmail.com', 'elizabethzolotova777@gmail.com')`);
console.log(JSON.stringify(allUsers, null, 2));
await connection.end();
