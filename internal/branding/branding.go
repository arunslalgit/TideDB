package branding

const (
	ProductName  = "TideDB"
	ServerHeader = "X-Tidedb-Version"
	DefaultPort  = 8086
	UIPath       = "/ui/"
	APIDocsURL   = "https://github.com/arunslalgit/TideDB"
)

// Version is set at build time via -ldflags
var (
	Version   = "0.1.0"
	Commit    = "unknown"
	BuildDate = "unknown"
)
