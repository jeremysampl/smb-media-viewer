import { fetchOfficePdfBlob } from '../../api/client';
import { PdfFileViewer } from '../pdf/PdfFileViewer';
import type { FileViewerProps } from '../types';

export function OfficeFileViewer(props: FileViewerProps) {
  return (
    <PdfFileViewer
      {...props}
      fetchBlob={fetchOfficePdfBlob}
      loadingMessage="Converting document…"
    />
  );
}
