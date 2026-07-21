export function getThumbnailRect(mediaPath: string): DOMRect | null {
  const card = document.querySelector(`[data-media-path="${CSS.escape(mediaPath)}"]`);
  const thumb = card?.querySelector('.thumb-wrap');
  return thumb?.getBoundingClientRect() ?? null;
}

/** Natural size of the grid thumbnail image, if loaded. */
export function getThumbnailNaturalSize(
  mediaPath: string,
): { width: number; height: number } | null {
  const card = document.querySelector(`[data-media-path="${CSS.escape(mediaPath)}"]`);
  const img = card?.querySelector('.thumb-wrap img') as HTMLImageElement | null;
  if (!img?.naturalWidth || !img.naturalHeight) return null;
  return { width: img.naturalWidth, height: img.naturalHeight };
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

/** Layout box of the media as drawn with object-fit: contain (center). */
export function objectFitContainRect(
  box: DOMRect,
  naturalWidth: number,
  naturalHeight: number,
): DOMRect {
  if (!naturalWidth || !naturalHeight || box.width <= 0 || box.height <= 0) {
    return box;
  }
  const scale = Math.min(box.width / naturalWidth, box.height / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return new DOMRect(
    box.left + (box.width - width) / 2,
    box.top + (box.height - height) / 2,
    width,
    height,
  );
}

export function mediaContentRect(
  el: HTMLImageElement | HTMLVideoElement,
): DOMRect {
  const box = el.getBoundingClientRect();
  const naturalWidth =
    el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
  const naturalHeight =
    el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
  return objectFitContainRect(box, naturalWidth, naturalHeight);
}
