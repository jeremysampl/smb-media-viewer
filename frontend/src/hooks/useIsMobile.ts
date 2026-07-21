import { useEffect, useState } from 'react';

/**
 * Touch-first UI (phone + tablet), including landscape.
 * Not based on a narrow width breakpoint alone — tablets and
 * landscape phones should keep the mobile interface.
 */
export function getIsMobileUi(): boolean {
  if (typeof window === 'undefined') return false;

  // Primary input is a finger (phones, most tablets), any orientation.
  if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
    return true;
  }

  // Narrow viewports (phones, small windows, responsive tooling).
  if (window.matchMedia('(max-width: 720px)').matches) {
    return true;
  }

  // iPadOS "Request Desktop Website" spoofs a Mac + fine pointer but
  // still exposes multi-touch.
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
