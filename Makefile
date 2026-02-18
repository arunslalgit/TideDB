export PKG_CONFIG=./pkg-config.sh

VERSION ?= 0.1.0
COMMIT  ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_DATE ?= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")

LDFLAGS=-ldflags "-X github.com/influxdata/influxdb/internal/branding.Version=$(VERSION) \
                   -X github.com/influxdata/influxdb/internal/branding.Commit=$(COMMIT) \
                   -X github.com/influxdata/influxdb/internal/branding.BuildDate=$(BUILD_DATE)"

UI_DIR = ui

.PHONY: build build-server ui ui-install ui-clean clean test dev

# UI build
ui-install:
	cd $(UI_DIR) && npm install

ui: ui-install
	cd $(UI_DIR) && npm run build

ui-clean:
	rm -rf $(UI_DIR)/dist $(UI_DIR)/node_modules

# Main build (now depends on UI)
build: ui
	go build $(LDFLAGS) -o bin/influxd ./cmd/influxd
	go build $(LDFLAGS) -o bin/influx ./cmd/influx
	go build $(LDFLAGS) -o bin/influx_inspect ./cmd/influx_inspect

# Dev build without UI (for backend-only changes)
build-server:
	go build $(LDFLAGS) -o bin/influxd ./cmd/influxd

# Full clean
clean: ui-clean
	rm -rf bin/

# Docker build
docker:
	docker build -t tidedb:$(VERSION) .

# Run tests
test:
	go test ./...

# Development mode: run UI dev server + Go server concurrently
dev:
	@echo "Starting TideDB server on :8086..."
	@go run ./cmd/influxd run &
	@echo "Starting UI dev server on :5173..."
	@cd $(UI_DIR) && npm run dev
