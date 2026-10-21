import { cn } from '@melodesk/ui';
import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useSuggestions } from '../data/hooks';
import { useT } from '../i18n';
import { playItem, routeForEndpoint } from '../player/actions';
import { Artwork } from './components/Artwork';
import { KIND_KEY } from './components/kinds';

/** Search field with live suggestions (queries and entities) from the account's own suggestions. */
export function SearchBox() {
  const t = useT();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const query = sp.get('q') ?? '';
  const [value, setValue] = useState(query);
  // Follow the URL: landing on a search from elsewhere (karaoke, the palette) fills the box.
  const [seenQuery, setSeenQuery] = useState(query);
  if (query !== seenQuery) {
    setSeenQuery(query);
    setValue(query);
  }
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [debounced, setDebounced] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const suggestions = useSuggestions(debounced);
  const list = open && debounced ? (suggestions.data ?? []) : [];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(value.trim());
    }, 150);
    return () => {
      window.clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const submit = (q: string): void => {
    setOpen(false);
    if (q.trim()) void navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };
  const choose = (i: number): void => {
    const s = list[i];
    if (!s) {
      submit(value);
      return;
    }
    if (s.item) {
      const route = routeForEndpoint(s.item.endpoint);
      setOpen(false);
      if (route) void navigate(route);
      else void playItem(s.item);
      return;
    }
    setValue(s.text);
    submit(s.text);
  };

  return (
    <div className="relative w-full max-w-xl">
      <div className="flex h-9 items-center gap-2 rounded-full border border-border bg-bg-overlay px-3 focus-within:border-fg-subtle">
        <Search className="size-4 shrink-0 text-fg-subtle" />
        <input
          dir="auto"
          ref={input}
          role="combobox"
          aria-expanded={list.length > 0}
          aria-controls="search-suggestions"
          aria-autocomplete="list"
          value={value}
          placeholder={t('search.placeholder')}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') choose(active);
            else if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, list.length - 1));
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, -1));
            else if (e.key === 'Escape') setOpen(false);
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
        />
        {value && (
          <button
            type="button"
            aria-label={t('common.clear')}
            onClick={() => setValue('')}
            className="text-fg-subtle hover:text-fg"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {list.length > 0 && (
        <ul
          id="search-suggestions"
          role="listbox"
          className="absolute top-11 right-0 left-0 z-30 overflow-hidden rounded-lg border border-border bg-bg-elevated py-1 shadow-xl"
        >
          {list.map((s, i) => (
            <li
              key={`${s.type}-${s.text}-${String(i)}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(i);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex cursor-default items-center gap-3 px-3 py-2 text-sm',
                i === active && 'bg-bg-overlay',
              )}
            >
              {s.item ? (
                <>
                  <Artwork
                    thumbnails={s.item.thumbnails}
                    size={32}
                    round={s.item.kind === 'artist'}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {s.item.title}
                    <span className="ms-2 text-xs text-fg-subtle">{t(KIND_KEY[s.item.kind])}</span>
                  </span>
                </>
              ) : (
                <>
                  <Search className="size-4 shrink-0 text-fg-subtle" />
                  <span className="truncate">
                    <strong>{s.boldPrefix}</strong>
                    {s.text.slice(s.boldPrefix.length)}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
