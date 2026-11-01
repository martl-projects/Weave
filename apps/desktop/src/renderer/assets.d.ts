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

/** The release version, set by the build (esbuild define). */
declare const WEAVE_VERSION: string;
/** Weave avatar's pinned release (its archive's SHA-256, shortened): pictures kept on disk are its. */
declare const AVATAR_RELEASE: string;
