import { storagePut } from './server/storage.js';
import { getDb } from './server/db.js';
import { settings } from './drizzle/schema.js';
import { readFileSync } from 'fs';

const filePath = '/home/ubuntu/upload/Little-Simz-Venom-Acro-Heels-Choreograph_Media_XXMbXH8kEbo_001_1080p-ezgif.com-video-to-webp-converter(1).webp';
const fileBuffer = readFileSync(filePath);

console.log('Uploading WebP to S3...');
const { url } = await storagePut(
  `animations/hero-background-${Date.now()}.webp`,
  fileBuffer,
  'image/webp'
);

console.log('Uploaded to:', url);

const db = getDb();
console.log('Updating database...');

// Update or insert backgroundAnimationUrl
await db.insert(settings)
  .values({ key: 'backgroundAnimationUrl', value: url })
  .onDuplicateKeyUpdate({ set: { value: url } });

console.log('Database updated successfully!');
console.log('New background URL:', url);
process.exit(0);
