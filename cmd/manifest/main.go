package main

import (
	"encoding/json"
	"flag"
	"github.com/ByteDeskAI/bytedesk-ai-terminal/terminalplugin"
	"log"
	"os"
)

func main() {
	output := flag.String("out", "", "write generated manifest to this file")
	flag.Parse()
	writer := os.Stdout
	if *output != "" {
		file, err := os.Create(*output)
		if err != nil {
			log.Fatal(err)
		}
		defer file.Close()
		writer = file
	}
	encoder := json.NewEncoder(writer)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(terminalplugin.New().Manifest()); err != nil {
		log.Fatal(err)
	}
}
