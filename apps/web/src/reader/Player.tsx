import { useState } from 'react';

// The server checks this too; the player's address is built from it, so it is checked here.
const ID = /^[A-Za-z0-9_-]{4,32}$/;

/**
 * A video, played where it is in YouTube's own player. Until the owner chooses to play it only
 * its still is shown, and that is fetched through Munim: nothing reaches YouTube before then.
 * `start` says they have already chosen (they opened it to watch it). Nothing of the video is
 * ever downloaded or kept.
 */
export function Player({
  src,
  alt,
  video,
  start = false,
}: {
  src: string;
  alt: string;
  video: string;
  start?: boolean;
}) {
  const [playing, setPlaying] = useState(start);
  const [still, setStill] = useState(true);

  if (playing && ID.test(video)) {
    return (
      <iframe
        title={alt || 'Video'}
        // Without cookies until it is played, and without "more videos" from other channels.
        src={`https://www.youtube-nocookie.com/embed/${video}?autoplay=1&rel=0`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        // YouTube will not play for a page that says nothing of where the player is embedded.
        referrerPolicy="strict-origin-when-cross-origin"
        className="aspect-video w-full rounded-6 border border-line"
      />
    );
  }
  return (
    <button
      type="button"
      aria-label={`Play: ${alt}`}
      onClick={() => {
        setPlaying(true);
      }}
      className="relative block aspect-video w-full cursor-pointer overflow-hidden rounded-6 border border-line bg-card hover:border-accent"
    >
      {still && (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => {
            setStill(false);
          }}
          // YouTube's stills are 4:3 with black bars; filling the frame crops them away.
          className="size-full object-cover"
        />
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="rounded-pill bg-scrim px-14 py-6 font-medium text-ink">▶ Play</span>
      </span>
    </button>
  );
}
