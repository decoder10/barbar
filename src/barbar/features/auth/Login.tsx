import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Brand } from '../../ui/layout';
import { Field } from '../../ui/fields';
import { Submit } from '../../ui/modal';
import { t } from '../../presentation/i18n/runtime';
import { useBar } from '../../app/providers/BarProvider';

export function Login() {
  const { login, notice, busy } = useBar();
  const [username, setUsername] = useState('barbar');
  const [password, setPassword] = useState('');
  return (
    <main className="login-page">
      <section className="login-form-side">
        <Brand />
        <div className="login-form-wrap">
          <span className="eyebrow">BAR · ART · GOOD COMPANY</span>
          <h1>
            {t('Заходите.')}
            <br />
            {t('Вы у себя.')}
          </h1>
          <p className="login-description">
            {t('Любимые напитки, точные рецепты')}
            <br />
            {t('и ваш бар под контролем.')}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void login(username, password);
            }}
          >
            <fieldset className="action-lock" disabled={busy} aria-busy={busy}>
              <Field label="Логин">
                <input
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </Field>
              <Field label="Пароль вашего бара">
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  placeholder={t('Введите пароль')}
                  maxLength={1024}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              {t(
                notice && (
                  <div className="login-notice" role="alert">
                    {t(notice.text)}
                  </div>
                ),
              )}
              <Submit>
                {t('Войти в Barbar ')}
                <ArrowRight size={17} />
              </Submit>
            </fieldset>
          </form>
        </div>
        <div className="login-footer">
          <ShieldCheck size={16} />
          {t(' Одно пространство для всей команды')}
          <span>AMD ֏</span>
        </div>
      </section>
      <section className="login-visual">
        <div className="login-art-orbit" />
        <div className="login-visual-top">
          <span>BARBAR CAFE</span>
          <span>ART OF THE EVERYDAY ↗</span>
        </div>
        <div className="login-visual-copy">
          <span className="eyebrow">A LITTLE ART. A LITTLE SPIRIT.</span>
          <h2>
            {t('Искусство')}
            <br />
            {t('быть ')}
            <em>{t('в моменте.')}</em>
          </h2>
          <p>
            {t('Место для хороших вкусов')}
            <br />
            {t('и красивых вечеров.')}
          </p>
        </div>
        <div className="login-visual-bottom">
          <span>COCKTAILS & GOOD COMPANY</span>
          <span>EST. WITH LOVE ✳</span>
        </div>
      </section>
    </main>
  );
}
