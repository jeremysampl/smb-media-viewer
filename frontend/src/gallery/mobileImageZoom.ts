export const MIN_IMAGE_ZOOM = 1;
export const MAX_IMAGE_ZOOM = 20;
export const ZOOM_SNAP_THRESHOLD = 1.02;
/** Allow zooming past 1:1 native pixels so detail stays inspectable on small screens. */
export const MAX_ZOOM_PIXEL_RATIO = 4;

export interface ImageZoomState {
  scale: number;
  panX: number;
  panY: number;
}

export interface PinchState {
  startDistance: number;
  startScale: number;
  startPanX: number;
  startPanY: number;
  startCenterX: number;
  startCenterY: number;
}

export interface ImageLayoutBounds {
  maxPanX: number;
  maxPanY: number;
}

export interface ImageLayoutMetrics {
  baseWidth: number;
  baseHeight: number;
  bounds: ImageLayoutBounds;
  maxZoom: number;
}

export const DEFAULT_IMAGE_ZOOM: ImageZoomState = {
  scale: 1,
  panX: 0,
  panY: 0,
};

export function touchDistance(
  t1: { clientX: number; clientY: number },
  t2: { clientX: number; clientY: number },
) {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
}

export function touchCenter(
  t1: { clientX: number; clientY: number },
  t2: { clientX: number; clientY: number },
) {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  };
}

export function getImageLayoutMetrics(
  naturalWidth: number,
  naturalHeight: number,
  stageWidth: number,
  stageHeight: number,
  scale: number,
): ImageLayoutMetrics {
  if (naturalWidth <= 0 || naturalHeight <= 0 || stageWidth <= 0 || stageHeight <= 0) {
    return {
      baseWidth: stageWidth,
      baseHeight: stageHeight,
      bounds: { maxPanX: 0, maxPanY: 0 },
      maxZoom: MAX_IMAGE_ZOOM,
    };
  }

  const fitScale = Math.min(stageWidth / naturalWidth, stageHeight / naturalHeight);
  const baseWidth = naturalWidth * fitScale;
  const baseHeight = naturalHeight * fitScale;
  const pixelRatioMax =
    Math.max(naturalWidth / baseWidth, naturalHeight / baseHeight) * MAX_ZOOM_PIXEL_RATIO;

  return {
    baseWidth,
    baseHeight,
    bounds: {
      maxPanX: Math.max(0, (baseWidth * scale - stageWidth) / 2),
      maxPanY: Math.max(0, (baseHeight * scale - stageHeight) / 2),
    },
    maxZoom: Math.min(MAX_IMAGE_ZOOM, Math.max(MIN_IMAGE_ZOOM, pixelRatioMax)),
  };
}

export function getImageLayoutBounds(
  naturalWidth: number,
  naturalHeight: number,
  stageWidth: number,
  stageHeight: number,
  scale: number,
): ImageLayoutBounds {
  return getImageLayoutMetrics(naturalWidth, naturalHeight, stageWidth, stageHeight, scale).bounds;
}

export function clampZoom(scale: number, maxZoom = MAX_IMAGE_ZOOM) {
  return Math.min(maxZoom, Math.max(MIN_IMAGE_ZOOM, scale));
}

export function clampPan(
  panX: number,
  panY: number,
  bounds: ImageLayoutBounds,
  scale: number,
) {
  if (scale <= 1) {
    return { panX: 0, panY: 0 };
  }

  return {
    panX: Math.max(-bounds.maxPanX, Math.min(bounds.maxPanX, panX)),
    panY: Math.max(-bounds.maxPanY, Math.min(bounds.maxPanY, panY)),
  };
}

export function clampImageZoom(
  zoom: ImageZoomState,
  naturalWidth: number,
  naturalHeight: number,
  stageWidth: number,
  stageHeight: number,
): ImageZoomState {
  const metrics = getImageLayoutMetrics(
    naturalWidth,
    naturalHeight,
    stageWidth,
    stageHeight,
    zoom.scale,
  );
  const scale = clampZoom(zoom.scale, metrics.maxZoom);
  const bounds = getImageLayoutBounds(
    naturalWidth,
    naturalHeight,
    stageWidth,
    stageHeight,
    scale,
  );
  return {
    scale,
    ...clampPan(zoom.panX, zoom.panY, bounds, scale),
  };
}

export function computePinchZoom(
  pinch: PinchState,
  distance: number,
  centerX: number,
  centerY: number,
  stageCenterX: number,
  stageCenterY: number,
  naturalWidth: number,
  naturalHeight: number,
  stageWidth: number,
  stageHeight: number,
): ImageZoomState {
  const startMetrics = getImageLayoutMetrics(
    naturalWidth,
    naturalHeight,
    stageWidth,
    stageHeight,
    pinch.startScale,
  );
  const scale = clampZoom(
    pinch.startScale * (distance / pinch.startDistance),
    startMetrics.maxZoom,
  );
  const focalX = centerX - stageCenterX;
  const focalY = centerY - stageCenterY;
  const startFocalX = pinch.startCenterX - stageCenterX;
  const startFocalY = pinch.startCenterY - stageCenterY;
  const panX = focalX - (startFocalX - pinch.startPanX) * (scale / pinch.startScale);
  const panY = focalY - (startFocalY - pinch.startPanY) * (scale / pinch.startScale);
  return clampImageZoom(
    { scale, panX, panY },
    naturalWidth,
    naturalHeight,
    stageWidth,
    stageHeight,
  );
}

export function imageZoomTransform(zoom: ImageZoomState) {
  if (zoom.scale === 1 && zoom.panX === 0 && zoom.panY === 0) {
    return undefined;
  }
  return `translate3d(${zoom.panX}px, ${zoom.panY}px, 0) scale(${zoom.scale})`;
}

export function canStartPinchZoom(
  touchState: {
    axis: 'x' | 'y' | 'pan' | null;
    offsetX: number;
    offsetY: number;
  } | null,
  dragOffsetX: number,
) {
  if (touchState?.axis === 'x' || touchState?.axis === 'y') {
    return false;
  }

  if (touchState && (Math.abs(touchState.offsetX) > 8 || Math.abs(touchState.offsetY) > 8)) {
    return false;
  }

  if (Math.abs(dragOffsetX) > 0) {
    return false;
  }

  return true;
}
