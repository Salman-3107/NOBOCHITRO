import { useState } from 'react';

// One labelled input. Password fields get a Show/Hide control; its visible
// text and its accessible name are the same words, so what a screen reader
// announces matches what is on screen.
export default function AuthField({
  id,
  label,
  type = 'text',
  invalid = false,
  hint,
  errorId,
  inputRef,
  ...inputProps
}) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [hintId, invalid ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="auth-field">
      <label className="auth-field__label" htmlFor={id}>
        {label}
      </label>

      <div className="auth-field__control">
        <input
          {...inputProps}
          id={id}
          ref={inputRef}
          className={`auth-field__input${isPassword ? ' auth-field__input--with-toggle' : ''}`}
          type={isPassword && revealed ? 'text' : type}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />

        {isPassword && (
          <button
            type="button"
            className="auth-field__toggle"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
        )}
      </div>

      {hint && (
        <p id={hintId} className="auth-field__hint">
          {hint}
        </p>
      )}
    </div>
  );
}
