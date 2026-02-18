// tidedb-ui is a standalone web UI server for InfluxDB 1.x compatible databases.
//
// It serves the TideDB web interface and proxies API requests (/query, /write,
// /ping, /debug/*) to a remote InfluxDB instance. This allows you to use the
// TideDB UI with any existing InfluxDB 1.x deployment without replacing the
// database server.
//
// Usage:
//
//	tidedb-ui --influxdb-url http://localhost:8086
//	tidedb-ui --influxdb-url http://myserver:8086 --port 3000 --username admin --password secret
package main

import (
	"bytes"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"

	influxdb "github.com/influxdata/influxdb"
)

func main() {
	var (
		influxURL string
		port      int
		username  string
		password  string
	)

	flag.StringVar(&influxURL, "influxdb-url", "http://localhost:8086", "URL of the InfluxDB instance to connect to")
	flag.IntVar(&port, "port", 8087, "Port for the UI server to listen on")
	flag.StringVar(&username, "username", "", "Default username for InfluxDB authentication (optional)")
	flag.StringVar(&password, "password", "", "Default password for InfluxDB authentication (optional)")
	flag.Parse()

	target, err := url.Parse(influxURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Invalid --influxdb-url: %v\n", err)
		os.Exit(1)
	}

	// Build the reverse proxy for API requests.
	proxy := httputil.NewSingleHostReverseProxy(target)
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = target.Host

		// Inject default credentials if provided and not already in the request.
		if username != "" || password != "" {
			q := req.URL.Query()
			if q.Get("u") == "" && username != "" {
				q.Set("u", username)
			}
			if q.Get("p") == "" && password != "" {
				q.Set("p", password)
			}
			req.URL.RawQuery = q.Encode()
		}
	}

	mux := http.NewServeMux()

	// Proxy InfluxDB API endpoints.
	apiPaths := []string{"/query", "/write", "/ping", "/debug/"}
	for _, p := range apiPaths {
		path := p
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			// Allow CORS for the UI.
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			proxy.ServeHTTP(w, r)
		})
	}

	// Serve the embedded UI.
	uiFS, err := fs.Sub(influxdb.UIAssets, "ui/dist")
	if err != nil {
		log.Fatalf("Failed to access embedded UI assets: %v", err)
	}

	// Serve UI at /ui/* (same path as the full TideDB server).
	mux.HandleFunc("/ui/", func(w http.ResponseWriter, r *http.Request) {
		serveUI(w, r, uiFS)
	})
	mux.HandleFunc("/ui", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/ui/", http.StatusMovedPermanently)
	})

	// Root redirects to /ui/.
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.Redirect(w, r, "/ui/", http.StatusFound)
			return
		}
		http.NotFound(w, r)
	})

	addr := fmt.Sprintf(":%d", port)
	fmt.Printf("TideDB UI server starting on http://localhost%s/ui/\n", addr)
	fmt.Printf("Proxying API requests to %s\n", influxURL)
	if username != "" {
		fmt.Printf("Default credentials: user=%s\n", username)
	}
	fmt.Println("Press Ctrl+C to stop.")

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

// serveUI serves the embedded SPA. Real files are served directly; all other
// paths fall back to index.html for client-side routing.
func serveUI(w http.ResponseWriter, r *http.Request, uiFS fs.FS) {
	path := strings.TrimPrefix(r.URL.Path, "/ui/")
	if path == "" {
		path = "index.html"
	}

	// Try to serve a real file first.
	f, err := uiFS.Open(path)
	if err == nil {
		f.Close()
		fileServer := http.FileServer(http.FS(uiFS))
		http.StripPrefix("/ui/", fileServer).ServeHTTP(w, r)
		return
	}

	// Fall back to index.html for SPA routing.
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
