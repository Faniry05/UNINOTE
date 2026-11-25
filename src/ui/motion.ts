import { prefersReducedMotion } from './scene';

/**
 * Entrance timeline (Web Animations API). Elements opt in with
 * data-enter="drop" | "fade" | "blur" | "right" | "rise", and an optional
 * data-delay (ms). Called once when a page mounts.
 */
export function playEntrance(root: HTMLElement | null, baseDelay = 0): void {
  if (!root || prefersReducedMotion() || typeof root.animate !== 'function') return;
  const nodes = root.querySelectorAll<HTMLElement>('[data-enter]');
  const frames: Record<string, Keyframe[]> = {
    drop: [{ opacity: 0, transform: 'translateY(-14px)' }, { opacity: 1, transform: 'none' }],
    fade: [{ opacity: 0 }, { opacity: 1 }],
    blur: [
      { opacity: 0, transform: 'translateY(14px)', filter: 'blur(10px)' },
      { opacity: 1, transform: 'none', filter: 'blur(0)' },
    ],
    right: [{ opacity: 0, transform: 'translateX(40px)' }, { opacity: 1, transform: 'none' }],
    rise: [{ opacity: 0, transform: 'translateY(28px)' }, { opacity: 1, transform: 'none' }],
  };
  nodes.forEach((el, i) => {
    const kind = el.dataset.enter ?? 'rise';
    const delay = baseDelay + (el.dataset.delay ? Number(el.dataset.delay) : i * 90);
    el.animate(frames[kind] ?? frames.rise, {
      duration: kind === 'blur' ? 900 : 650,
      delay,
      easing: 'cubic-bezier(.2,.8,.2,1)',
      fill: 'backwards',
    });
  });
}

/** Counts a number up from 0 (used for the big values). */
export function countUp(from: number, to: number, durationMs: number, onFrame: (v: number) => void): () => void {
  if (prefersReducedMotion() || from === to) {
    onFrame(to);
    return () => undefined;
  }
  let raf = 0;
  const start = performance.now();
  const step = (t: number) => {
    const p = Math.min(1, (t - start) / durationMs);
    const eased = 1 - Math.pow(1 - p, 3);
    onFrame(Math.round(from + (to - from) * eased));
    if (p < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
