/// <reference types="vite/client" />

declare const __OPENPRISM_BUILD_ID__: string;

declare module '*?url' {
  const src: string;
  export default src;
}
