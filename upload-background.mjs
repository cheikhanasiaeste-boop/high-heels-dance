import { readFileSync } from 'fs';
import { storagePut } from './server/storage.ts';
import { getDb } from './server/db.ts';
import { siteSettings } from './drizzle/schema.ts';
import { eq } from 'drizzle-orm';

const filePath = '/home/ubuntu/upload/Little-Simz-Venom-Acro-Heels-Choreograph_Media_XXMbXH8kEbo_001_1080p-ezgif.com-video-to-webp-converter(1).webp';
const fileBuffer = readFileSync(filePath);

console.log('Uploading animation to S3...');
const key = `animations/background-${Date.now()}.webp`;
const result = await storagePut(key, fileBuffer, 'image/webp');

console.log('Uploaded to:', result.url);

console.log('Saving to database...');
const db = await getDb();
if (!db) {
  console.error('Database not available');
  process.exit(1);
}

const existing = await db.select().from(siteSettings).where(eq(siteSettings.key, 'backgroundAnimationUrl')).limit(1);

if (existing.length > 0) {
  await db.update(siteSettings)
    .set({ value: result.url })
    .where(eq(siteSettings.key, 'backgroundAnimationUrl'));
  console.log('Updated existing setting');
} else {
  await db.insert(siteSettings).values({
    key: 'backgroundAnimationUrl',
    value: result.url
  });
  console.log('Created new setting');
}

console.log('Done! Background animation URL:', result.url);
process.exit(0);
