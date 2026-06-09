import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
 
const __dirname = dirname(fileURLToPath(import.meta.url));
const PLAYWRIGHT_DEPS = resolve(__dirname, '../../../../../.playwright-deps/usr/lib/x86_64-linux-gnu');
 
// Set LD_LIBRARY_PATH at module load time so Playwright inherits it
if (!process.env.LD_LIBRARY_PATH?.includes(PLAYWRIGHT_DEPS)) {
  process.env.LD_LIBRARY_PATH = `${PLAYWRIGHT_DEPS}${process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : ''}`;
}
 
const GPTZERO_URL = 'https://gptzero.me';
const TIMEOUT = 60000;
 
export async function detectWithGPTZero(text) {
  // Truncate to GPTZero's typical limit
  const maxChars = 5000;
  const content = text.length > maxChars ? text.slice(0, maxChars) : text;
 
  // Ensure LD_LIBRARY_PATH includes playwright deps
  const depsPath = PLAYWRIGHT_DEPS;
  if (!process.env.LD_LIBRARY_PATH?.includes(depsPath)) {
    process.env.LD_LIBRARY_PATH = `${depsPath}${process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : ''}`;
  }
 
  const proxyServer = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
 
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      proxy: proxyServer ? { server: proxyServer } : undefined,
    });
 
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
 
    await page.goto(GPTZERO_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForTimeout(2000);
 
    // Try to find and fill the text area
    const textArea = await findTextArea(page);
    if (!textArea) {
      // Fall back to LLM-assisted navigation
      return await llmAssistedDetection(page, content);
    }
 
    await textArea.fill(content);
    await page.waitForTimeout(500);
 
    // Find and click the submit/detect button
    const submitted = await clickDetectButton(page);
    if (!submitted) {
      return await llmAssistedDetection(page, content);
    }
 
    // Wait for results
    await page.waitForTimeout(8000);
 
    // Extract results from the page
    const results = await extractResults(page);
    await browser.close();
    return results;
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    throw new Error(`GPTZero detection failed: ${err.message}`);
  }
}
 
async function findTextArea(page) {
  const selectors = [
    'textarea',
    '[contenteditable="true"]',
    'textarea[placeholder*="paste"]',
    'textarea[placeholder*="text"]',
    '#text-input',
    '.text-input textarea',
  ];
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el && await el.isVisible()) return el;
  }
  return null;
}
 
async function clickDetectButton(page) {
  const selectors = [
    'button:has-text("Check")',
    'button:has-text("Detect")',
    'button:has-text("Scan")',
    'button:has-text("Submit")',
    'button:has-text("Get Results")',
    'button:has-text("Analyze")',
    '[type="submit"]',
  ];
  for (const sel of selectors) {
    try {
      const btn = await page.$(sel);
      if (btn && await btn.isVisible()) {
        await btn.click();
        return true;
      }
    } catch {}
  }
  return false;
}
 
async function extractResults(page) {
  const result = await page.evaluate(() => {
    const text = document.body.innerText;
 
    // Look for percentage patterns common in GPTZero results
    const aiMatch = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:probability\s+)?(?:AI|ai|artificial)/i)
      || text.match(/(?:AI|ai|artificial)[\s\S]{0,30}?(\d+(?:\.\d+)?)\s*%/i);
    const humanMatch = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:probability\s+)?(?:human|Human)/i)
      || text.match(/(?:human|Human)[\s\S]{0,30}?(\d+(?:\.\d+)?)\s*%/i);
 
    // Look for verdict text
    const verdictPatterns = [
      /(?:verdict|result|conclusion|assessment)[:\s]*(.*?)(?:\n|$)/i,
      /(Your text is (?:likely |most likely |probably )?(?:AI|human|mixed)[\s\S]*?)(?:\n|$)/i,
      /(We predict this text [\s\S]*?)(?:\n|$)/i,
      /(This text is (?:likely |most likely )?(?:AI-generated|human-written|mixed))/i,
    ];
    let verdict = '';
    for (const p of verdictPatterns) {
      const m = text.match(p);
      if (m) { verdict = m[1].trim(); break; }
    }
 
    // Check for login/captcha walls
    if (text.includes('Sign in') && text.includes('Create account') && !aiMatch && !humanMatch) {
      return { error: 'GPTZero requires login to view results' };
    }
    if (text.includes('CAPTCHA') || text.includes('captcha') || text.includes('verify you are human')) {
      return { error: 'GPTZero is showing a CAPTCHA' };
    }
 
    const aiProb = aiMatch ? parseFloat(aiMatch[1]) : null;
    const humanProb = humanMatch ? parseFloat(humanMatch[1]) : null;
 
    return {
      aiProbability: aiProb,
      humanProbability: humanProb ?? (aiProb != null ? 100 - aiProb : null),
      mixed: text.toLowerCase().includes('mixed'),
      verdict: verdict || (aiProb != null ? `AI probability: ${aiProb}%` : 'Could not determine verdict'),
      details: text.slice(0, 2000),
    };
  });
 
  if (result.error) return { ...result, mode: 'gptzero', source: 'playwright' };
  if (result.aiProbability == null && result.humanProbability == null) {
    return { error: 'Could not extract detection results from page', raw: result.details, mode: 'gptzero', source: 'playwright' };
  }
  return { ...result, mode: 'gptzero', source: 'playwright' };
}
 
async function llmAssistedDetection(page, content) {
  // Try broader selectors to find any editable area
  const extraSelectors = [
    'div[contenteditable="true"]',
    '[role="textbox"]',
    'textarea[name]',
    'div.ql-editor',
    '.ProseMirror',
    'div[data-placeholder]',
  ];
 
  let filled = false;
  for (const sel of extraSelectors) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        await el.fill(content);
        filled = true;
        break;
      }
    } catch {
      try {
        const el = await page.$(sel);
        if (el) { await el.click(); await page.keyboard.insertText(content); filled = true; break; }
      } catch {}
    }
  }
 
  if (!filled) {
    const pageText = await page.evaluate(() => document.body.innerText.slice(0, 1000));
    if (pageText.includes('Sign in') || pageText.includes('Log in')) {
      return { error: 'GPTZero requires login', mode: 'gptzero', source: 'playwright' };
    }
    return { error: 'Could not find text input on GPTZero page', mode: 'gptzero', source: 'playwright' };
  }
 
  await page.waitForTimeout(500);
 
  // Try to submit
  const submitted = await clickDetectButton(page);
  if (!submitted) {
    return { error: 'Could not find submit button on GPTZero page', mode: 'gptzero', source: 'playwright' };
  }
 
  await page.waitForTimeout(8000);
  return await extractResults(page);
}
 
