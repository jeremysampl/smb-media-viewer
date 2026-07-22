import 'yet-another-react-lightbox';

declare module 'yet-another-react-lightbox' {
  interface Labels {
    Details?: string;
  }

  interface SlideImage {
    /** Browse entry path — stable across quality URL changes. */
    entryPath?: string;
  }
}
