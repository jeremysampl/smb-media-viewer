/**
 * Chromium rasterizes large/HDR images as a grid of GPU tiles. CSS zoom then
 * reveals seam lines between those tiles (https://issues.chromium.org/issues/40084005).
 *
 * Immich workaround (immich-app/immich#27715): pre-scale a `will-change: transform`
 * layer toward native resolution (GPU budget capped), then counter-scale so the
 * frozen texture stays sharp under CSS zoom.
 *
 * Mobile: modest budget + only while zoomed (avoids black tile dropouts).
 * Desktop: Immich-like budget at rest (seams show even at 1× in YARL).
 *
 * Firefox/Safari skip this path.
 */

let cachedMaxRasterPixels: { mobile: number; desktop: number } | undefined;

export type ChromeRasterVariant = 'mobile' | 'desktop';

export function isChromiumBrowser(): boolean {
  return typeof globalThis !== 'undefined' && 'chrome' in globalThis;
}

function detectMaxRasterPixels(): { mobile: number; desktop: number } {
  if (!isChromiumBrowser()) {
    return { mobile: 0, desktop: 0 };
  }

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    const maxTextureSize = gl?.getParameter(gl.MAX_TEXTURE_SIZE) ?? 0;
    if (maxTextureSize >= 16_384) {
      return { mobile: 8_000_000, desktop: 16_000_000 };
    }
    if (maxTextureSize >= 8192) {
      return { mobile: 5_000_000, desktop: 10_000_000 };
    }
    return { mobile: 3_000_000, desktop: 4_000_000 };
  } catch {
    return { mobile: 3_000_000, desktop: 4_000_000 };
  }
}

export function getMaxRasterPixels(variant: ChromeRasterVariant = 'mobile'): number {
  if (!cachedMaxRasterPixels) {
    cachedMaxRasterPixels = detectMaxRasterPixels();
  }
  return cachedMaxRasterPixels[variant];
}

export function shouldUseChromeImageRaster(): boolean {
  return getMaxRasterPixels('desktop') > 0 || getMaxRasterPixels('mobile') > 0;
}

/** Mobile: don’t promote a huge GPU layer until the user pinches. */
export function shouldRasterizeForZoom(zoom: number): boolean {
  return shouldUseChromeImageRaster() && Number.isFinite(zoom) && zoom > 1.05;
}

function snapEven(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function snapDevicePx(value: number, dpr: number): number {
  return Math.round(value * dpr) / dpr;
}

export interface ChromeRasterLayout {
  displayWidth: number;
  displayHeight: number;
  rasterWidth: number;
  rasterHeight: number;
  rasterScale: number;
  offsetX: number;
  offsetY: number;
}

export interface ComputeChromeRasterOptions {
  variant?: ChromeRasterVariant;
  /** When true, offsets are 0 (shell is already the display box — YARL flex-centers it). */
  shellIsDisplayBox?: boolean;
  /** Place the contain-fit box only — skip native pre-scale (stable mobile geometry at rest). */
  forceDisplayOnly?: boolean;
}

/** Contain-fit display size, then Immich-style pre-scale within GPU budget. */
export function computeChromeRasterLayout(
  naturalWidth: number,
  naturalHeight: number,
  containerWidth: number,
  containerHeight: number,
  options: ComputeChromeRasterOptions = {},
): ChromeRasterLayout | null {
  if (
    naturalWidth <= 0 ||
    naturalHeight <= 0 ||
    containerWidth <= 0 ||
    containerHeight <= 0
  ) {
    return null;
  }

  const variant = options.variant ?? 'mobile';
  const maxRasterPixels = getMaxRasterPixels(variant);
  const dpr =
    typeof window !== 'undefined' && window.devicePixelRatio > 0
      ? window.devicePixelRatio
      : 1;

  const fit = Math.min(containerWidth / naturalWidth, containerHeight / naturalHeight);
  const displayWidth = naturalWidth * fit;
  const displayHeight = naturalHeight * fit;
  const offsetX = options.shellIsDisplayBox ? 0 : (containerWidth - displayWidth) / 2;
  const offsetY = options.shellIsDisplayBox ? 0 : (containerHeight - displayHeight) / 2;

  if (options.forceDisplayOnly || maxRasterPixels <= 0) {
    return {
      displayWidth,
      displayHeight,
      rasterWidth: displayWidth,
      rasterHeight: displayHeight,
      rasterScale: 1,
      offsetX: snapDevicePx(offsetX, dpr),
      offsetY: snapDevicePx(offsetY, dpr),
    };
  }

  const nativeRatio = naturalWidth / Math.max(displayWidth, 1);
  const budgetRatio = Math.sqrt(maxRasterPixels / Math.max(displayWidth * displayHeight, 1));
  // Desktop: push toward native (Immich). Mobile: keep a modest cap to avoid tile dropouts.
  const ratioCap = variant === 'desktop' ? Number.POSITIVE_INFINITY : Math.max(2.5, dpr * 1.25);
  const rasterRatio = Math.max(1, Math.min(nativeRatio, budgetRatio, ratioCap));

  let rasterWidth = displayWidth * rasterRatio;
  let rasterHeight = displayHeight * rasterRatio;

  const area = rasterWidth * rasterHeight;
  if (area > maxRasterPixels) {
    const shrink = Math.sqrt(maxRasterPixels / area);
    rasterWidth *= shrink;
    rasterHeight *= shrink;
  }

  rasterWidth = snapEven(rasterWidth);
  rasterHeight = snapEven(rasterHeight);

  return {
    displayWidth,
    displayHeight,
    rasterWidth,
    rasterHeight,
    rasterScale: displayWidth / rasterWidth,
    offsetX: snapDevicePx(offsetX, dpr),
    offsetY: snapDevicePx(offsetY, dpr),
  };
}
