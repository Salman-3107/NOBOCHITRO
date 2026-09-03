import { useState } from 'react';
import { adminLogin } from '../api/auth';
import './AdminLoginPage.css';

export default function AdminLoginPage({ onAuthenticated }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'error'
  const [errorMessage, setErrorMessage] = useState('');

  function updateField(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    try {
      const data = await adminLogin(form);
      localStorage.setItem('nobochitro_admin_token', data.token);
      localStorage.setItem('nobochitro_admin_user', JSON.stringify(data.user));
      setStatus('idle');
      onAuthenticated(data.user);
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.message);
    }
  }

  return (
    <div className="admin-login">
      <div className="admin-login__card">
        <p className="admin-login__eyebrow">NOBOCHITRO</p>
        <h1 className="admin-login__heading">Admin Console</h1>
        <p className="admin-login__subtext">Internal tool. Admin credentials only.</p>

        <form onSubmit={handleSubmit} className="admin-login__form">
          <label className="admin-field">
            <span className="admin-field__label">Username</span>
            <input
              className="admin-field__input"
              type="text"
              autoComplete="username"
              autoFocus
              required
              value={form.username}
              onChange={updateField('username')}
            />
          </label>

          <label className="admin-field">
            <span className="admin-field__label">Password</span>
            <input
              className="admin-field__input"
              type="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={updateField('password')}
            />
          </label>

          {status === 'error' && (
            <p className="admin-login__error" role="alert">
              {errorMessage}
            </p>
          )}

          <button type="submit" className="admin-login__submit" disabled={status === 'loading'}>
            {status === 'loading' ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
