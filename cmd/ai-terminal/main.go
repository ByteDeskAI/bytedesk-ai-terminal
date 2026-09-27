package main

import (
	"context"
	"github.com/ByteDeskAI/bytedesk-ai-terminal/terminalplugin"
	pluginsdk "github.com/ByteDeskAI/bytedesk-remote-gateway-plugin-sdk/v2"
	"log"
)

func main() {
	if err := pluginsdk.ServePlugin(context.Background(), terminalplugin.New(), pluginsdk.PluginConfig{}); err != nil {
		log.Fatal(err)
	}
}
