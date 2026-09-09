import { useState, useEffect } from 'react';
import { loginUser, registerUser } from '../api/auth';
import './AuthModal.css';

export default function AuthModal({ initialMode = 'signin', onClose, onAuthenticated }) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'error' | 'registered'
  const [errorMessage, setErrorMessage] = useState('');

  // Close on Escape, for anyone navigating by keyboard.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function updateField(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  function switchMode(nextMode) {
    setMode(nextMode); setStatus('idle'); setErrorMessage('');
    // Clear the username, email, and password when switching tabs 
    setForm({ username: '', email: '', password: '' });
  }

    async function handleSubmit(e) {
      e.preventDefault();
      setStatus('loading');
      setErrorMessage('');

      try {
        if (mode === 'register') {
          await registerUser(form);

          // Account created, but per the assignment's auth flow, don't log them
          // in automatically. Stay on this tab and show success -- the user
          // switches to Sign in themselves when they're ready.
          setStatus('registered');
          setForm((prev) => ({ ...prev, password: '' }));
          return;
        }

        const data = await loginUser({ username: form.username, password: form.password });

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
      <div className="auth-modal__backdrop" onClick={onClose}>
        <div className="auth-modal__card" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="auth-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>

          <div className="auth-modal__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              className={`auth-modal__tab ${mode === 'signin' ? 'auth-modal__tab--active' : ''}`}
              onClick={() => switchMode('signin')}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={`auth-modal__tab ${mode === 'register' ? 'auth-modal__tab--active' : ''}`}
              onClick={() => switchMode('register')}
            >
              Create account
            </button>
          </div>

          <form className="auth-modal__form" onSubmit={handleSubmit} key={mode}>
            <h2 className="auth-modal__heading">
              {mode === 'signin' ? 'Welcome back' : 'Start your movie journey'}
            </h2>

            <label className="field">
              <span className="field__label">Username</span>
              <input
                className="field__input"
                type="text"
                autoComplete="username"
                autoFocus
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

            {status === 'registered' && mode === 'register' && (
              <p className="auth-modal__success" role="status">
                Account created! Go to Sign in to log in.
              </p>
            )}

            {status === 'error' && (
              <p className="auth-modal__error" role="alert">
                {errorMessage}
              </p>
            )}

            <button type="submit" className="auth-modal__submit" disabled={status === 'loading'}>
              {status === 'loading' ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    );
  }
