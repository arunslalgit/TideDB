package influxdb

import "embed"

// UIAssets contains the compiled React SPA.
// The embed directive includes all files from ui/dist/.
// This is populated at build time after `npm run build` in the ui/ directory.
//
//go:embed ui/dist/*
var UIAssets embed.FS
