module github.com/jmbarzee/temporal-architect/tools/lsp

go 1.25.4

toolchain go1.25.11

require (
	github.com/jmbarzee/temporal-architect/tools/spec v0.0.0-00010101000000-000000000000
	github.com/spf13/cobra v1.10.2
	github.com/tliron/commonlog v0.2.18
	github.com/tliron/glsp v0.2.3-0.20250617204849-59d6e3155c81
	go.temporal.io/api v1.62.13
)

require (
	github.com/stretchr/testify v1.10.0 // indirect
	google.golang.org/protobuf v1.36.11 // indirect
)

require (
	github.com/aymanbagabas/go-osc52/v2 v2.0.1 // indirect
	github.com/cpuguy83/go-md2man/v2 v2.0.6 // indirect
	github.com/gorilla/websocket v1.5.3 // indirect
	github.com/iancoleman/strcase v0.3.0 // indirect
	github.com/inconshreveable/mousetrap v1.1.0 // indirect
	github.com/lucasb-eyer/go-colorful v1.2.0 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/mattn/go-runewidth v0.0.14 // indirect
	github.com/muesli/termenv v0.15.2 // indirect
	github.com/petermattis/goid v0.0.0-20180202154549-b0b1615b78e5 // indirect
	github.com/pkg/errors v0.9.1 // indirect
	github.com/rivo/uniseg v0.2.0 // indirect
	github.com/russross/blackfriday/v2 v2.1.0 // indirect
	github.com/sasha-s/go-deadlock v0.3.1 // indirect
	github.com/segmentio/ksuid v1.0.4 // indirect
	github.com/sourcegraph/jsonrpc2 v0.2.0 // indirect
	github.com/spf13/pflag v1.0.9 // indirect
	github.com/tliron/kutil v0.3.25 // indirect
	go.yaml.in/yaml/v3 v3.0.4 // indirect
	golang.org/x/crypto v0.48.0 // indirect
	golang.org/x/sys v0.41.0 // indirect
	golang.org/x/term v0.40.0 // indirect
)

replace github.com/tliron/glsp => github.com/jmbarzee/glsp v0.0.0-20260211184817-15faee801506

replace github.com/jmbarzee/temporal-architect/tools/spec => ../spec
