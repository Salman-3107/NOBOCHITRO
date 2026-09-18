import { useEffect, useState } from 'react';
import { useDebounced } from '../hooks/useAdminResource';

// A type-to-search picker for a movie or a person.
//
// A plain <select> would have to hold the entire catalogue -- thousands of
// <option> elements rendered on every open, and unusable on a phone. This
// queries the same paginated endpoints the list screens use and shows the top
// few matches, so the DOM stays small no matter how big the catalogue gets.
export default function EntityPicker({
  label, required, placeholder, value, onChange, search, renderLabel, renderHint,
}) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const debounced = useDebounced(term, 280);

  useEffect(() => {
    if (debounced.trim().length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setBusy(true);
    search(debounced.trim())
      .then((data) => { if (!cancelled) setResults(data.items.slice(0, 6)); })
      .catch(() => { if (!cancelled) setResults([]); })
      .finally(() => { if (!cancelled) setBusy(false); });

    return () => { cancelled = true; };
  }, [debounced, search]);

  // Once something is chosen the input is replaced by the selection, so it is
  // always obvious what is currently picked -- a search box still showing a
  // half-typed query is the usual way these go wrong.
  if (value) {
    return (
      <div className="adm-field">
        <span>{label} {required && <span className="adm-req">*</span>}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="adm-badge adm-badge--accent">{renderLabel(value)}</span>
          <button
            type="button" className="adm-btn adm-btn--sm adm-btn--ghost"
            onClick={() => { onChange(null); setTerm(''); setResults([]); }}
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="adm-field" style={{ position: 'relative' }}>
      <span>{label} {required && <span className="adm-req">*</span>}</span>
      <input
        className="adm-input"
        value={term}
        placeholder={placeholder}
        onChange={(event) => { setTerm(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />

      {open && term.trim().length >= 2 && (
        <div className="adm-search__panel" style={{ top: '100%' }}>
          {busy && results.length === 0 && <p className="adm-search__group-label">Searching…</p>}
          {!busy && results.length === 0 && <p className="adm-search__group-label">No matches</p>}
          {results.map((item, index) => (
            <button
              key={index}
              type="button"
              className="adm-search__hit"
              onClick={() => { onChange(item); setOpen(false); }}
            >
              {renderLabel(item)}
              {renderHint && <small>{renderHint(item)}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
