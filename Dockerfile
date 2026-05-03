# Stage 1: Build the React SPA
FROM node:lts-alpine AS web-build
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: Build the Go binary
FROM golang:1.24-alpine AS go-build
WORKDIR /app
COPY go.mod ./
COPY . .
COPY --from=web-build /app/internal/server/ui/dist ./internal/server/ui/dist
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/explorer ./cmd/explorer

# Stage 3: Minimal runtime image
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=go-build /out/explorer /explorer
ENTRYPOINT ["/explorer"]
