.PHONY: web web-commit build dev-web dev-server run clean test docker

# Build the React SPA (outputs to internal/server/ui/dist/)
web:
	cd web && npm ci && npm run build

# Rebuild the embedded SPA and stage it. Run this before committing any change under web/src/.
web-commit:
	cd web && npm run build && cd .. && git add internal/server/ui/dist

# Build the full Go binary (runs web first to embed the SPA)
build: web
	go build -trimpath -ldflags="-s -w" -o explorer ./cmd/explorer

# Start the Vite dev server (proxies API calls to a running Go server on :8080)
dev-web:
	cd web && npm run dev

# Build and run the Go server without embedding (use alongside dev-web)
dev-server:
	go build -o explorer ./cmd/explorer && ./explorer ./testdata

# Build then run the binary against testdata/
run: build
	./explorer ./testdata

# Remove build artifacts
clean:
	rm -f explorer
	rm -rf internal/server/ui/dist

# Run all Go tests (excluding web/node_modules)
test:
	go test ./cmd/... ./internal/...

# Build and tag the Docker image
docker:
	docker build -t explorer:latest .
