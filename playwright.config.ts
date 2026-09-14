import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "ipad", use: { ...devices["iPad Pro 11"] } },
  ],
  webServer: {
    command: "pnpm --filter @zeus/web dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      NEON_AUTH_BASE_URL: process.env.NEON_AUTH_BASE_URL ?? "https://auth.example.invalid/zeus/auth",
      NEON_AUTH_COOKIE_SECRET: process.env.NEON_AUTH_COOKIE_SECRET ?? "ci-cookie-secret-that-is-longer-than-thirty-two-characters",
    },
  },
});
