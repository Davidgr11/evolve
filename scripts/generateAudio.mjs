import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { THEME_GROUPS } from '../src/constants/phrases.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = join(__dirname, '../public/audio');
const KEY = process.env.OPENAI_API_KEY;

if (!KEY) {
  console.error('ERROR: Set OPENAI_API_KEY env var');
  process.exit(1);
}

mkdirSync(AUDIO_DIR, { recursive: true });

const allPhrases = [];
for (const group of THEME_GROUPS) {
  for (const theme of group.themes) {
    for (let i = 0; i < theme.phrases.length; i++) {
      allPhrases.push({ themeId: theme.id, index: i, text: theme.phrases[i] });
    }
  }
}

console.log(`Generating ${allPhrases.length} audio files into public/audio/\n`);

let generated = 0, skipped = 0, failed = 0;

for (const { themeId, index, text } of allPhrases) {
  const filename = `${themeId}_${index}.mp3`;
  const filepath = join(AUDIO_DIR, filename);

  if (existsSync(filepath)) {
    process.stdout.write(`⏭  ${filename}\n`);
    skipped++;
    continue;
  }

  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1', input: text, voice: 'shimmer', response_format: 'mp3' }),
    });

    if (!res.ok) throw new Error(await res.text());

    writeFileSync(filepath, Buffer.from(await res.arrayBuffer()));
    generated++;
    process.stdout.write(`✅ ${filename}\n`);

    await new Promise(r => setTimeout(r, 150)); // avoid rate limiting
  } catch (err) {
    failed++;
    process.stdout.write(`❌ ${filename}: ${err.message}\n`);
  }
}

const totalChars = allPhrases.reduce((s, p) => s + p.text.length, 0);
const cost = (totalChars / 1_000_000 * 15).toFixed(4);

console.log(`\n✅ Done: ${generated} generated · ${skipped} skipped · ${failed} failed`);
console.log(`💰 Total chars: ${totalChars.toLocaleString()} · Est. cost: $${cost} USD (one-time)`);
