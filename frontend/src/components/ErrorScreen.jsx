import './ErrorScreen.css';

// Full-screen error states. `variant` picks the copy; anything unrecognised
// falls back to the generic 500 wording.
//
// Deliberately in-universe rather than technical -- a stack trace helps
// nobody using the app, and the console still has the real error.
const VARIANTS = {
  404: {
    code: '404',
    title: 'Looks like this scene was deleted.',
    message: "We couldn't find the page you were after. It may have been moved, or the link may be out of date.",
  },
  403: {
    code: '403',
    title: 'This reel is restricted.',
    message: "You're signed in, but this area belongs to a different role. If you think that's wrong, check which account you're using.",
  },
  500: {
    code: '500',
    title: 'Something went wrong behind the scenes.',
    message: 'The server ran into a problem handling that request. Try again in a moment.',
  },
  offline: {
    code: '⚡',
    title: "Can't reach the projector.",
    message: 'The backend is not responding. Make sure it is running on port 5000, then try again.',
  },
};

export default function ErrorScreen({ variant = 500, detail, actionLabel = 'Return home', onAction }) {
  const copy = VARIANTS[variant] || VARIANTS[500];

  return (
    <div className="error-screen">
      <span className="error-screen__code" aria-hidden="true">{copy.code}</span>
      <span className="error-screen__reel" aria-hidden="true">🎬</span>
      <h1 className="error-screen__title">{copy.title}</h1>
      <p className="error-screen__message">{copy.message}</p>
      {detail && <p className="error-screen__detail">{detail}</p>}
      {onAction && (
        <button type="button" className="error-screen__action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
