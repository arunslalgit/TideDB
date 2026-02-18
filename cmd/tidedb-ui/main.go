// tidedb-ui is a standalone web UI server for InfluxDB 1.x compatible databases.
//
// It serves the TideDB web interface and proxies API requests (/query, /write,
// /ping, /debug/*) to remote InfluxDB instances. Connections can be managed
// directly in the UI, allowing you to switch between multiple InfluxDB servers.
//
// Usage:
//
//	tidedb-ui
//	tidedb-ui --port 3000
//	tidedb-ui --influxdb-url http://myserver:8086
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	influxdb "github.com/influxdata/influxdb"
)

func main() {
	var (
		defaultURL string
		port       int
	)

	flag.StringVar(&defaultURL, "influxdb-url", "", "Default InfluxDB URL (optional — connections can be added in the UI)")
	flag.IntVar(&port, "port", 8087, "Port for the UI server to listen on")
	flag.Parse()

	httpClient := &http.Client{Timeout: 30 * time.Second}

	mux := http.NewServeMux()

	// Mode endpoint — lets the UI detect standalone mode.
	mux.HandleFunc("/api/mode", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		resp := map[string]string{"mode": "standalone"}
		if defaultURL != "" {
			resp["defaultUrl"] = defaultURL
		}
		json.NewEncoder(w).Encode(resp)
	})

	// Dynamic proxy for InfluxDB API endpoints.
	// The UI sends X-Influxdb-Url / X-Influxdb-Username / X-Influxdb-Password
	// headers to select the target instance.
	apiPaths := []string{"/query", "/write", "/ping", "/debug/"}
	for _, p := range apiPaths {
		mux.HandleFunc(p, makeProxyHandler(httpClient, defaultURL))
	}

	// Serve the embedded UI.
	uiFS, err := fs.Sub(influxdb.UIAssets, "ui/dist")
	if err != nil {
		log.Fatalf("Failed to access embedded UI assets: %v", err)
	}

	mux.HandleFunc("/ui/", func(w http.ResponseWriter, r *http.Request) {
		serveUI(w, r, uiFS)
	})
	mux.HandleFunc("/ui", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/ui/", http.StatusMovedPermanently)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.Redirect(w, r, "/ui/", http.StatusFound)
			return
		}
		http.NotFound(w, r)
	})

	addr := fmt.Sprintf(":%d", port)
	fmt.Printf("TideDB UI server starting on http://localhost%s/ui/\n", addr)
	if defaultURL != "" {
		fmt.Printf("Default InfluxDB target: %s\n", defaultURL)
	} else {
		fmt.Println("No default target — add connections in the UI.")
	}
	fmt.Println("Press Ctrl+C to stop.")

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

// makeProxyHandler returns an http.HandlerFunc that forwards requests to a
// remote InfluxDB instance. The target is determined by:
//  1. X-Influxdb-Url request header (set by the UI connection manager), or
//  2. the --influxdb-url default passed at startup.
func makeProxyHandler(httpClient *http.Client, defaultURL string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// CORS — the UI is served from the same origin, but be permissive.
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Influxdb-Url, X-Influxdb-Username, X-Influxdb-Password")
		w.Header().Set("Access-Control-Expose-Headers", "X-Influxdb-Version, X-Tidedb-Version")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// Determine target URL.
		targetURL := r.Header.Get("X-Influxdb-Url")
		if targetURL == "" {
			targetURL = defaultURL
		}
		if targetURL == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadGateway)
			fmt.Fprint(w, `{"error":"No InfluxDB connection configured. Add a connection in the UI."}`)
			return
		}

		target, err := url.Parse(targetURL)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprintf(w, `{"error":"Invalid target URL: %s"}`, err)
			return
		}

		// Build the upstream URL: base + original path + query.
		upstream := *target
		upstream.Path = strings.TrimRight(upstream.Path, "/") + r.URL.Path
		upstream.RawQuery = r.URL.RawQuery

		// Inject credentials from headers into query params.
		username := r.Header.Get("X-Influxdb-Username")
		password := r.Header.Get("X-Influxdb-Password")
		if username != "" || password != "" {
			q := upstream.Query()
			if q.Get("u") == "" && username != "" {
				q.Set("u", username)
			}
			if q.Get("p") == "" && password != "" {
				q.Set("p", password)
			}
			upstream.RawQuery = q.Encode()
		}

		// Forward the request.
		proxyReq, err := http.NewRequestWithContext(r.Context(), r.Method, upstream.String(), r.Body)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"Failed to create request: %s"}`, err), http.StatusInternalServerError)
			return
		}
		for _, h := range []string{"Content-Type", "Accept", "Content-Encoding"} {
			if v := r.Header.Get(h); v != "" {
				proxyReq.Header.Set(h, v)
			}
		}

		resp, err := httpClient.Do(proxyReq)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadGateway)
			fmt.Fprintf(w, `{"error":"Connection failed: %s"}`, err)
			return
		}
		defer resp.Body.Close()

		// Copy response headers and body.
		for k, vs := range resp.Header {
			for _, v := range vs {
				w.Header().Add(k, v)
			}
		}
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body)
	}
}

// serveUI serves the embedded SPA. Real files are served directly; all other
// paths fall back to index.html for client-side routing.
func serveUI(w http.ResponseWriter, r *http.Request, uiFS fs.FS) {
	path := strings.TrimPrefix(r.URL.Path, "/ui/")
	if path == "" {
		path = "index.html"
	}

	f, err := uiFS.Open(path)
	if err == nil {
		f.Close()
		fileServer := http.FileServer(http.FS(uiFS))
		http.StripPrefix("/ui/", fileServer).ServeHTTP(w, r)
		return
	}

	indexFile, err := uiFS.Open("index.html")
	if err != nil {
		http.Error(w, "UI not available", http.StatusInternalServerError)
		return
	}
	defer indexFile.Close()

	stat, _ := indexFile.Stat()
	content, _ := io.ReadAll(indexFile)
	http.ServeContent(w, r, "index.html", stat.ModTime(), bytes.NewReader(content))
}
