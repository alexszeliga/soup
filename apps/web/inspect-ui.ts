import { chromium } from '@playwright/test';

async function capture() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Set viewport to a common size
  await page.setViewportSize({ width: 1280, height: 800 });
  
  try {
    console.log('Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    
    // Wait for the loader to disappear or content to appear
    await page.waitForTimeout(2000); 
    
    console.log('Capturing screenshot...');
    await page.screenshot({ path: 'ui-debug.png', fullPage: true });
    console.log('Screenshot saved to apps/web/ui-debug.png');
  } catch (error) {
    console.error('Failed to capture screenshot:', error);
  } finally {
    await browser.close();
  }
}

capture();
