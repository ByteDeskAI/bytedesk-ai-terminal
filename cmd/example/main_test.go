package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestExampleProcessBuilds(t *testing.T) {
	dir, err := os.MkdirTemp("", "tm370-template-")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dir)
	binary := filepath.Join(dir, "example")
	build := exec.Command("go", "build", "-o", binary, ".")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build: %v: %s", err, out)
	}
	if info, err := os.Stat(binary); err != nil || info.Size() == 0 {
		t.Fatalf("built process missing or empty: %v", err)
	}
}
