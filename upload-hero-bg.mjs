import { storagePut } from './storage/index.js';
import fs from 'fs';

const fileBuffer = fs.readFileSync('/home/ubuntu/upload/Little-Simz-Venom-Acro-Heels-Choreograph_Media_XXMbXH8kEbo_001_1080p-ezgif.com-video-to-webp-converter(2).webp');
const result = await storagePut('hero-backgrounds/hero-bg-' + Date.now() + '.webp', fileBuffer, 'image/webp');
console.log(JSON.stringify(result));
