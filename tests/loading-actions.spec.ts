import { expect, test } from '@playwright/test';
import { fixtureData } from './fixtures';
import { applyCommand } from '../src/barbar/domain/model';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test('sale is single-flight, freezes the form without borders, preserves values on failure and allows retry', async ({
  page,
}) => {
  let data = fixtureData();
  const hold = gate();
  const commands: { id: string }[] = [];
  await page.route('**/api/barbar/auth', (r) => r.fulfill({ json: { authenticated: true, role: 'admin' } }));
  await page.route('**/api/barbar', async (r) => {
    if (r.request().method() === 'POST') {
      const { command } = r.request().postDataJSON();
      commands.push(command);
      if (commands.length === 1) {
        await hold.promise;
        return r.fulfill({ status: 503, json: { error: 'Сервер временно недоступен' } });
      }
      data = applyCommand(data, command);
    }
    return r.fulfill({ json: { data, role: 'admin', revision: 'test' } });
  });
  await page.goto('/');
  await page.locator('.drink-card').first().click();
  const dialog = page.getByRole('dialog');
  await page.getByLabel('Количество порций').fill('2');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    expect(
      await dialog.locator('fieldset.action-lock').evaluate((e) => getComputedStyle(e).borderTopWidth),
    ).toBe('0px');
  }
  // Two synchronous submits bypass the visual disabled button to exercise the ref lock.
  await dialog.locator('form').evaluate((form: HTMLFormElement) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect.poll(() => commands.length).toBe(1);
  await expect(dialog).toHaveAttribute('aria-busy', 'true');
  await expect(dialog.getByRole('button', { name: 'Сохраняем…' })).toBeDisabled();
  await expect(page.getByLabel('Количество порций')).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Закрыть', exact: true })).toBeDisabled();
  await expect(page.locator('.sidebar')).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText('Сохраняем…');
  await page.screenshot({ path: '/tmp/barbar-loading-modal.png' });
  hold.release();
  await expect(dialog.getByRole('alert')).toContainText('Сервер временно недоступен');
  await expect(page.getByLabel('Количество порций')).toBeEnabled();
  await expect(page.getByLabel('Количество порций')).toHaveValue('2');
  await page.getByRole('button', { name: 'Записать продажу' }).click();
  await expect(dialog).toHaveCount(0);
  expect(commands).toHaveLength(2);
  expect(commands[1].id).toBe(commands[0].id);
  expect(data.sales).toHaveLength(1);
});

test('user save and logout show progress and cannot be submitted twice', async ({ page }) => {
  const save = gate(),
    logout = gate();
  let writes = 0,
    exits = 0;
  await page.route('**/api/barbar/auth', async (r) => {
    if (r.request().method() === 'DELETE') {
      exits++;
      await logout.promise;
      return r.fulfill({ json: { authenticated: false } });
    }
    return r.fulfill({ json: { authenticated: true, role: 'admin' } });
  });
  await page.route('**/api/barbar', (r) =>
    r.fulfill({ json: { data: fixtureData(), role: 'admin', revision: 'test' } }),
  );
  await page.route('**/api/barbar/users', async (r) => {
    if (r.request().method() === 'POST') {
      writes++;
      await save.promise;
      return r.fulfill({ status: 500, json: { error: 'Не удалось сохранить пользователя' } });
    }
    return r.fulfill({ json: { users: [] } });
  });
  await page.goto('/users');
  await page.getByRole('button', { name: 'Новый пользователь' }).click();
  await page.getByLabel('Имя и фамилия').fill('Новый Работник');
  await page.getByLabel('Логин', { exact: true }).fill('worker-new');
  await page.getByLabel('Пароль', { exact: true }).fill('test-password-123');
  const dialog = page.getByRole('dialog');
  await dialog.locator('form').evaluate((form: HTMLFormElement) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect.poll(() => writes).toBe(1);
  await expect(page.getByLabel('Имя и фамилия')).toBeDisabled();
  await expect(dialog.getByRole('status')).toBeVisible();
  save.release();
  await expect(dialog.getByRole('alert')).toContainText('Не удалось сохранить пользователя');
  await expect(page.getByLabel('Имя и фамилия')).toHaveValue('Новый Работник');
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Выйти', exact: true }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect.poll(() => exits).toBe(1);
  await expect(page.locator('.action-progress')).toContainText('Выходим…');
  await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toBeDisabled();
  logout.release();
  await expect(page.getByLabel('Пароль вашего бара')).toBeVisible();
});

test('refresh is visibly single-flight, and the logo opens sales and closes mobile navigation', async ({
  page,
}) => {
  const refresh = gate();
  let reads = 0;
  await page.route('**/api/barbar/auth', (r) => r.fulfill({ json: { authenticated: true, role: 'admin' } }));
  await page.route('**/api/barbar', async (r) => {
    reads++;
    if (reads > 1) await refresh.promise;
    return r.fulfill({ json: { data: fixtureData(), role: 'admin', revision: 'test' } });
  });
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Обновить данные' }).click();
  await expect(page.getByRole('button', { name: 'Обновить данные' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Обновить данные' })).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.sync-status')).toContainText('Обновляем…');
  refresh.release();
  await expect(page.getByRole('button', { name: 'Обновить данные' })).toBeEnabled();
  expect(reads).toBe(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.locator('.sidebar .brand-home-link').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.sidebar')).not.toBeInViewport();
});
