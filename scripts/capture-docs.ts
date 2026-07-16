import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIRECTORY = path.resolve(SCRIPT_DIRECTORY, '..');
const DOCS_DIRECTORY = path.join(PROJECT_DIRECTORY, 'docs');
const HOST = '127.0.0.1';
const PORT = 4173;
const BASE_URL = `http://${HOST}:${PORT}`;
const APP_START_TIMEOUT_MS = 60_000;

interface ScreenshotSpec {
  readonly fileName: string;
  readonly width: number;
  readonly height: number;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function isAppAvailable(): Promise<boolean> {
  try {
    const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(1_000) });
    if (!response.ok) return false;
    const html = await response.text();
    return html.includes('<title>BOQLint / 清单体检</title>') && html.includes('id="root"');
  } catch {
    return false;
  }
}

async function waitForApp(server: ChildProcess): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < APP_START_TIMEOUT_MS) {
    if (server.exitCode !== null) {
      throw new Error(
        `Vite exited before the documentation capture started (code ${server.exitCode}).`,
      );
    }
    if (await isAppAvailable()) return;
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${BASE_URL}.`);
}

async function startAppIfNeeded(): Promise<ChildProcess | null> {
  if (await isAppAvailable()) {
    console.info(`Reusing the running BOQLint app at ${BASE_URL}.`);
    return null;
  }

  const viteEntry = path.join(PROJECT_DIRECTORY, 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(
    process.execPath,
    [viteEntry, '--host', HOST, '--port', String(PORT), '--strictPort'],
    {
      cwd: PROJECT_DIRECTORY,
      env: { ...process.env, NODE_ENV: 'development' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let output = '';
  server.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8');
  });
  server.stderr?.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8');
  });

  try {
    await waitForApp(server);
  } catch (error) {
    server.kill();
    const details = output.trim();
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}${details ? `\n${details}` : ''}`,
      { cause: error },
    );
  }

  console.info(`Started the BOQLint app at ${BASE_URL}.`);
  return server;
}

async function stopApp(server: ChildProcess | null): Promise<void> {
  if (server === null || server.exitCode !== null) return;
  const closed = new Promise<void>((resolve) => server.once('close', () => resolve()));
  server.kill();
  await Promise.race([closed, delay(3_000)]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

async function stabilize(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
  await page.evaluate(async () => document.fonts.ready);
}

function assertContainsAll(text: string, required: readonly string[], label: string): void {
  const missing = required.filter((value) => !text.includes(value));
  if (missing.length > 0) {
    throw new Error(`${label} is missing required visible content: ${missing.join(', ')}`);
  }
}

async function capturePage(page: Page, spec: ScreenshotSpec): Promise<void> {
  const finalPath = path.join(DOCS_DIRECTORY, spec.fileName);
  const temporaryPath = path.join(DOCS_DIRECTORY, `.${spec.fileName}.tmp.png`);

  try {
    await page.screenshot({
      path: temporaryPath,
      type: 'png',
      fullPage: false,
      animations: 'disabled',
      caret: 'hide',
    });
    await verifyPng(temporaryPath, spec.width, spec.height);
    await unlink(finalPath).catch(() => undefined);
    await rename(temporaryPath, finalPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }

  console.info(
    `Captured ${path.relative(PROJECT_DIRECTORY, finalPath)} (${spec.width}×${spec.height}).`,
  );
}

async function verifyPng(
  filePath: string,
  expectedWidth: number,
  expectedHeight: number,
): Promise<void> {
  const buffer = await readFile(filePath);
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error(`${path.basename(filePath)} is not a valid PNG.`);
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(
      `${path.basename(filePath)} is ${width}×${height}; expected ${expectedWidth}×${expectedHeight}.`,
    );
  }
  if (buffer.length < 20_000) {
    throw new Error(`${path.basename(filePath)} is unexpectedly small and may be blank.`);
  }
}

async function captureResultsPreview(browser: Browser): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    colorScheme: 'light',
  });
  const page = await context.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.getByTestId('sample-issues').click();
    await page.getByTestId('continue-mapping').waitFor({ state: 'visible' });
    await page.getByTestId('continue-mapping').click();
    await page.getByTestId('run-check').waitFor({ state: 'visible' });
    await page.getByTestId('run-check').click();

    const results = page.getByTestId('results-page');
    await results.waitFor({ state: 'visible' });
    await page.waitForLoadState('networkidle');
    await stabilize(page);
    await page.evaluate(() => window.scrollTo(0, 0));

    const visibleText = await results.innerText();
    assertContainsAll(visibleText, ['错误', '警告', '提示'], 'Results preview');
    if (!/(REQ-001|NUM-001|CALC-001|FORMULA-001)/u.test(visibleText)) {
      throw new Error('Results preview does not visibly contain an issue rule ID.');
    }
    const headerPosition = await page
      .getByTestId('app-header')
      .evaluate((element) => getComputedStyle(element).position);
    if (headerPosition !== 'sticky') {
      throw new Error('Results preview stylesheet did not apply to the application header.');
    }

    await capturePage(page, { fileName: 'preview.png', width: 1440, height: 900 });
  } finally {
    await context.close();
  }
}

async function captureSocialPreview(browser: Browser): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 640 },
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    colorScheme: 'light',
  });
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/?social=1`, { waitUntil: 'networkidle' });
    const socialPreview = page.getByTestId('social-preview');
    await socialPreview.waitFor({ state: 'visible' });
    await stabilize(page);
    await page.evaluate(() => window.scrollTo(0, 0));

    const visibleText = await socialPreview.innerText();
    assertContainsAll(visibleText, ['BOQLint', '清单体检'], 'Social preview');
    const socialStyles = await socialPreview.evaluate((element) => {
      const styles = getComputedStyle(element);
      return { display: styles.display, backgroundColor: styles.backgroundColor };
    });
    if (socialStyles.display !== 'grid' || socialStyles.backgroundColor !== 'rgb(19, 39, 54)') {
      throw new Error('Social preview stylesheet did not apply to the capture layout.');
    }

    await capturePage(page, { fileName: 'social-preview.png', width: 1280, height: 640 });
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  await mkdir(DOCS_DIRECTORY, { recursive: true });
  const server = await startAppIfNeeded();
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    await captureResultsPreview(browser);
    await captureSocialPreview(browser);
  } finally {
    await browser?.close();
    await stopApp(server);
  }
}

await main();
