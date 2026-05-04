.PHONY: web web-commit build dev-web dev-server run clean test docker release-snapshot checksums

# Cross-compile matrix mirrored in .github/workflows/release.yml and pr-build.yml.
RELEASE_TARGETS := linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64

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
	rm -rf dist

# Cross-compile every release target locally into dist/. Produces both shapes per
# target — a tar.gz/zip archive (binary + LICENSE + README) and a bare binary —
# sharing the explorer_snapshot_<os>_<arch> filename prefix. Twelve files total.
# Mirrors the release.yml packaging step; verify pipeline changes with `make
# release-snapshot && make checksums` before tagging.
release-snapshot: web
	rm -rf dist
	mkdir -p dist
	@SHA=$$(git rev-parse --short HEAD); \
	DATE=$$(date -u +%Y-%m-%d); \
	for target in $(RELEASE_TARGETS); do \
		GOOS=$${target%/*}; GOARCH=$${target#*/}; \
		EXT=""; [ "$$GOOS" = "windows" ] && EXT=".exe"; \
		STAGE=dist/staging/$${GOOS}_$${GOARCH}; \
		PREFIX=explorer_snapshot_$${GOOS}_$${GOARCH}; \
		mkdir -p $$STAGE; \
		echo "==> $$GOOS/$$GOARCH"; \
		GOOS=$$GOOS GOARCH=$$GOARCH go build -trimpath \
			-ldflags "-s -w -X main.version=snapshot -X main.commit=$$SHA -X main.buildDate=$$DATE" \
			-o $$STAGE/explorer$$EXT ./cmd/explorer || exit 1; \
		cp LICENSE README.md $$STAGE/; \
		if [ "$$GOOS" = "windows" ]; then \
			(cd $$STAGE && zip -q ../../../dist/$$PREFIX.zip explorer.exe LICENSE README.md) || exit 1; \
			cp $$STAGE/explorer.exe dist/$$PREFIX.exe; \
		else \
			tar -C $$STAGE -czf dist/$$PREFIX.tar.gz explorer LICENSE README.md || exit 1; \
			cp $$STAGE/explorer dist/$$PREFIX; \
		fi; \
	done
	rm -rf dist/staging
	@ls -1 dist/

# Generate checksums.txt over every dist/explorer_snapshot_* asset (covers both
# archives and bare binaries via the shared prefix; excludes checksums.txt itself).
checksums:
	@if command -v sha256sum >/dev/null 2>&1; then \
		(cd dist && sha256sum explorer_snapshot_* > checksums.txt); \
	else \
		(cd dist && shasum -a 256 explorer_snapshot_* > checksums.txt); \
	fi
	@cat dist/checksums.txt

# Run all Go tests (excluding web/node_modules)
test:
	go test ./cmd/... ./internal/...

# Build and tag the Docker image
docker:
	docker build -t explorer:latest .
