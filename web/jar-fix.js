name: Capture Live Game and Runtime

on:
  workflow_dispatch:

permissions:
  contents: write

jobs:
  capture:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout repository
      uses: actions/checkout@v4

    - name: Setup Node.js & Playwright
      uses: actions/setup-node@v4
      with:
        node-version: '20'

    - name: Install Playwright
      run: |
        npm init -y
        npm install playwright
        npx playwright install chromium

    - name: Capture CheerpJ runtime and export game data
      run: |
        node -e '
        const { chromium } = require("playwright");
        const fs = require("fs");
        const path = require("path");

        (async () => {
          const browser = await chromium.launch();
          const context = await browser.newContext({ acceptDownloads: true });
          const page = await context.newPage();

          // Intercept all CheerpJ CDN responses and save them
          page.on("response", async (response) => {
            const url = response.url();
            if (!url.startsWith("https://cjrtnc.leaningtech.com/")) return;

            try {
              const parsed = new URL(url);
              let relativePath = parsed.pathname.replace(/^\//, "");
              if (!relativePath) return;

              const outputDir = "web/cheerpj-local";
              const filePath = path.join(outputDir, relativePath);
              const dir = path.dirname(filePath);
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

              const buffer = await response.body();
              fs.writeFileSync(filePath, buffer);
              console.log("Saved:", relativePath, "(" + buffer.length + " bytes)");
            } catch (e) {
              console.error("Failed to save", url, e.message);
            }
          });

          // Step 1: Open the game launcher and start the game to ensure it is installed
          await page.goto("https://neocharmy.github.io/runnersadventure/web/", { waitUntil: "networkidle" });
          console.log("Launcher loaded.");

          // Click the game link to run it (this ensures the game data is loaded)
          const gameLink = await page.$("a[href='run']");
          if (gameLink) {
            console.log("Clicking game link...");
            await gameLink.click();
            // Wait for CheerpJ to fully initialize and the game to start
            await page.waitForTimeout(20000);
          } else {
            console.error("Game link not found!");
          }

          // Step 2: Navigate back to the launcher page
          await page.goto("https://neocharmy.github.io/runnersadventure/web/", { waitUntil: "networkidle" });
          console.log("Back to launcher.");

          // Step 3: Click the "Export Data" button
          const exportBtn = await page.$("#export-data-btn");
          if (exportBtn) {
            // Set up download listener
            const [download] = await Promise.all([
              page.waitForEvent("download"),
              exportBtn.click()
            ]);
            // Save the downloaded zip to the repository
            const downloadPath = "web/freej2me-data.zip";
            await download.saveAs(downloadPath);
            console.log("Exported game data saved to " + downloadPath);
          } else {
            console.error("Export button not found");
          }

          await browser.close();
          console.log("Capture complete.");
        })();
        '

    - name: Update index.html to use local runtime
      run: |
        sed -i 's|https://cjrtnc.leaningtech.com/|cheerpj-local/|g' web/index.html

    - name: Commit captured files
      run: |
        git config user.name "github-actions[bot]"
        git config user.email "github-actions[bot]@users.noreply.github.com"
        git add web/cheerpj-local/ web/freej2me-data.zip web/index.html
        git commit -m "Add complete runtime and exported game data" || echo "Nothing to commit"
        git push
