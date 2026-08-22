import { useState } from 'react';
import FilmStrip from '../components/FilmStrip';
import { loginUser, registerUser } from '../api/auth';
import './LoginPage.css';

export default function LoginPage({ onAuthenticated = () => {} }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'register'
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'error'
  const [errorMessage, setErrorMessage] = useState('');

  function updateField(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setStatus('idle');
    setErrorMessage('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    try {
      const data =
        mode === 'signin'
          ? await loginUser({ username: form.username, password: form.password })
          : await registerUser(form);

      // Store the JWT so future API calls can send it back as
      // "Authorization: Bearer <token>".
      localStorage.setItem('nobochitro_token', data.token);
      localStorage.setItem('nobochitro_user', JSON.stringify(data.user));

      setStatus('idle');
      onAuthenticated(data.user);
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.message);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        {/* Left panel: brand */}
        <div className="brand-panel">
          <div className="brand-panel__content">
            <span className="brand-panel__eyebrow">নবচিত্র</span>
            <h1 className="brand-panel__wordmark">
              NOBO<em>CHITRO</em>
            </h1>
            <p className="brand-panel__tagline">
              Every film you've watched, loved, or lived through —
              catalogued in one place.
            </p>
          </div>

          <ul className="brand-panel__features">
            <li>Track your taste with Movie Passport</li>
            <li>Journal the moment, not just the rating</li>
            <li>Find your Taste Match among friends</li>
          </ul>
        </div>

        <FilmStrip />

        {/* Right panel: form */}
        <div className="form-panel">
          <div className="form-panel__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              className={`tab ${mode === 'signin' ? 'tab--active' : ''}`}
              onClick={() => switchMode('signin')}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={`tab ${mode === 'register' ? 'tab--active' : ''}`}
              onClick={() => switchMode('register')}
            >
              Create account
            </button>
          </div>

          <form className="form" onSubmit={handleSubmit} key={mode}>
            <h2 className="form__heading">
              {mode === 'signin' ? 'Welcome back' : 'Start your movie journey'}
            </h2>

            <label className="field">
              <span className="field__label">Username</span>
              <input
                className="field__input"
                type="text"
                autoComplete="username"
                required
                value={form.username}
                onChange={updateField('username')}
                placeholder="e.g. salman"
              />
            </label>

            {mode === 'register' && (
              <label className="field">
                <span className="field__label">Email</span>
                <input
                  className="field__input"
                  type="email"
                  autoComplete="email"
                  required
                  value={form.email}
                  onChange={updateField('email')}
                  placeholder="you@example.com"
                />
              </label>
            )}

            <label className="field">
              <span className="field__label">Password</span>
              <input
                className="field__input"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'register' ? 8 : undefined}
                value={form.password}
                onChange={updateField('password')}
                placeholder="••••••••"
              />
            </label>

            {status === 'error' && (
              <p className="form__error" role="alert">
                {errorMessage}
              </p>
            )}

            <button type="submit" className="submit-btn" disabled={status === 'loading'}>
              {status === 'loading'
                ? 'Please wait…'
                : mode === 'signin'
                ? 'Sign in'
                : 'Create account'}
            </button>

            <p className="form__switch">
              {mode === 'signin' ? (
                <>
                  New to NOBOCHITRO?{' '}
                  <button type="button" className="link-btn" onClick={() => switchMode('register')}>
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button type="button" className="link-btn" onClick={() => switchMode('signin')}>
                    Sign in
                  </button>
                </>
              )}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
