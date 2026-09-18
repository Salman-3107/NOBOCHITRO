import { useCallback, useEffect, useRef, useState } from 'react';

// Every list screen in the dashboard does the same five things: hold a set of
// query params, refetch when they change, show a skeleton on first load,
// surface the server's own error message, and reset to page 1 whenever a
// filter changes. Written once here rather than eleven times.
//
// `fetcher` is an api/admin.js function taking the params object.
export function useAdminResource(fetcher, initialParams = {}) {
  const [params, setParams] = useState(initialParams);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | refreshing | ready | error
  const [errorMessage, setErrorMessage] = useState('');

  // fetcher is usually an inline arrow, so it changes identity on every
  // render. Holding it in a ref keeps `load` stable and stops the effect
  // below from firing in an endless loop.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Guards against a slow first request landing after a fast second one and
  // overwriting newer results with stale ones -- easy to trigger by typing
  // quickly in a search box.
  const requestId = useRef(0);

  const load = useCallback(async (nextParams, { quiet = false } = {}) => {
    const id = ++requestId.current;
    setStatus((current) => (quiet || current === 'ready' ? 'refreshing' : 'loading'));
    setErrorMessage('');

    try {
      const result = await fetcherRef.current(nextParams);
      if (id !== requestId.current) return;   // a newer request already won
      setData(result);
      setStatus('ready');
    } catch (err) {
      if (id !== requestId.current) return;
      setErrorMessage(err.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(params); }, [params, load]);

  // Changing a filter resets to page 1: staying on page 7 of a result set
  // that now has two pages shows an empty table and looks like a bug.
  const setFilter = useCallback((patch) => {
    setParams((current) => ({ ...current, ...patch, page: 1 }));
  }, []);

  const setPage = useCallback((page) => {
    setParams((current) => ({ ...current, page }));
  }, []);

  const setSort = useCallback((sort, order) => {
    setParams((current) => ({ ...current, sort, order, page: 1 }));
  }, []);

  // Used after a delete or an edit. Quiet, so the table doesn't flash back to
  // a skeleton for a row that just changed.
  const refresh = useCallback(() => load(params, { quiet: true }), [load, params]);

  return {
    params, data, status, errorMessage,
    isLoading: status === 'loading',
    isRefreshing: status === 'refreshing',
    setFilter, setPage, setSort, refresh,
  };
}

// Debounces a value so a search box fires one request when typing stops
// rather than one per keystroke.
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
