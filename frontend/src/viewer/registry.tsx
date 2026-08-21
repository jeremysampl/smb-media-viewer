import type { ComponentType } from 'react';
import type { ViewerKind } from '../types';
import { PdfFileViewer } from './pdf/PdfFileViewer';
import { TextFileViewer } from './text/TextFileViewer';
import type { FileViewerProps } from './types';

export type { FileViewerProps } from './types';

/**
 * Register a component per ViewerKind.
 * To add a new type: extend ViewerKind on both sides, map extensions in
 * backend fileTypes.ts, then add the viewer here.
 */
const VIEWERS: Record<ViewerKind, ComponentType<FileViewerProps>> = {
  text: TextFileViewer,
  pdf: PdfFileViewer,
};

export function getFileViewer(
  kind: ViewerKind,
): ComponentType<FileViewerProps> | null {
  return VIEWERS[kind] ?? null;
}
