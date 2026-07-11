BUN ?= bun
ELECTRON_PROXY_ENV = ELECTRON_GET_USE_PROXY=1 HTTPS_PROXY="$${HTTPS_PROXY:-$${https_proxy:-}}" HTTP_PROXY="$${HTTP_PROXY:-$${http_proxy:-}}"

.DEFAULT_GOAL := help

.PHONY: help preflight install build typecheck test test-watch test-dist test-electron verify package-mac smoke-packaged deploy clean

help:
	@printf "Available targets:\n"
	@printf "  make install      Install dependencies from the frozen Bun lockfile\n"
	@printf "  make build        Build VoiceReader\n"
	@printf "  make typecheck    Run TypeScript type checks\n"
	@printf "  make test         Run Vitest suites\n"
	@printf "  make test-watch   Run Vitest in watch mode\n"
	@printf "  make test-dist    Check built application contracts\n"
	@printf "  make test-electron Prove addon and SQLite behavior under Electron\n"
	@printf "  make verify       Run frozen install and the complete local verification gate\n"
	@printf "  make package-mac  Build the local macOS application artifact\n"
	@printf "  make smoke-packaged Smoke-test the final packaged application\n"
	@printf "  make deploy       Verify, package, smoke, and safely install VoiceReader\n"
	@printf "  make clean        Remove generated output and TypeScript incremental state\n"

preflight:
	$(BUN) run check:toolchain

install: preflight
	$(ELECTRON_PROXY_ENV) $(BUN) install --frozen-lockfile
	$(BUN) run check:install

build:
	$(BUN) run build

typecheck:
	$(BUN) run typecheck

test:
	$(BUN) run test

test-watch:
	$(BUN) run test:watch

test-dist:
	$(BUN) run test:dist

test-electron:
	$(BUN) run test:electron

verify: install
	$(BUN) run clean
	$(BUN) run build
	$(BUN) run clean
	$(BUN) run build
	$(BUN) run test:electron
	$(BUN) run typecheck
	$(BUN) run test
	$(BUN) run test:dist -- --no-build

package-mac:
	$(BUN) run package:mac

smoke-packaged:
	$(BUN) run smoke:packaged

deploy:
	$(BUN) run deploy:mac

clean:
	$(BUN) run clean
