// SVG icons are bundled as text (esbuild's text loader).
declare module '*.svg' {
  const svg: string;
  export default svg;
}

// PNG icons are bundled as data URLs (esbuild's dataurl loader).
declare module '*.png' {
  const url: string;
  export default url;
}
