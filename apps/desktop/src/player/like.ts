import { run } from '../data/innertube';
import { queryClient } from '../data/queryClient';
import { t } from '../i18n';
import { toast } from '../app/toast';
import { isLocalId } from './sourceIds';
import { usePlayerStore } from './store';

export type LikeStatus = 'LIKE' | 'DISLIKE' | 'INDIFFERENT';

/** Like, dislike or clear the rating of the current track (signed in), with the confirmation toast. */
export async function setLikeStatus(status: LikeStatus): Promise<void> {
  const { track, loggedIn } = usePlayerStore.getState();
  if (!track?.videoId || isLocalId(track.videoId)) return;
  if (!loggedIn) {
    toast(t('player.signInToLike'));
    return;
  }
  const endpoint =
    status === 'LIKE' ? 'like/like' : status === 'DISLIKE' ? 'like/dislike' : 'like/removelike';
  await run({ endpoint, body: { target: { videoId: track.videoId } } });
  usePlayerStore.setState((s) => (s.flags ? { flags: { ...s.flags, likeStatus: status } } : {}));
  void queryClient.invalidateQueries({ queryKey: ['browse'] });
  toast(
    status === 'LIKE'
      ? t('player.savedToLiked')
      : status === 'DISLIKE'
        ? t('player.disliked')
        : t('player.removedFromLiked'),
  );
}
