// Icons are bundled as SVG text (esbuild's text loader, see build.ts).
declare module '*.svg' {
  const svg: string;
  export default svg;
}
