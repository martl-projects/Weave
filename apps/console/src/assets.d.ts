// Icons are bundled as SVG text (esbuild's text loader, see build.ts).
declare module '*.svg' {
  const svg: string;
  export default svg;
}

// The app's bitmaps (SerenityOS) as data URLs.
declare module '*.png' {
  const url: string;
  export default url;
}
