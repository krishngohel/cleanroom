.PHONY: dev prod stop pull-model demo test test-server lint build clean help

# ── Development stack ─────────────────────────────────────────────────────────
dev:			## Start full development stack (hot-reload)
	docker compose up -d --build
	@echo ""
	@echo "Stack running:"
	@echo "  Dashboard:  http://localhost:5173"
	@echo "  API docs:   http://localhost:8000/docs"
	@echo "  Grafana:    http://localhost:3001  (admin / admin)"
	@echo "  Prometheus: http://localhost:9090"
	@echo ""
	@echo "Default login: admin / admin  (change immediately in production)"
	@echo "Run 'make pull-model' to download the default AI model."

prod:			## Start production stack
	docker compose -f docker-compose.prod.yml up -d

stop:			## Stop all services
	docker compose down

logs:			## Follow server logs
	docker compose logs -f server

# ── Model management ──────────────────────────────────────────────────────────
pull-model:		## Pull default Llama 3.1 8B model into Ollama (~5GB)
	@echo "Pulling llama3.1:8b — this downloads ~5GB and runs once."
	docker compose exec ollama ollama pull llama3.1:8b
	@echo "Model ready."

pull-model-70b:		## Pull Llama 3.1 70B (flagship, requires ~40GB VRAM)
	docker compose exec ollama ollama pull llama3.1:70b

# ── Testing ───────────────────────────────────────────────────────────────────
test: test-server	## Run all tests

test-server:		## Run server unit tests
	cd server && pytest tests/ -v \
		--ignore=tests/test_integration.py \
		--cov=src --cov-report=term-missing

lint:			## Run linters
	cd server && ruff check src/ tests/

build:			## Build Docker images without starting
	docker compose build

# ── Utilities ─────────────────────────────────────────────────────────────────
demo:			## Run end-to-end demo (stack must be running)
	python scripts/demo.py

gen-certs:		## Generate self-signed TLS certificates
	bash scripts/gen_certs.sh

clean:			## Remove containers, volumes, and build artifacts
	docker compose down -v
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true

# ── Help ──────────────────────────────────────────────────────────────────────
help:			## Show this help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
