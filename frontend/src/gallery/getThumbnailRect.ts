export function getThumbnailRect(mediaPath: string): DOMRect | null {
  const card = document.querySelector(`[data-media-path="${CSS.escape(mediaPath)}"]`);
  const thumb = card?.querySelector('.thumb-wrap');
  return thumb?.getBoundingClientRect() ?? null;
}

export interface FlyoutRect {
  left: number;
  top: number;
  width: number;
  height: number;
  borderRadius: number;
}

export function rectFromDomRect(rect: DOMRect, borderRadius = 0): FlyoutRect {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    borderRadius,
  };
}
