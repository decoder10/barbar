import { writeFileSync } from 'node:fs';
import webpush from 'web-push';
const keys = webpush.generateVAPIDKeys();
writeFileSync('.env.push', `BARBAR_PUSH_PUBLIC_KEY=${keys.publicKey}\nBARBAR_PUSH_PRIVATE_KEY=${keys.privateKey}\nBARBAR_PUSH_SUBJECT=https://barbar-cafe.netlify.app\n`, { mode: 0o600, flag: 'wx' });
console.log('Created private .env.push (ignored by Git). Keep this key pair for existing subscriptions.');
