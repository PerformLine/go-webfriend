.PHONY: build ui docs

PKGS           := $(shell go list ./... 2> /dev/null | grep -v '/vendor')
LOCALS         := $(shell find . -type f -name '*.go' -not -path "./vendor*/*")
WEBFRIEND_BIN  ?= webfriend-$(shell go env GOOS)-$(shell go env GOARCH)
CGO_ENABLED    ?= 0

.EXPORT_ALL_VARIABLES:
GO111MODULE  = on

all: fmt deps autodoc build docs

fmt:
	@go list github.com/mjibson/esc || go get github.com/mjibson/esc/...
	@go list golang.org/x/tools/cmd/goimports || go get golang.org/x/tools/cmd/goimports
	gofmt -w $(LOCALS)
	go vet ./...
	go mod tidy

deps:
	@go list github.com/pointlander/peg || go get github.com/pointlander/peg
	go get ./...

test: fmt deps
	go test $(PKGS)

autodoc:
	go build -i -o bin/webfriend-autodoc cmd/webfriend-autodoc/*.go
	go generate -x ./...

docs: fmt
	cd docs && make

$(WEBFRIEND_BIN):
	go build -tags nocgo --ldflags '-extldflags "-static"' -ldflags '-s' -o bin/$(WEBFRIEND_BIN) cmd/webfriend/*.go
	which webfriend && cp -v bin/$(WEBFRIEND_BIN) `which webfriend` || true

build: $(WEBFRIEND_BIN)
