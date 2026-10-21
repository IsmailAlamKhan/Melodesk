import { cn } from '@melodesk/ui';
import { Link, useNavigate } from 'react-router';
import { useTrackArtists } from '../../player/nextInfo';

/**
 * The current track's artists as links to their pages. Until YouTube has said which artists they
 * are (or when it does not link them), the byline searches for the name instead.
 */
export function ArtistLinks({
  byline,
  className,
  onNavigate,
}: {
  /** The artist text the player reports, used while the links are not known. */
  byline: string;
  className?: string;
  /** Called when a link is followed (for example to close a full-screen view). */
  onNavigate?: () => void;
}) {
  const artists = useTrackArtists();
  const navigate = useNavigate();
  const link = cn('hover:text-fg hover:underline', className);
  if (artists.length === 0)
    return (
      <button
        type="button"
        className={link}
        onClick={() => {
          onNavigate?.();
          void navigate(`/search?q=${encodeURIComponent(byline.split(' • ')[0] ?? '')}`);
        }}
      >
        {byline}
      </button>
    );
  return (
    <span className={cn('truncate', className)}>
      {artists.map((a, i) => (
        <span key={`${a.name}-${String(i)}`}>
          <Link to={a.route} className="hover:text-fg hover:underline" onClick={onNavigate}>
            {a.name}
          </Link>
          {i < artists.length - 1 && ', '}
        </span>
      ))}
    </span>
  );
}
