// Package contracts owns the example plugin's typed bus contracts.
package contracts

import commonplugin "github.com/ByteDeskAI/bytedesk-sdk-dependencies/v2/plugin"

// StartedEvent is emitted after the plugin has mounted its service.
type StartedEvent struct {
	Message   string `json:"message"`
	StartedAt string `json:"startedAt"`
}

// RuntimeState is the value stored in the host-provisioned example_runtime bucket.
type RuntimeState struct {
	Starts        int    `json:"starts"`
	LastStartedAt string `json:"lastStartedAt"`
}

// HelloRequest and HelloResponse are the request/reply payloads for the
// discoverable example service.
type HelloRequest struct {
	Name string `json:"name,omitempty"`
}

type HelloResponse struct {
	Message string `json:"message"`
}

// Descriptors keep subjects, revisions and schema hashes together. A real
// plugin with a larger contract surface should generate this file with the
// common SDK contract generator.
var (
	Started = commonplugin.NewEvent[StartedEvent](
		"event.example.v1.started", 1,
		"bb375ab27cbb2c616d41ec8bf254fbb61394e57f7db79c8ff0d46bd3a5e0342a",
		"event.example.v1.started",
	)
	Runtime = commonplugin.NewBucketDescriptor[RuntimeState](
		"example_runtime", 1,
		"1e2304aa1f3fd87929b1a4c700c912f726fee8b0422001a59223bb61eb3bdc5b",
	)
	Hello = commonplugin.NewCommand[HelloRequest, HelloResponse](
		"svc.example.v1.hello", 1,
		"f9bcc2b73920b794ad2d7a0568f9b1ca72abb1fd0eecd7faab0e9bc1df80dbeb",
		"svc.example.v1.hello",
	)
)
