package main

import (
	"encoding/json"
	example "github.com/ByteDeskAI/bytedesk-remote-gateway-plugin-template/exampleplugin"
	"log"
	"os"
)

func main() {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(example.New().Manifest()); err != nil {
		log.Fatal(err)
	}
}
