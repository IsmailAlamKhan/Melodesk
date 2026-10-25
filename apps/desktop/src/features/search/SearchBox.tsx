import { Tooltip, cn } from '@melodesk/ui';
import { Clock, Search, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useSuggestions } from '../../data/hooks';
import { useT } from '../../i18n/index';
import { playItem, routeForEndpoint } from '../../player/actions';
import { Artwork } from '../../app/components/Artwork';
import { KIND_KEY } from '../../app/components/kinds';
import { loadRecent, pushRecent, saveRecent } from './recent';

/** Marks the "clear recent searches" row in the dropdown's list. */
const CLEAR = '\u0000clear';

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
  const closeTimer = useRef(0);
  const suggestions = useSuggestions(debounced);
  const qc = useQueryClient();
  const recent = useQuery({
    queryKey: ['recent-searches'],
    queryFn: loadRecent,
    staleTime: Infinity,
  });
  const remember = (next: string[]): void => {
    qc.setQueryData(['recent-searches'], next);
    void saveRecent(next).catch(() => undefined);
  };
  // With nothing typed yet, the box offers what you searched for before (kept on this computer).
  const showRecent = open && !value.trim() && (recent.data?.length ?? 0) > 0;
  const list = open && debounced ? (suggestions.data ?? []) : [];
  // The rows of the dropdown, one list for the keyboard: recent searches then a way to clear them.
  const recentRows = showRecent ? [...(recent.data ?? []), CLEAR] : [];

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
    if (q.trim()) {
      remember(pushRecent(recent.data ?? [], q));
      void navigate(`/search?q=${encodeURIComponent(q.trim())}`);
    }
  };
  const choose = (i: number): void => {
    if (showRecent) {
      const pick = recentRows[i];
      if (pick === CLEAR) {
        remember([]);
        setOpen(false);
      } else if (pick) {
        setValue(pick);
        submit(pick);
      }
      return;
    }
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
    <div className="relative w-full min-w-0 max-w-xl">
      <div className="flex h-10 items-center gap-2.5 rounded-full border border-transparent bg-bg-overlay px-3 md:px-4 transition-colors focus-within:border-accent focus-within:bg-bg-elevated focus-within:ring-4 focus-within:ring-accent-soft">
        <Search className="size-4 shrink-0 text-fg-subtle" />
        <input
          dir="auto"
          ref={input}
          role="combobox"
          aria-expanded={list.length > 0 || showRecent}
          aria-controls="search-suggestions"
          aria-autocomplete="list"
          value={value}
          placeholder={t('search.placeholder')}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => {
            window.clearTimeout(closeTimer.current);
            setOpen(true);
          }}
          // A moment's grace so a click on a row lands before the list goes. Only if focus did not
          // come back in that time: closing a list the box has focus on would take it from under
          // a user who clicked away and straight back.
          onBlur={() => {
            window.clearTimeout(closeTimer.current);
            closeTimer.current = window.setTimeout(() => {
              if (document.activeElement !== input.current) setOpen(false);
            }, 120);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') choose(active);
            else if (e.key === 'ArrowDown')
              setActive((a) => Math.min(a + 1, (showRecent ? recentRows.length : list.length) - 1));
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, -1));
            else if (e.key === 'Escape') setOpen(false);
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
        />
        {value && (
          <Tooltip label={t('common.clear')}>
            <button
              type="button"
              aria-label={t('common.clear')}
              onClick={() => setValue('')}
              className="text-fg-subtle hover:text-fg"
            >
              <X className="size-4" />
            </button>
          </Tooltip>
        )}
      </div>
      {showRecent && (
        <ul
          id="search-suggestions"
          role="listbox"
          aria-label={t('search.recent')}
          className="absolute top-11 right-0 left-0 z-30 overflow-hidden rounded-lg border border-border bg-bg-elevated py-1 shadow-xl"
        >
          {recentRows.map((r, i) => (
            <li
              key={r}
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
                r === CLEAR && 'text-fg-muted',
              )}
            >
              {r === CLEAR ? (
                <span className="truncate text-xs">{t('search.clearRecent')}</span>
              ) : (
                <>
                  <Clock className="size-4 shrink-0 text-fg-subtle" />
                  <span className="truncate">{r}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
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
