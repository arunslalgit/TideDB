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

// Playground mode is detected by the URL path.
// When the user navigates to /playground/*, the SPA runs entirely with mock data.
export const isPlaygroundMode: boolean = window.location.pathname.startsWith(basePath + '/playground');
