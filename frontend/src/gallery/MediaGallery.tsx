import { useIsMobile } from '../hooks/useIsMobile';
import type { BrowseEntry } from '../types';
import { DesktopLightbox } from './DesktopLightbox';
import { MobileGallery } from './MobileGallery';

interface MediaGalleryProps {
  entries: BrowseEntry[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
  className?: string;
}

export function MediaGallery({ className, ...props }: MediaGalleryProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileGallery {...props} className={className} />;
  }

  return <DesktopLightbox {...props} className={className} />;
}
