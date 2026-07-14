import { useIsMobile } from '../hooks/useIsMobile';
import type { BrowseEntry } from '../types';
import { DesktopLightbox } from './DesktopLightbox';
import { MobileGallery } from './MobileGallery';

interface MediaGalleryProps {
  entries: BrowseEntry[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}

export function MediaGallery(props: MediaGalleryProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileGallery {...props} />;
  }

  return <DesktopLightbox {...props} />;
}
