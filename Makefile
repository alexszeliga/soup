.PHONY: up down status tail clean docker-up docker-down

-include .env
export

# Default ports
DEV_API_PORT ?= 3001
DEV_WEB_PORT ?= 5173

# Log files
API_LOG=server.log
WEB_LOG=web.log

up:
	@echo "Starting Soup services..."
	@nohup pnpm --filter @soup/server dev > $(API_LOG) 2>&1 & echo $$! > .api.pid
	@nohup pnpm --filter @soup/web dev > $(WEB_LOG) 2>&1 & echo $$! > .web.pid
	@echo "API server starting on port $(DEV_API_PORT) (logs: $(API_LOG))"
	@echo "Web dashboard starting on port $(DEV_WEB_PORT) (logs: $(WEB_LOG))"

down:
	@echo "Shutting down Soup services..."
	@# Try killing using PID files if they exist
	@if [ -f .api.pid ]; then kill $$(cat .api.pid) 2>/dev/null && rm .api.pid || true; fi
	@if [ -f .web.pid ]; then kill $$(cat .web.pid) 2>/dev/null && rm .web.pid || true; fi
	@# Robust fallback: kill anything listening on the configured ports
	@echo "Ensuring ports $(DEV_API_PORT) and $(DEV_WEB_PORT) are cleared..."
	@PIDS=$$(lsof -t -i :$(DEV_API_PORT),$(DEV_WEB_PORT) 2>/dev/null); \
	if [ -n "$$PIDS" ]; then \
		echo "Killing remaining PIDs: $$PIDS"; \
		kill -9 $$PIDS 2>/dev/null || true; \
	fi
	@echo "Done."

status:
	@printf "API Server: "
	@lsof -i :$(DEV_API_PORT) -sTCP:LISTEN >/dev/null && echo "RUNNING" || echo "STOPPED"
	@printf "Web App:    "
	@lsof -i :$(DEV_WEB_PORT) -sTCP:LISTEN >/dev/null && echo "RUNNING" || echo "STOPPED"

tail:
	@./scripts/tail-logs.sh

clean:
	@echo "Cleaning up logs and pids..."
	@rm -f $(API_LOG) $(WEB_LOG) .api.pid .web.pid

docker-up: docker-up-go

docker-up-go:
	@docker compose -f docker-compose.go.yml --env-file .env up -d --build

docker-up-legacy:
	@docker compose -f docker-compose.yml --env-file .env up -d --build

docker-up-all:
	@make docker-up-legacy
	@make docker-up-go

docker-down:
	@docker compose -f docker-compose.go.yml down
	@docker compose -f docker-compose.yml down

docker-migrate:
	@docker exec -it soup-go /app/soup-go migrate -old-db /data/soup.db -qb-url ${QB_URL}
