import { useEffect, useRef, useState } from 'react';
import { SCENE_PLATE_URL, SCENE_VIDEO_URL, prefersReducedMotion } from './scene';

/**
 * Full-bleed 16:10 photo plate (golden larch valley) with the muted drone
 * loop laid over it. The 16:9 video was rendered from the plate mirror-padded
 * 96/1728 on each side, so it is laid at 111.11% width, left −5.556%.
 * Nothing in the scene is drawn or animated in code.
 */
export function SceneBackdrop() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [reduced] = useState(prefersReducedMotion);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => undefined);
  }, []);

  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden" style={{ background: SCENE_FALLBACK }}>
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: 'max(100vw, 160vh)',
          height: 'max(62.5vw, 100vh)',
          transform: 'translate(-50%, -50%)',
        }}
      >
        <img src={SCENE_PLATE_URL} alt="" className="absolute inset-0 h-full w-full" style={{ objectFit: 'fill' }} />
        {!reduced && (
          <video
            ref={videoRef}
            src={SCENE_VIDEO_URL}
            muted
            loop
            playsInline
            autoPlay
            preload="auto"
            onLoadedData={() => setVideoReady(true)}
            className="absolute top-0 h-full"
            style={{
              width: '111.11%',
              left: '-5.556%',
              objectFit: 'fill',
              opacity: videoReady ? 1 : 0,
              transition: 'opacity .8s ease',
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Same palette as the plate (sky, peaks, turquoise lake, golden larches) if media can't load. */
const SCENE_FALLBACK =
  'linear-gradient(180deg, #7fb2dc 0%, #b9d4e6 22%, #e9eef0 30%, #6fb7b4 42%, #c99a3a 58%, #a8722a 78%, #5f4a26 100%)';
