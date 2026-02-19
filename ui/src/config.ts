// Runtime configuration injected by the Go server.
// The Go server replaces the placeholder in index.html with the actual
// --base-path value. In development (Vite dev server), no injection
// happens so basePath defaults to empty string.

declare global {
  interface Window {
    __TSUI_BASE__?: string;
  }
}

export const basePath: string = window.__TSUI_BASE__ || '';
