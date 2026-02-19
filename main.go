// TimeseriesUI is a unified web UI for time-series databases.
//
// It serves the TimeseriesUI web interface and proxies API requests to
// InfluxDB, Prometheus, and Alertmanager backends. Connections are managed
// in the browser UI; the binary itself is stateless.
//
// Usage:
//
//	timeseriesui
//	timeseriesui --port 3000
//	timeseriesui --influxdb-url http://myinflux:8086
//	timeseriesui --prometheus-url http://myprom:9090
package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

//go:embed ui/dist
var uiDist embed.FS

// Version is set at build time via -ldflags.
var Version = "dev"

// ── CLI flag types ──────────────────────────────────────────────────────────

// stringSlice lets a flag be repeated: --flag a --flag b
type stringSlice []string

func (s *stringSlice) String() string { return strings.Join(*s, ", ") }
func (s *stringSlice) Set(v string) error {
	*s = append(*s, v)
	return nil
}

// ── Connection model ────────────────────────────────────────────────────────

type CLIConnection struct {
	Name                 string `json:"name"`
	Type                 string `json:"type"` // "influxdb" or "prometheus"
	URL                  string `json:"url"`
	Username             string `json:"username,omitempty"`
	Password             string `json:"password,omitempty"`
	DefaultDatabase      string `json:"defaultDatabase,omitempty"`
	AlertmanagerURL      string `json:"alertmanagerUrl,omitempty"`
	AlertmanagerUsername string `json:"alertmanagerUsername,omitempty"`
	AlertmanagerPassword string `json:"alertmanagerPassword,omitempty"`
	Source               string `json:"source"` // always "cli"
}

type ConnectionsFile struct {
	Connections []CLIConnection `json:"connections"`
}

// ── Config ──────────────────────────────────────────────────────────────────

type Config struct {
	Port            int
	Host            string
	BasePath        string
	TLSCert         string
	TLSKey          string
	LogLevel        string
	LogFormat       string
	ProxyTimeout    time.Duration
	MaxResponseSize string
	DisableWrite    bool
	DisableAdmin    bool
	ReadOnly        bool
	ShowVersion     bool
	ConnectionsFile string
	Connections     []CLIConnection
}

func main() {
	cfg := parseFlags()

	if cfg.ShowVersion {
		fmt.Printf("timeseriesui %s\n", Version)
		os.Exit(0)
	}

	timeout := cfg.ProxyTimeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}
	httpClient := &http.Client{Timeout: timeout}

	uiFS, err := fs.Sub(uiDist, "ui/dist")
	if err != nil {
		log.Fatalf("Failed to access embedded UI assets: %v", err)
	}

	basePath := strings.TrimRight(cfg.BasePath, "/")

	mux := http.NewServeMux()

	// ── API: mode (standalone detection) ────────────────────────────────
	mux.HandleFunc(basePath+"/api/mode", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		resp := map[string]interface{}{
			"mode":         "standalone",
			"disableWrite": cfg.DisableWrite || cfg.ReadOnly,
			"disableAdmin": cfg.DisableAdmin || cfg.ReadOnly,
		}
		json.NewEncoder(w).Encode(resp)
	})

	// ── API: CLI-provided connections ───────────────────────────────────
	mux.HandleFunc(basePath+"/api/v1/connections", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		setCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		json.NewEncoder(w).Encode(cfg.Connections)
	})

	// ── API: health check ──────────────────────────────────────────────
	mux.HandleFunc(basePath+"/api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "ok",
			"version": Version,
		})
	})

	// ── Generic proxy: /proxy/influxdb/ ─────────────────────────────────
	mux.HandleFunc(basePath+"/proxy/influxdb/", makeGenericProxy(httpClient))

	// ── Generic proxy: /proxy/prometheus/ ───────────────────────────────
	mux.HandleFunc(basePath+"/proxy/prometheus/", makeGenericProxy(httpClient))

	// ── Generic proxy: /proxy/alertmanager/ ─────────────────────────────
	mux.HandleFunc(basePath+"/proxy/alertmanager/", makeGenericProxy(httpClient))

	// ── Legacy InfluxDB proxy (backward compatibility) ──────────────────
	defaultInfluxURL := ""
	for _, c := range cfg.Connections {
		if c.Type == "influxdb" {
			defaultInfluxURL = c.URL
			break
		}
	}
	for _, p := range []string{"/query", "/write", "/ping", "/debug/"} {
		mux.HandleFunc(basePath+p, makeLegacyInfluxProxy(httpClient, defaultInfluxURL))
	}

	// ── Serve the embedded SPA ──────────────────────────────────────────
	uiPrefix := basePath + "/ui/"
	mux.HandleFunc(uiPrefix, func(w http.ResponseWriter, r *http.Request) {
		serveUI(w, r, uiFS, uiPrefix)
	})
	mux.HandleFunc(basePath+"/ui", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, uiPrefix, http.StatusMovedPermanently)
	})
	mux.HandleFunc(basePath+"/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == basePath+"/" || r.URL.Path == basePath {
			http.Redirect(w, r, uiPrefix, http.StatusFound)
			return
		}
		http.NotFound(w, r)
	})

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	scheme := "http"
	if cfg.TLSCert != "" {
		scheme = "https"
	}
	displayHost := cfg.Host
	if displayHost == "0.0.0.0" || displayHost == "" {
		displayHost = "localhost"
	}
	fmt.Printf("TimeseriesUI %s starting on %s://%s:%d%s/ui/\n", Version, scheme, displayHost, cfg.Port, basePath)
	if len(cfg.Connections) > 0 {
		for _, c := range cfg.Connections {
			fmt.Printf("  [%s] %s → %s\n", c.Type, c.Name, c.URL)
		}
	} else {
		fmt.Println("No default connections — add them in the UI.")
	}
	fmt.Println("Press Ctrl+C to stop.")

	if cfg.TLSCert != "" && cfg.TLSKey != "" {
		if err := http.ListenAndServeTLS(addr, cfg.TLSCert, cfg.TLSKey, mux); err != nil {
			log.Fatalf("Server failed: %v", err)
		}
	} else {
		if err := http.ListenAndServe(addr, mux); err != nil {
			log.Fatalf("Server failed: %v", err)
		}
	}
}

// ── Flag parsing ────────────────────────────────────────────────────────────

func parseFlags() Config {
	var (
		influxURLs   stringSlice
		promURLs     stringSlice
		cfg          Config
		proxyTimeout string
		amURL        string
		influxUser   string
		influxPass   string
		influxName   string
		promUser     string
		promPass     string
		promName     string
	)

	flag.IntVar(&cfg.Port, "port", 8080, "Port to listen on")
	flag.StringVar(&cfg.Host, "host", "0.0.0.0", "Host/IP to bind to")
	flag.StringVar(&cfg.BasePath, "base-path", "", "Base URL path prefix, e.g. /tsui")
	flag.StringVar(&cfg.TLSCert, "tls-cert", "", "Path to TLS certificate file")
	flag.StringVar(&cfg.TLSKey, "tls-key", "", "Path to TLS private key file")

	flag.Var(&influxURLs, "influxdb-url", "Add a default InfluxDB connection (repeatable)")
	flag.StringVar(&influxUser, "influxdb-user", "", "Default InfluxDB username")
	flag.StringVar(&influxPass, "influxdb-password", "", "Default InfluxDB password")
	flag.StringVar(&influxName, "influxdb-name", "", "Display name for InfluxDB connection")

	flag.Var(&promURLs, "prometheus-url", "Add a default Prometheus connection (repeatable)")
	flag.StringVar(&promUser, "prometheus-user", "", "Default Prometheus basic-auth username")
	flag.StringVar(&promPass, "prometheus-password", "", "Default Prometheus basic-auth password")
	flag.StringVar(&promName, "prometheus-name", "", "Display name for Prometheus connection")
	flag.StringVar(&amURL, "alertmanager-url", "", "Default Alertmanager URL")

	flag.StringVar(&cfg.ConnectionsFile, "connections", "", "Path to a JSON connections file")
	flag.StringVar(&cfg.LogLevel, "log-level", "info", "Log verbosity: debug, info, warn, error")
	flag.StringVar(&cfg.LogFormat, "log-format", "text", "Log format: text, json")
	flag.StringVar(&proxyTimeout, "proxy-timeout", "30s", "Timeout for proxied API requests")
	flag.StringVar(&cfg.MaxResponseSize, "max-response-size", "50MB", "Max proxied response size")

	flag.BoolVar(&cfg.DisableWrite, "disable-write", false, "Disable the Write Data feature")
	flag.BoolVar(&cfg.DisableAdmin, "disable-admin", false, "Disable admin/destructive operations")
	flag.BoolVar(&cfg.ReadOnly, "readonly", false, "Shorthand for --disable-write --disable-admin")
	flag.BoolVar(&cfg.ShowVersion, "version", false, "Print version and exit")

	flag.Parse()

	if d, err := time.ParseDuration(proxyTimeout); err == nil {
		cfg.ProxyTimeout = d
	} else {
		cfg.ProxyTimeout = 30 * time.Second
	}

	// Load connections file if provided
	if cfg.ConnectionsFile != "" {
		data, err := os.ReadFile(cfg.ConnectionsFile)
		if err != nil {
			log.Fatalf("Failed to read connections file: %v", err)
		}
		var cf ConnectionsFile
		if err := json.Unmarshal(data, &cf); err != nil {
			log.Fatalf("Failed to parse connections file: %v", err)
		}
		for i := range cf.Connections {
			cf.Connections[i].Source = "cli"
		}
		cfg.Connections = append(cfg.Connections, cf.Connections...)
	}

	// Build connections from CLI flags
	for i, u := range influxURLs {
		name := influxName
		if name == "" {
			name = nameFromURL(u, "InfluxDB")
			if len(influxURLs) > 1 {
				name += " " + strconv.Itoa(i+1)
			}
		} else if len(influxURLs) > 1 {
			name += " " + strconv.Itoa(i+1)
		}
		cfg.Connections = append(cfg.Connections, CLIConnection{
			Name:     name,
			Type:     "influxdb",
			URL:      u,
			Username: influxUser,
			Password: influxPass,
			Source:   "cli",
		})
	}

	for i, u := range promURLs {
		name := promName
		if name == "" {
			name = nameFromURL(u, "Prometheus")
			if len(promURLs) > 1 {
				name += " " + strconv.Itoa(i+1)
			}
		} else if len(promURLs) > 1 {
			name += " " + strconv.Itoa(i+1)
		}
		conn := CLIConnection{
			Name:     name,
			Type:     "prometheus",
			URL:      u,
			Username: promUser,
			Password: promPass,
			Source:   "cli",
		}
		if amURL != "" && i == 0 {
			conn.AlertmanagerURL = amURL
		}
		cfg.Connections = append(cfg.Connections, conn)
	}

	if amURL != "" && len(promURLs) == 0 {
		log.Println("Warning: --alertmanager-url specified without --prometheus-url; it won't be used.")
	}

	return cfg
}

func nameFromURL(rawURL, backendType string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return backendType
	}
	host := u.Hostname()
	if host == "localhost" || host == "127.0.0.1" {
		return backendType + " (local)"
	}
	return backendType + " (" + host + ")"
}

// ── Generic Proxy Handler ───────────────────────────────────────────────────

func makeGenericProxy(httpClient *http.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		setCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		target := r.URL.Query().Get("target")
		apiPath := r.URL.Query().Get("path")

		if target == "" {
			jsonError(w, http.StatusBadRequest, "Missing 'target' query parameter")
			return
		}

		parsedTarget, err := url.Parse(target)
		if err != nil || (parsedTarget.Scheme != "http" && parsedTarget.Scheme != "https") {
			jsonError(w, http.StatusBadRequest, "Invalid target URL: must use http:// or https://")
			return
		}

		destURL := strings.TrimRight(target, "/")
		if apiPath != "" {
			if !strings.HasPrefix(apiPath, "/") {
				apiPath = "/" + apiPath
			}
			destURL += apiPath
		}

		params := make(url.Values)
		for k, vs := range r.URL.Query() {
			if k == "target" || k == "path" {
				continue
			}
			for _, v := range vs {
				params.Add(k, v)
			}
		}
		if encoded := params.Encode(); encoded != "" {
			destURL += "?" + encoded
		}

		proxyReq, err := http.NewRequestWithContext(r.Context(), r.Method, destURL, r.Body)
		if err != nil {
			jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to create request: %s", err))
			return
		}

		for _, h := range []string{"Content-Type", "Accept", "Content-Encoding", "Authorization"} {
			if v := r.Header.Get(h); v != "" {
				proxyReq.Header.Set(h, v)
			}
		}

		username := r.Header.Get("X-Proxy-Username")
		password := r.Header.Get("X-Proxy-Password")
		if username != "" || password != "" {
			proxyReq.SetBasicAuth(username, password)
		}

		resp, err := httpClient.Do(proxyReq)
		if err != nil {
			jsonError(w, http.StatusBadGateway, fmt.Sprintf("Connection failed: %s", err))
			return
		}
		defer resp.Body.Close()

		for k, vs := range resp.Header {
			for _, v := range vs {
				w.Header().Add(k, v)
			}
		}
		setCORS(w)
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body)
	}
}

// ── Legacy InfluxDB Proxy (backward compat) ─────────────────────────────────

func makeLegacyInfluxProxy(httpClient *http.Client, defaultURL string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		setCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		targetURL := r.Header.Get("X-Influxdb-Url")
		if targetURL == "" {
			targetURL = defaultURL
		}
		if targetURL == "" {
			jsonError(w, http.StatusBadGateway, "No InfluxDB connection configured. Add a connection in the UI.")
			return
		}

		target, err := url.Parse(targetURL)
		if err != nil {
			jsonError(w, http.StatusBadRequest, fmt.Sprintf("Invalid target URL: %s", err))
			return
		}

		upstream := *target
		upstream.Path = strings.TrimRight(upstream.Path, "/") + r.URL.Path
		upstream.RawQuery = r.URL.RawQuery

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

		proxyReq, err := http.NewRequestWithContext(r.Context(), r.Method, upstream.String(), r.Body)
		if err != nil {
			jsonError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to create request: %s", err))
			return
		}
		for _, h := range []string{"Content-Type", "Accept", "Content-Encoding"} {
			if v := r.Header.Get(h); v != "" {
				proxyReq.Header.Set(h, v)
			}
		}

		resp, err := httpClient.Do(proxyReq)
		if err != nil {
			jsonError(w, http.StatusBadGateway, fmt.Sprintf("Connection failed: %s", err))
			return
		}
		defer resp.Body.Close()

		for k, vs := range resp.Header {
			for _, v := range vs {
				w.Header().Add(k, v)
			}
		}
		setCORS(w)
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body)
	}
}

// ── SPA Serving ─────────────────────────────────────────────────────────────

func serveUI(w http.ResponseWriter, r *http.Request, uiFS fs.FS, prefix string) {
	path := strings.TrimPrefix(r.URL.Path, prefix)
	if path == "" {
		path = "index.html"
	}

	f, err := uiFS.Open(path)
	if err == nil {
		f.Close()
		http.StripPrefix(prefix, http.FileServer(http.FS(uiFS))).ServeHTTP(w, r)
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

// ── Helpers ─────────────────────────────────────────────────────────────────

func setCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Influxdb-Url, X-Influxdb-Username, X-Influxdb-Password, X-Proxy-Username, X-Proxy-Password")
	w.Header().Set("Access-Control-Expose-Headers", "X-Influxdb-Version, X-Tidedb-Version")
}

func jsonError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
