package main

import (
	"context"
	pluginsdk "github.com/ByteDeskAI/bytedesk-remote-gateway-plugin-sdk"
	example "github.com/ByteDeskAI/bytedesk-remote-gateway-plugin-template/exampleplugin"
	"log"
)

func main() {
	if err := pluginsdk.ServePlugin(context.Background(), example.New(), pluginsdk.PluginConfig{}); err != nil {
		log.Fatal(err)
	}
}
