// Turns whatever the API layer threw into a sentence a person can act on.
// The API contract is untouched -- this only changes how a failure is worded
// on screen. `err` is an ApiError from api/client.js: { message, status, field }.

const GENERIC = 'Something went wrong. Please try again.';

// Register-endpoint messages arrive lowercase and sometimes with " -- ".
// They are already specific ("username is already taken"), so keep the
// meaning and only tidy the surface.
function tidy(text) {
  const t = String(text || '').trim().replace(/\s--\s/g, ' \u2014 ');
  if (!t) return GENERIC;
  const sentence = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

export function describeAuthError(err, mode) {
  const status = err?.status;

  // apiRequest reports "no response at all" as status 0.
  if (status === 0) {
    return "We can't reach NOBOCHITRO right now. Check your connection and try again.";
  }
  if (mode === 'signin' && status === 401) {
    return "That username or password doesn't look right.";
  }
  if (status === 429) {
    return 'Too many attempts. Wait a minute, then try again.';
  }
  if (typeof status === 'number' && status >= 500) {
    return 'Something went wrong on our side. Please try again in a moment.';
  }
  return tidy(err?.message);
}
