// sync-contracts vendors generated browser contracts from the pinned released
// common module. No npm installation or network asset is required at runtime.
package main

import (
	"bytes"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func main() {
	check := flag.Bool("check", false, "verify without writing")
	flag.Parse()
	out, err := exec.Command("go", "list", "-m", "-f", "{{if .Replace}}REPLACED{{else}}{{.Dir}}{{end}}", "github.com/ByteDeskAI/bytedesk-sdk-dependencies/v2").Output()
	if err != nil {
		fail(err)
	}
	source := strings.TrimSpace(string(out))
	if source == "" || source == "REPLACED" {
		fail(fmt.Errorf("released, non-replaced common module required"))
	}
	for _, pkg := range []string{"codingsessions", "payloads"} {
		for _, name := range []string{"descriptors.js", "validators.js", "contracts.d.ts"} {
			data, err := os.ReadFile(filepath.Join(source, pkg, "typescript", name))
			if err != nil {
				fail(err)
			}
			target := filepath.Join("terminalplugin", "ui", "contracts", pkg, name)
			if *check {
				actual, err := os.ReadFile(target)
				if err != nil || !bytes.Equal(actual, data) {
					fail(fmt.Errorf("canonical artifact drift: %s", target))
				}
			} else {
				if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
					fail(err)
				}
				if err := os.WriteFile(target, data, 0644); err != nil {
					fail(err)
				}
			}
		}
	}
}
func fail(err error) { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
