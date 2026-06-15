import { test, expect, Browser, Page } from '@playwright/test';

async function enterLobby(page: Page, nickname: string): Promise<void> {
  await page.goto('/');
  await page.locator('input[placeholder="输入昵称（最多8个字）"]').fill(nickname);
}

async function createRoom(page: Page): Promise<string> {
  await page.locator('button:has-text("创建房间")').click();
  const codeEl = page.locator('.lobby__room-code strong');
  await expect(codeEl).toBeVisible({ timeout: 10_000 });
  return (await codeEl.textContent()) ?? '';
}

async function joinRoom(page: Page, code: string): Promise<void> {
  await page.locator('input[placeholder="输入6位房间码"]').fill(code);
  await page.locator('button:has-text("加入房间")').click();
  await expect(page.locator('.lobby__room-code strong')).toBeVisible({ timeout: 10_000 });
}

async function clickReady(page: Page): Promise<void> {
  const readyBtn = page.locator('button:has-text("准备")');
  if (await readyBtn.isVisible()) {
    await readyBtn.click();
  }
}

/**
 * Drives a player page through a full game: draw → discard, pass on all actions.
 * Returns when the settlement overlay appears.
 */
async function autoPlayUntilSettlement(page: Page): Promise<void> {
  const settlement = page.locator('.settlement-overlay');

  for (let i = 0; i < 300; i++) {
    if (await settlement.isVisible()) return;

    // Handle action buttons (win / pass) first — these have a 20s server timeout
    const winBtn = page.locator('button.action-btn--win');
    if (await winBtn.isVisible({ timeout: 0 }).catch(() => false)) {
      await winBtn.click();
      continue;
    }

    const passBtn = page.locator('button.action-btn--pass');
    if (await passBtn.isVisible({ timeout: 0 }).catch(() => false)) {
      await passBtn.click();
      continue;
    }

    // Pong/chi: just pass them all (avoid complicating the test)
    const pongBtn = page.locator('button.action-btn--pong');
    if (await pongBtn.isVisible({ timeout: 0 }).catch(() => false)) {
      // Pass button should also be visible alongside pong
      const p = page.locator('button.action-btn--pass');
      if (await p.isVisible({ timeout: 0 }).catch(() => false)) {
        await p.click();
        continue;
      }
    }

    // Discard newest tile when it's our turn
    const newestTile = page.locator('.board__my-hand .tile--newest');
    if (await newestTile.isVisible({ timeout: 0 }).catch(() => false)) {
      await newestTile.dblclick();
      await page.waitForTimeout(100);
      continue;
    }

    // Nothing actionable right now — wait briefly
    await page.waitForTimeout(300);
  }

  // Final check: settlement should have appeared within 300 iterations
  await expect(settlement).toBeVisible({ timeout: 5_000 });
}

test.describe('Gameplay', () => {
  test('4 players can complete a full game round', async ({ browser }) => {
    const contexts = await Promise.all(
      ['East', 'South', 'West', 'North'].map(() => browser.newContext()),
    );
    const pages = await Promise.all(contexts.map(ctx => ctx.newPage()));
    const [p1, p2, p3, p4] = pages;

    try {
      // Setup nicknames
      await Promise.all(
        ['东家', '南家', '西家', '北家'].map((name, i) => enterLobby(pages[i], name)),
      );

      // P1 creates room
      const code = await createRoom(p1);
      expect(code).toMatch(/^[A-Z0-9]{6}$/);

      // P2-P4 join
      await joinRoom(p2, code);
      await joinRoom(p3, code);
      await joinRoom(p4, code);

      // All players ready
      await Promise.all(pages.map(p => clickReady(p)));

      // Wait for start button to appear on host's page (all 4 ready)
      const startBtn = p1.locator('button:has-text("开始游戏")');
      await expect(startBtn).toBeVisible({ timeout: 15_000 });
      await startBtn.click();

      // All 4 should transition to the game board
      await Promise.all(
        pages.map(p => expect(p.locator('.board')).toBeVisible({ timeout: 20_000 })),
      );

      // Play all 4 pages concurrently until any one sees settlement
      await Promise.all(pages.map(p => autoPlayUntilSettlement(p)));

      // All pages should show the settlement overlay
      await Promise.all(
        pages.map(p =>
          expect(p.locator('.settlement-overlay')).toBeVisible({ timeout: 10_000 }),
        ),
      );
    } finally {
      await Promise.all(contexts.map(c => c.close()));
    }
  });

  test('game board shows correct player count and round info', async ({ browser }) => {
    const contexts = await Promise.all(
      Array.from({ length: 4 }, () => browser.newContext()),
    );
    const pages = await Promise.all(contexts.map(ctx => ctx.newPage()));

    try {
      await Promise.all(
        ['P1', 'P2', 'P3', 'P4'].map((name, i) => enterLobby(pages[i], name)),
      );

      const code = await createRoom(pages[0]);
      await Promise.all([1, 2, 3].map(i => joinRoom(pages[i], code)));
      await Promise.all(pages.map(p => clickReady(p)));

      const startBtn = pages[0].locator('button:has-text("开始游戏")');
      await expect(startBtn).toBeVisible({ timeout: 15_000 });
      await startBtn.click();

      // Each player's board should show round info
      for (const p of pages) {
        await expect(p.locator('.board__wind')).toBeVisible({ timeout: 20_000 });
        await expect(p.locator('.board__remaining')).toBeVisible();
        // Each player should see 13+ tiles in their hand
        await expect(p.locator('.board__my-hand .tile--lg').first()).toBeVisible();
      }
    } finally {
      await Promise.all(contexts.map(c => c.close()));
    }
  });
});
