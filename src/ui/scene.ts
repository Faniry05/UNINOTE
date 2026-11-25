/** Scene media (from the design brief). The video is the plate's drone loop. */
const CDN = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P';
export const SCENE_PLATE_URL = `${CDN}/4e84f7cd-8250-48e6-8dfa-746b13b73bfb.jpg`;
export const SCENE_VIDEO_URL = `${CDN}/48d4c209-86b6-4b1c-b972-4f57e3dafe89.mp4`;
export const SCENE_PHOTO_URL = `${CDN}/8097efdf-745f-4a23-8b33-0bed6ee16bc7.jpg`;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}
