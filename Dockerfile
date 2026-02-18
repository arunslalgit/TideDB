# Stage 1: Build UI
FROM node:20-alpine AS ui-builder
WORKDIR /ui
COPY ui/package*.json ./
RUN npm ci
COPY ui/ .
RUN npm run build

# Stage 2: Build Go binary
FROM golang:1.23-alpine AS go-builder
RUN apk add --no-cache git gcc musl-dev
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=ui-builder /ui/dist ./ui/dist
ENV PKG_CONFIG=./pkg-config.sh
RUN go build -o /influxd ./cmd/influxd
RUN go build -o /influx ./cmd/influx

# Stage 3: Runtime
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
COPY --from=go-builder /influxd /usr/bin/influxd
COPY --from=go-builder /influx /usr/bin/influx
EXPOSE 8086
VOLUME /var/lib/tidedb
ENTRYPOINT ["influxd"]
CMD ["run"]
