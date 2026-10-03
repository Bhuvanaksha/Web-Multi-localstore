import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync with the current ?q= param
  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null && q !== query) setQuery(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  // Debounced navigation (300ms) as the user types.
  const onChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const q = value.trim();
      if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
    }, 300);
  };

  return (
    <form onSubmit={submit} style={{ flex: 1, maxWidth: 420 }}>
      <div className="input-wrap">
        <span className="input-icon">🔍</span>
        <input
          className="with-icon"
          type="search"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search resources…"
          aria-label="Search"
        />
      </div>
    </form>
  );
}
