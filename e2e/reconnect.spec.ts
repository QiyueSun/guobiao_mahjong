import { test, expect, Browser, Page } from '@playwright/test';

async function setupRoom(
  browser: Browser,
  count: number,
): Promise<{ pages: Page[]; code: string; contexts: Awaited<ReturnType<Browser['newContext']>>[] }> {
  const contexts = await Promise.all(Array.from({ length: count }, () => browser.newContext()));
  const pages = await Promise.all(contexts.map(ctx => ctx.newPage()));

  const names = ['重连者', 'Bot甲', 'Bot乙', 'Bot丙'].slice(0, count);
  await Promise.all(
    names.map(async (name, i) => {
      await pages[i].goto('/');
      await pages[i].locator('input[placeholder="输入昵称（最多8个字）"]').fill(name);
    }),
  );

  await pages[0].locator('button:has-text("创建房间")').click();
  const codeEl = pages[0].locator('.lobby__room-code strong');
  await expect(codeEl).toBeVisible({ timeout: 10_000 });
  const code = (await codeEl.textContent()) ?? '';

  for (let i = 1; i < count; i++) {
    await pages[i].locator('input[placeholder="输入6位房间码"]').fill(code);
    await pages[i].locator('button:has-text("加入房间")').click();
    await expect(pages[i].locator('.lobby__room-code strong')).toBeVisible({ timeout: 10_000 });
  }

  return { pages, code, contexts };
}

test.describe('Reconnect', () => {
  test('player reconnects to lobby after page reload', async ({ browser }) => {
    const { pages, code, contexts } = await setupRoom(browser, 2);
    const [host, guest] = pages;

    try {
      // Guest reloads
      await guest.reload();

      // Guest should be back in the room (room state restored via sessionStorage)
      await expect(guest.locator('.lobby__room-code strong')).toHaveText(code, { timeout: 10_000 });
    } finally {
      await Promise.all(contexts.map(c => c.close()));
    }
  });

  test('player reconnects to in-progress game after page reload', async ({ browser }) => {
    const { pages, code, contexts } = await setupRoom(browser, 4);
    const [host, ...others] = pages;

    try {
      // All ready and start
      await Promise.all(pages.map(p => p.locator('button:has-text("准备")').click()));
      const startBtn = host.locator('button:has-text("开始游戏")');
      await expect(startBtn).toBeVisible({ timeout: 15_000 });
      await startBtn.click();

      // Wait for game to start on all pages
      await Promise.all(pages.map(p => expect(p.locator('.board')).toBeVisible({ timeout: 20_000 })));

      // Reload the host page mid-game
      await host.reload();

      // Host should see the game board again (session restored from sessionStorage)
      await expect(host.locator('.board')).toBeVisible({ timeout: 15_000 });

      // Host's hand should be visible (their own tiles)
      await expect(host.locator('.board__my-hand .tile--lg').first()).toBeVisible({ timeout: 10_000 });
    } finally {
      await Promise.all(contexts.map(c => c.close()));
    }
  });
});
