import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';

async function createAndEnterLobby(page: Page, nickname: string): Promise<string> {
  await page.goto('/');
  await page.locator('input[placeholder="输入昵称（最多8个字）"]').fill(nickname);
  await page.locator('button:has-text("创建房间")').click();
  const codeEl = page.locator('.lobby__room-code strong');
  await expect(codeEl).toBeVisible();
  return codeEl.textContent().then(t => t ?? '');
}

async function joinLobby(page: Page, nickname: string, code: string): Promise<void> {
  await page.goto('/');
  await page.locator('input[placeholder="输入昵称（最多8个字）"]').fill(nickname);
  await page.locator('input[placeholder="输入6位房间码"]').fill(code);
  await page.locator('button:has-text("加入房间")').click();
  await expect(page.locator('.lobby__room-code strong')).toBeVisible();
}

test.describe('Lobby', () => {
  test('host can create a room and see the room code', async ({ page }) => {
    await page.goto('/');

    await page.locator('input[placeholder="输入昵称（最多8个字）"]').fill('TestHost');
    await page.locator('button:has-text("创建房间")').click();

    await expect(page.locator('.lobby__room-code strong')).toBeVisible();
    const code = await page.locator('.lobby__room-code strong').textContent();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });

  test('two players can join the same room', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    try {
      const code = await createAndEnterLobby(p1, 'Player1');
      expect(code).toMatch(/^[A-Z0-9]{6}$/);

      await joinLobby(p2, 'Player2', code);

      // Both should see the room code
      await expect(p1.locator('.lobby__room-code strong')).toHaveText(code);
      await expect(p2.locator('.lobby__room-code strong')).toHaveText(code);

      // Both seats should show player nicknames
      await expect(p1.locator('.lobby__seat-name').first()).toBeVisible();
      await expect(p1.locator('.lobby__seat-name').nth(1)).toBeVisible();
    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  });

  test('player can ready up and host sees the ready badge', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    try {
      const code = await createAndEnterLobby(p1, 'Host');
      await joinLobby(p2, 'Guest', code);

      // Guest clicks ready
      await p2.locator('button:has-text("准备")').click();

      // Host's view should show the guest as ready
      await expect(p1.locator('.lobby__seat-badge--ready')).toBeVisible();
    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  });

  test('error shown when creating room without nickname', async ({ page }) => {
    await page.goto('/');
    await page.locator('button:has-text("创建房间")').click();
    await expect(page.locator('.lobby__error')).toBeVisible();
  });
});
