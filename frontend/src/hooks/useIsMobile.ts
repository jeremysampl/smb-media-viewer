import { useEffect, useState } from 'react';

/** Phone/tablet UI, including landscape. Not just a narrow-width check. */
export function getIsMobileUi(): boolean {
  if (typeof window === 'undefined') return false;

  // Coarse pointer / no hover (phones, most tablets).
  if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
    return true;
  }

  // Narrow viewports.
  if (window.matchMedia('(max-width: 720px)').matches) {
    return true;
  }

  // iPadOS desktop-site mode still reports multi-touch.
  if (
    navigator.maxTouchPoints > 1 &&
    /iPad|Macintosh/.test(navigator.userAgent)
  ) {
    return true;
  }

  return false;
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(getIsMobileUi);

  useEffect(() => {
    const queries = [
      window.matchMedia('(hover: none) and (pointer: coarse)'),
      window.matchMedia('(max-width: 720px)'),
    ];
    const update = () => setIsMobile(getIsMobileUi());

    for (const query of queries) {
      query.addEventListener('change', update);
    }
    window.addEventListener('orientationchange', update);
    window.addEventListener('resize', update);

    update();

    return () => {
      for (const query of queries) {
        query.removeEventListener('change', update);
      }
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return isMobile;
}
