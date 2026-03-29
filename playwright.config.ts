import { defineConfig } from "@playwright/test";

const playwrightWebPort = Number(process.env.PLAYWRIGHT_WEB_PORT ?? "3100");
const playwrightBaseUrl = `http://127.0.0.1:${playwrightWebPort}`;
const shouldReuseExistingServer =
  process.env.CI !== "true" &&
  process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER !== "false";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: playwrightBaseUrl,
    channel: "msedge",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: `npx next dev --hostname 127.0.0.1 --port ${playwrightWebPort}`,
    url: playwrightBaseUrl,
    reuseExistingServer: shouldReuseExistingServer,
    timeout: 120_000
  }
});
