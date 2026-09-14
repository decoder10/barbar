import { expect, test } from '@playwright/test';
import { staffData } from '../netlify/lib/barbar-access';
import type { UserProfile } from '../src/barbar/domain/identity/user';
import { fixtureData } from './fixtures';

test('owner creates a named worker and owner, table persists after refresh', async ({ page }) => {
  const owner: UserProfile = {
    id: 'owner',
    username: 'admin',
    fullName: 'Арам Мкртчян',
    email: '',
    phone: '',
    role: 'owner',
    active: true,
    createdAt: '',
  };
  const users = [owner];
  await page.route('**/api/barbar/auth', (route) =>
    route.fulfill({ json: { authenticated: true, role: 'admin', user: owner } }),
  );
  await page.route('**/api/barbar', (route) =>
    route.fulfill({ json: { role: 'admin', data: fixtureData(), revision: 'test' } }),
  );
  await page.route('**/api/barbar/users', async (route) => {
    if (route.request().method() === 'POST') {
      const { password, ...profile } = route.request().postDataJSON();
      expect(password.length).toBeGreaterThanOrEqual(12);
      const user = { ...profile, id: String(users.length), active: true, createdAt: '' };
      users.push(user);
      await route.fulfill({ status: 201, json: { user } });
    } else if (route.request().method() === 'PATCH') {
      const { password, ...profile } = route.request().postDataJSON();
      expect(password).toBe('replacement-password-123');
      const index = users.findIndex((u) => u.id === profile.id);
      users[index] = { ...users[index], ...profile };
      await route.fulfill({ json: { user: users[index] } });
    } else await route.fulfill({ json: { users } });
  });
  await page.goto('/users');
  for (const [name, role] of [
    ['Анна', 'worker'],
    ['Давид', 'owner'],
  ]) {
    await page.getByRole('button', { name: 'Новый пользователь' }).click();
    await page.getByLabel('Имя и фамилия').fill(name);
    await page.getByLabel('Логин', { exact: true }).fill(role + '-test');
    await page.getByLabel('Роль', { exact: true }).selectOption(role);
    await page.getByLabel('Email (необязательно)').fill('test@example.com');
    await page.getByLabel('Телефон (необязательно)').fill('+374 123456');
    await page.getByLabel('Пароль', { exact: true }).fill('new-user-password-123');
    await page.getByRole('button', { name: 'Создать пользователя' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('row').filter({ hasText: name })).toContainText(
      role === 'owner' ? 'Владелец' : 'Работник',
    );
  }
  await page.reload();
  await expect(page.getByRole('row')).toHaveCount(4);
  await page
    .getByRole('row')
    .filter({ hasText: 'Анна' })
    .getByRole('button', { name: 'Редактировать' })
    .click();
  await page.getByLabel('Имя и фамилия').fill('Анна Новая');
  await page.getByLabel('Роль', { exact: true }).selectOption('owner');
  await page.getByLabel('Доступ', { exact: true }).selectOption('blocked');
  await page.getByLabel('Новый пароль', { exact: true }).fill('replacement-password-123');
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: 'Анна Новая' })).toContainText('Отключён');
  await expect(page.getByRole('row').filter({ hasText: 'Анна Новая' })).toContainText('Владелец');
  await page.screenshot({ path: '/tmp/barbar-users-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Новый пользователь' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('worker cannot open user management', async ({ page }) => {
  await page.route('**/api/barbar/auth', (route) =>
    route.fulfill({ json: { authenticated: true, role: 'barbar' } }),
  );
  await page.route('**/api/barbar', (route) =>
    route.fulfill({ json: { role: 'barbar', staffData: staffData(fixtureData()), revision: 'test' } }),
  );
  await page.goto('/users');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: /Пользователи/ })).toHaveCount(0);
});
