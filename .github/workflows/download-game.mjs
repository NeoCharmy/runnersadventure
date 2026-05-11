import puppeteer from 'puppeteer';
import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { createWriteStream, existsSync } from 'fs';
import { get } from 'https';
import { mkdirSync } from 'fs';

const GAME_URL = 'https://neocharmy.github.io/runnersadventure/web/run.html?app=Sonic%20Runners%20Adventure&fractionScale=1';
const BASE_DIR = 'runnersadventure';   // local folder to mirror the site structure

// How long to wait for the game to fully load (in milliseconds)
// The game might need a minute – adjust if necessary.
const LOAD_DELAY = 90000;   // 90 seconds

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();
const responses = [];

// Collect all responses (including dynamically loaded assets)
page.on('response', async (response) => {
  const url = response.url();
  const status = response.status();
  if (status < 200 || status >= 400) return;

  // Filter only resources from our domain
  if (!url.startsWith('https://neocharmy.github.io/runnersadventure/')) return;

  try {
    const buffer = await response.buffer();
    responses.push({ url, buffer });
  } catch (err) {
    console.warn(`Skipping ${url}: ${err.message}`);
  }
});

// Go to the game page and wait for it to load
await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 120000 });

// Wait extra time to ensure the game fully initialised (JAR loaded, etc.)
await new Promise(r => setTimeout(r, LOAD_DELAY));

// Additional wait for any lazy-loaded resources (optional)
await page.waitForNetworkIdle({ idleTime: 5000, timeout: 120000 }).catch(() => {});

await browser.close();

// Save all files preserving URL path under BASE_DIR
let savedCount = 0;
for (const { url, buffer } of responses) {
  const urlObj = new URL(url);
  // Remove the leading '/runnersadventure/' from pathname so that we get e.g. 'web/run.html'
  let relPath = urlObj.pathname.replace(/^\/runnersadventure\//, '');
  if (!relPath || relPath === '/') relPath = 'index.html';

  // Build local path: runnersadventure/web/run.html etc.
  const localPath = `${BASE_DIR}/${relPath}`;
  const dir = dirname(localPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  await writeFile(localPath, buffer);
  savedCount++;
  console.log(`Saved: ${localPath}`);
}

console.log(`Downloaded ${savedCount} files.`);
