import puppeteer from 'puppeteer';
import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

const GAME_URL = 'https://neocharmy.github.io/runnersadventure/web/run.html?app=Sonic%20Runners%20Adventure&fractionScale=1';
const LOAD_DELAY = 90000;   // 90 seconds – increase if the game needs more time

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();
const responses = [];

// Save ALL responses from any domain
page.on('response', async (response) => {
  const url = response.url();
  const status = response.status();
  if (status < 200 || status >= 400) return;

  // Optional: skip fonts/icons if you don't need them
  // const blockedExtensions = /\.(?:ico|woff2?|ttf|eot|svg)(\?.*)?$/i;
  // if (blockedExtensions.test(url)) return;

  try {
    const buffer = await response.buffer();
    responses.push({ url, buffer });
  } catch (err) {
    console.warn(`Skipping ${url}: ${err.message}`);
  }
});

await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 120000 });

// Wait extra time for the game to fully initialise
await new Promise(r => setTimeout(r, LOAD_DELAY));
await page.waitForNetworkIdle({ idleTime: 5000, timeout: 120000 }).catch(() => {});

await browser.close();

let savedCount = 0;
for (const { url, buffer } of responses) {
  const urlObj = new URL(url);
  // Convert full URL to a file path: hostname + pathname
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
