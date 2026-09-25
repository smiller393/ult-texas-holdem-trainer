import { test, expect } from '@playwright/test';

const isMobile = (testInfo) => /iphone|pixel/.test(testInfo.project.name);

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto('./#play');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#playerCards .card')).toHaveCount(2);
});

test.afterEach(async ({ page }) => {
  expect(page.errors, 'no console or page errors').toEqual([]);
});

async function loadPlay(page, player, dealer, board) {
  await page.evaluate(([p, d, b]) => window.__uth.loadPlay(p, d, b), [player, dealer, board]);
}

test('deals a hand with a preflop decision', async ({ page }) => {
  await expect(page.locator('#playStatus')).toContainText('Raise 4x or check?');
  await expect(page.locator('#dealerCards .card.back')).toHaveCount(2);
  await expect(page.locator('#boardCards .card.slot')).toHaveCount(5);
  await expect(page.getByRole('button', { name: /Raise 4x/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Check/ })).toBeVisible();
});

test('correct preflop raise is marked right and settles the hand', async ({ page }) => {
  await loadPlay(page, 'As Kd', '3c 3d', '2h 7s 9c Kc 4h');
  await page.getByRole('button', { name: /Raise 4x/ }).click();
  const fb = page.locator('#playFeedback .fb').first();
  await expect(fb).toHaveClass(/ok/);
  await expect(fb).toContainText('Any ace');
  await expect(page.locator('#playStatus .result')).toContainText('You win');
  await expect(page.locator('#playStatus .result')).toContainText('+$50');
  await expect(page.locator('#boardCards .card:not(.slot)')).toHaveCount(5);
  await expect(page.locator('#dealerCards .card.back')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Deal next hand/ })).toBeVisible();
  await expect(page.locator('#scorePill')).toContainText('100%');
});

test('wrong preflop raise explains the correct play', async ({ page }) => {
  await loadPlay(page, '7s 2d', 'Kc Kh', '2h 7h 9c Jd 4h');
  await page.getByRole('button', { name: /Raise 4x/ }).click();
  const fb = page.locator('#playFeedback .fb').first();
  await expect(fb).toHaveClass(/bad/);
  await expect(fb).toContainText('Correct play: Check');
  await expect(fb).toContainText('never raise preflop');
});

test('flop decision after checking preflop', async ({ page }) => {
  await loadPlay(page, 'Ts 4s', 'Kc Kh', '8s 2s Kd 3c 5h');
  await page.getByRole('button', { name: /^Check/ }).click();
  await expect(page.locator('#playStatus')).toContainText('Raise 2x or check?');
  await expect(page.locator('#boardCards .card:not(.slot)')).toHaveCount(3);
  await page.getByRole('button', { name: /Raise 2x/ }).click();
  const fb = page.locator('#playFeedback .fb').first();
  await expect(fb).toHaveClass(/ok/);
  await expect(fb).toContainText('Four to a flush');
});

test('river mistake shows the dealer outs breakdown (WoO example: 23 outs)', async ({ page }) => {
  await loadPlay(page, '9h 3c', 'Qc Qd', 'Kd 7s 2h Ac Td');
  await page.getByRole('button', { name: /^Check/ }).click();
  await page.getByRole('button', { name: /^Check/ }).click();
  await expect(page.locator('#playStatus')).toContainText('Raise 1x or fold?');
  await page.getByRole('button', { name: /Raise 1x/ }).click();
  const fb = page.locator('#playFeedback .fb').first();
  await expect(fb).toHaveClass(/bad/);
  await expect(fb).toContainText('Correct play: Fold');
  await expect(fb.locator('.outs-num')).toHaveText('23');
  await expect(fb.locator('.ogrid .gc.out')).toHaveCount(23);
  await expect(fb.locator('.ogrid .gc.tie')).toHaveCount(3);
  await expect(fb).toContainText('Pairs the board');
  await expect(fb).toContainText('Out-kicks you');
  // Earlier correct checks are still listed.
  await expect(page.locator('#playFeedback .fb.is-ok')).toHaveCount(2);
});

test('outs drill scores decision and count', async ({ page }) => {
  await page.getByRole('link', { name: /Outs Drill/ }).click();
  await expect(page.locator('#drillBoard .card')).toHaveCount(5);
  await page.evaluate(() => window.__uth.loadDrill('9h 3c', 'Kd 7s 2h Ac Td'));
  await page.locator('#countInput').fill('23');
  await page.getByRole('button', { name: /^Fold/ }).click();
  const fb = page.locator('#drillFeedback .fb');
  await expect(fb).toHaveClass(/ok/);
  await expect(fb).toContainText('exactly right');
  await expect(page.getByRole('button', { name: /Next spot/ })).toBeVisible();
  await page.getByRole('button', { name: /Next spot/ }).click();
  await expect(page.locator('#drillFeedback')).toBeEmpty();
  await expect(page.locator('#countInput')).toHaveValue('');
});

test('drill stepper starts from 15 and adjusts', async ({ page }) => {
  await page.goto('./#drill');
  // First tap jumps to 15, the pair-outs base on an unpaired board.
  await page.getByRole('button', { name: 'Increase count' }).click();
  await expect(page.locator('#countInput')).toHaveValue('15');
  await page.getByRole('button', { name: 'Increase count' }).click();
  await expect(page.locator('#countInput')).toHaveValue('16');
  await page.getByRole('button', { name: 'Decrease count' }).click();
  await page.getByRole('button', { name: 'Decrease count' }).click();
  await expect(page.locator('#countInput')).toHaveValue('14');
});

test('every drill mode generates playable spots', async ({ page }) => {
  await page.goto('./#drill');
  for (const mode of ['close', 'tricky', 'mixed']) {
    await page.locator('#drillMode').selectOption(mode);
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: /^Fold/ }).click();
      await expect(page.locator('#drillFeedback .fb')).toBeVisible();
      await page.getByRole('button', { name: /Next spot/ }).click();
    }
  }
});

test('stats track decisions and mistakes, and river mistakes can be replayed', async ({ page }) => {
  await loadPlay(page, '9h 3c', 'Qc Qd', 'Kd 7s 2h Ac Td');
  await page.getByRole('button', { name: /^Check/ }).click();
  await page.getByRole('button', { name: /^Check/ }).click();
  await page.getByRole('button', { name: /Raise 1x/ }).click();
  await page.getByRole('link', { name: /Stats/ }).click();
  await expect(page.locator('.tile').first()).toContainText('67%');
  await expect(page.locator('.bar-row[data-cat="river"]')).toContainText('0/1');
  await expect(page.locator('.bar-row[data-cat="preflop"]')).toContainText('1/1');
  await expect(page.locator('.mistake')).toHaveCount(1);
  await expect(page.locator('.mistake')).toContainText('23 outs');

  // Persists across reloads.
  await page.reload();
  await expect(page.locator('.mistake')).toHaveCount(1);

  await page.getByRole('button', { name: 'Practice this spot' }).click();
  await expect(page).toHaveURL(/#drill/);
  await expect(page.locator('#drillBoard .card')).toHaveCount(5);
  await expect(page.locator('#drillBoard [data-card="Kd"]')).toBeVisible();
  await expect(page.locator('#drillHole [data-card="9h"]')).toBeVisible();
});

test('strategy page shows the full preflop chart', async ({ page }) => {
  await page.getByRole('link', { name: /Strategy/ }).click();
  await expect(page.locator('#preflopGrid > div')).toHaveCount(169);
  await expect(page.locator('#preflopGrid > div.raise')).toHaveCount(69);
  await expect(page.locator('#outsGuide')).toContainText('Counting dealer outs');
});

test('four-color deck setting persists', async ({ page }) => {
  await page.goto('./#stats');
  await page.locator('#fourColor').check();
  await expect(page.locator('body')).toHaveClass(/four-color/);
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/four-color/);
});

test('layout fits the viewport on every view', async ({ page }, testInfo) => {
  for (const view of ['play', 'drill', 'strategy', 'stats']) {
    await page.goto(`./#${view}`);
    await page.waitForTimeout(150);
    const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(sw, `${view} has no horizontal overflow`).toBeLessThanOrEqual(iw);
    await expect(page.locator('.tabs')).toBeInViewport();
  }
  await page.screenshot({ path: testInfo.outputPath(`stats-${testInfo.project.name}.png`) });
});

test('play actions are reachable without scrolling and thumb-sized', async ({ page }, testInfo) => {
  const vp = page.viewportSize();
  for (const btn of await page.locator('#playActions .btn').all()) {
    const box = await btn.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  }
  // Board and player cards visible above the fold too.
  await expect(page.locator('#playerCards .card').first()).toBeInViewport();
  if (isMobile(testInfo)) {
    // Buttons must not sit under the bottom nav.
    const nav = await page.locator('.tabs').boundingBox();
    for (const btn of await page.locator('#playActions .btn').all()) {
      const box = await btn.boundingBox();
      expect(box.y + box.height).toBeLessThanOrEqual(nav.y);
    }
  }
  await page.screenshot({ path: testInfo.outputPath(`play-${testInfo.project.name}.png`) });
});

test('keyboard shortcuts on desktop', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'desktop only');
  await loadPlay(page, '7s 2d', 'Kc Kh', '2h 7h 9c Jd 4h');
  await page.keyboard.press('c');
  await expect(page.locator('#playStatus')).toContainText('Raise 2x or check?');
  await page.keyboard.press('c');
  await page.keyboard.press('f');
  await expect(page.locator('#playStatus .result')).toContainText('You folded');
  await page.keyboard.press('Space');
  await expect(page.locator('#playStatus')).toContainText('Raise 4x or check?');
});
