import { useState, useEffect, useRef, useId } from 'react';
import { loginUser, registerUser } from '../api/auth';
import { setSession } from '../api/client';
import AuthField from './AuthField';
import { describeAuthError } from './authErrors';
import './AuthModal.css';

const COPY = {
  signin: {
    title: 'Welcome back.',
    lede: 'Your next story is waiting.',
    submit: 'Log in',
    busy: 'Signing in\u2026',
    swapPrompt: 'New to NOBOCHITRO?',
    swapAction: 'Create your account',
  },
  register: {
    title: 'Create your account.',
    lede: 'Keep every film that stays with you in one place.',
    submit: 'Create account',
    busy: 'Creating account\u2026',
    swapPrompt: 'Already have an account?',
    swapAction: 'Log in',
  },
};

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function AuthModal({ initialMode = 'signin', onClose, onAuthenticated }) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'error' | 'registered'
  const [errorMessage, setErrorMessage] = useState('');
  // Which input(s) the failure points at: 'username' | 'email' from the
  // register endpoint, or 'credentials' when a sign-in was rejected (the
  // server deliberately doesn't say which of the two was wrong).
  const [errorField, setErrorField] = useState(null);

  const uid = useId();
  const titleId = `${uid}-title`;
  const errorId = `${uid}-error`;

  const sceneRef = useRef(null);
  const usernameRef = useRef(null);
  const passwordRef = useRef(null);
  const fieldsRef = useRef(null);

  const copy = COPY[mode];
  const isBusy = status === 'loading';

  // Move focus into the dialog on open and hand it back on close. On touch
  // devices we don't focus a text field automatically -- that would raise the
  // keyboard before the person has even seen the page.
  useEffect(() => {
    const scene = sceneRef.current;
    const opener = document.activeElement;

    // Everything the dialog sits on top of becomes inert, so neither Tab nor
    // a screen reader can reach the page underneath.
    const behind = Array.from(scene?.parentElement?.children ?? []).filter((n) => n !== scene);
    behind.forEach((n) => n.setAttribute('inert', ''));

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    (finePointer ? usernameRef.current : scene)?.focus({ preventScroll: true });

    return () => {
      behind.forEach((n) => n.removeAttribute('inert'));
      if (opener && opener.isConnected && typeof opener.focus === 'function') {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  // Escape closes; Tab stays inside the dialog so keyboard users can't wander
  // onto the landing page hidden underneath.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !sceneRef.current) return;

      const focusable = sceneRef.current.querySelectorAll('button:not([disabled]), input:not([disabled])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!sceneRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (active === first || active === sceneRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function clearFailure() {
    setErrorField(null);
    setErrorMessage('');
    setStatus((s) => (s === 'error' ? 'idle' : s));
  }

  function updateField(field) {
    return (e) => {
      const { value } = e.target;
      setForm((prev) => ({ ...prev, [field]: value }));
      // Typing in a box the server complained about clears the complaint, so
      // the warning colour doesn't linger while the person is fixing it.
      const blamed =
        errorField === field ||
        (errorField === 'credentials' && (field === 'username' || field === 'password'));
      if (blamed) clearFailure();
    };
  }

  function switchMode(nextMode) {
    if (isBusy) return;
    setMode(nextMode);
    setStatus('idle');
    setErrorMessage('');
    setErrorField(null);
    // Keep what they typed except the password -- moving between the two
    // screens shouldn't cost anyone their username.
    setForm((prev) => ({ ...prev, password: '' }));
  }

  // A short horizontal nudge on the fields. Done with the Web Animations API
  // so it can be replayed on every failed attempt without remounting inputs.
  function nudgeFields() {
    const el = fieldsRef.current;
    if (!el || !el.animate || prefersReducedMotion()) return;
    el.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-6px)' },
        { transform: 'translateX(5px)' },
        { transform: 'translateX(-3px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 380, easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)' }
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (isBusy) return; // the button stays focusable, so guard duplicates here

    setStatus('loading');
    setErrorMessage('');
    setErrorField(null);

    try {
      if (mode === 'register') {
        await registerUser(form);

        // Per the existing auth flow, registering does not sign the person
        // in. Take them to the sign-in screen with their username already
        // filled, and say what happened.
        setMode('signin');
        setStatus('registered');
        setForm((prev) => ({ username: prev.username, email: '', password: '' }));
        requestAnimationFrame(() => passwordRef.current?.focus({ preventScroll: true }));
        return;
      }

      const data = await loginUser({ username: form.username, password: form.password });

      // Same two localStorage keys as before -- setSession just wraps them.
      setSession(data);

      setStatus('idle');
      onAuthenticated(data.user);
    } catch (err) {
      const rejectedCredentials = mode === 'signin' && err.status === 401;

      setStatus('error');
      setErrorMessage(describeAuthError(err, mode));
      setErrorField(err.field || (rejectedCredentials ? 'credentials' : null));
      nudgeFields();

      if (rejectedCredentials) {
        // Keep the username, clear the password, put the cursor where the
        // next attempt starts.
        setForm((prev) => ({ ...prev, password: '' }));
        requestAnimationFrame(() => passwordRef.current?.focus({ preventScroll: true }));
      }
    }
  }

  const usernameInvalid = errorField === 'username' || errorField === 'credentials';
  const passwordInvalid = errorField === 'credentials';
  const emailInvalid = errorField === 'email';

  return (
    <div
      className="auth-scene"
      ref={sceneRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      {/* Everything atmospheric lives here and is hidden from assistive tech. */}
      <div className="auth-backdrop" aria-hidden="true">
        <div className="auth-backdrop__image" />
        <div className="auth-backdrop__light" />
        <div className="auth-backdrop__vignette" />
        <div className="auth-backdrop__grain" />
      </div>

      <div className="auth-stage">
        <button type="button" className="auth-brand" onClick={onClose} aria-label="NOBOCHITRO home">
          <img src="/images/nobochitro-logo.png" alt="" width="720" height="122" />
        </button>

        <p className="auth-stage__line">Every story leaves a mark.</p>
      </div>

      <button type="button" className="auth-close" onClick={onClose} aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M1.5 1.5l11 11M12.5 1.5l-11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      <section className="auth-panel">
        <div className="auth-panel__inner">
          {/* Remounting on mode change replays a short fade between the two screens. */}
          <div key={mode} className="auth-swap">
            <h2 className="auth-title" id={titleId}>
              {copy.title}
            </h2>
            <p className="auth-lede">{copy.lede}</p>

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-form__fields" ref={fieldsRef}>
                <AuthField
                  id={`${uid}-username`}
                  label="Username"
                  type="text"
                  inputRef={usernameRef}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={form.username}
                  onChange={updateField('username')}
                  placeholder={mode === 'signin' ? 'Your username' : 'Pick a username'}
                  invalid={usernameInvalid}
                  errorId={errorId}
                />

                {mode === 'register' && (
                  <AuthField
                    id={`${uid}-email`}
                    label="Email"
                    type="email"
                    autoComplete="email"
                    required
                    value={form.email}
                    onChange={updateField('email')}
                    placeholder="you@example.com"
                    invalid={emailInvalid}
                    errorId={errorId}
                  />
                )}

                <AuthField
                  id={`${uid}-password`}
                  label="Password"
                  type="password"
                  inputRef={passwordRef}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  required
                  minLength={mode === 'register' ? 8 : undefined}
                  value={form.password}
                  onChange={updateField('password')}
                  placeholder={mode === 'signin' ? 'Your password' : 'At least 8 characters'}
                  hint={mode === 'register' ? 'Use at least 8 characters.' : undefined}
                  invalid={passwordInvalid}
                  errorId={errorId}
                />
              </div>

              {/* Both live regions are always mounted and share one grid cell,
                  so a message appearing never moves anything below it. */}
              <div className="auth-messages">
                <div className="auth-messages__slot" role="alert" id={errorId}>
                  {status === 'error' && (
                    <p className="auth-notice auth-notice--error">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M8 4.6v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        <circle cx="8" cy="11.1" r="0.85" fill="currentColor" />
                      </svg>
                      <span>{errorMessage}</span>
                    </p>
                  )}
                </div>
                <div className="auth-messages__slot" role="status">
                  {status === 'registered' && mode === 'signin' && (
                    <p className="auth-notice auth-notice--success">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M5.2 8.2l2 2 3.6-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>Account created. Log in to continue.</span>
                    </p>
                  )}
                </div>
              </div>

              <button type="submit" className="auth-submit" aria-disabled={isBusy} data-busy={isBusy || undefined}>
                {isBusy && <span className="auth-submit__spinner" aria-hidden="true" />}
                <span>{isBusy ? copy.busy : copy.submit}</span>
              </button>
            </form>
          </div>

          <div className="auth-switch">
            <span>{copy.swapPrompt}</span>
            <button type="button" className="auth-switch__action" onClick={() => switchMode(mode === 'signin' ? 'register' : 'signin')}>
              {copy.swapAction}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
