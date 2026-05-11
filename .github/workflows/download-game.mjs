import puppeteer from 'puppeteer';
import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

const GAME_URL = 'https://neocharmy.github.io/runnersadventure/web/run.html?app=Sonic%20Runners%20Adventure&fractionScale=1';
const LOAD_DELAY = 90000;   // 90 seconds – adjust if your game needs more time

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();
const responses = [];

// Intercept ALL responses from ANY domain
page.on('response', async (response) => {
  const url = response.url();
  const status = response.status();
  if (status < 200 || status >= 400) return;  // skip errors

  // Optional: skip clearly unwanted stuff like analytics – remove if you want everything
  const blockedExtensions = /\.(?:ico|woff2?|ttf|eot|svg)(\?.*)?$/i;
  if (blockedExtensions.test(url)) return;

  try {
    const buffer = await response.buffer();
    responses.push({ url, buffer });
  } catch (err) {
    console.warn(`Skipping ${url}: ${err.message}`);
  }
});

await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 120000 });

// Wait extra time for the game to fully initialise and load all dependencies
await new Promise(r => setTimeout(r, LOAD_DELAY));
await page.waitForNetworkIdle({ idleTime: 5000, timeout: 120000 }).catch(() => {});

await browser.close();

// Save every response, preserving the URL path so external files sit in folders like /cdn.example.com/...
let savedCount = 0;
for (const { url, buffer } of responses) {
  const urlObj = new URL(url);
  // Use the whole host + pathname to avoid collisions
  let filePath = urlObj.host + urlObj.pathname;
  if (filePath.endsWith('/')) filePath += 'index.html';

  const localPath = `runnersadventure_offline/${filePath}`;
  const dir = dirname(localPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  await writeFile(localPath, buffer);
  savedCount++;
  console.log(`Saved: ${localPath}`);
}

console.log(`Downloaded ${savedCount} files.`);
