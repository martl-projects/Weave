// SVG icons are bundled as text (esbuild's text loader).
declare module '*.svg' {
  const svg: string;
  export default svg;
}
