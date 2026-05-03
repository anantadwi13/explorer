package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/anantadwi13/explorer/internal/server"
)

func main() {
	fs := flag.NewFlagSet("explorer", flag.ContinueOnError)
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "Usage: explorer <dir> [--port PORT] [--host HOST]")
		fs.PrintDefaults()
	}

	port := fs.Int("port", 8080, "TCP port to listen on")
	host := fs.String("host", "127.0.0.1", "Host address to bind to")

	// Partition args into flag args and positional args so flags can follow the dir.
	var flagArgs, posArgs []string
	for i := 1; i < len(os.Args); i++ {
		a := os.Args[i]
		if len(a) > 0 && a[0] == '-' {
			flagArgs = append(flagArgs, a)
			// Consume the value for --flag value style (peek ahead).
			if i+1 < len(os.Args) && len(os.Args[i+1]) > 0 && os.Args[i+1][0] != '-' {
				i++
				flagArgs = append(flagArgs, os.Args[i])
			}
		} else {
			posArgs = append(posArgs, a)
		}
	}

	if err := fs.Parse(flagArgs); err != nil {
		os.Exit(2)
	}

	if len(posArgs) < 1 {
		fmt.Fprintln(os.Stderr, "error: missing required argument <dir>")
		fs.Usage()
		os.Exit(1)
	}

	dir := posArgs[0]

	info, err := os.Stat(dir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %s: %v\n", dir, err)
		os.Exit(1)
	}
	if !info.IsDir() {
		fmt.Fprintf(os.Stderr, "error: %s is not a directory\n", dir)
		os.Exit(1)
	}

	absRoot, err := filepath.EvalSymlinks(dir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error resolving path %s: %v\n", dir, err)
		os.Exit(1)
	}
	absRoot, err = filepath.Abs(absRoot)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error computing absolute path: %v\n", err)
		os.Exit(1)
	}

	addr := fmt.Sprintf("%s:%d", *host, *port)
	url := fmt.Sprintf("http://%s:%d", *host, *port)

	fmt.Printf("explorer serving %s\n", absRoot)
	fmt.Printf("  → %s\n", url)
	if !isLoopback(*host) {
		fmt.Printf("  ⚠ host is not loopback — anyone on this network can read these files.\n")
	}

	srv := server.New(absRoot)
	httpServer := &http.Server{
		Addr:    addr,
		Handler: srv,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "server error: %v\n", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	stop()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		fmt.Fprintf(os.Stderr, "shutdown error: %v\n", err)
		os.Exit(1)
	}
}

func isLoopback(host string) bool {
	return host == "127.0.0.1" || host == "::1" || host == "localhost"
}
