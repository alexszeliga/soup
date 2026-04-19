.PHONY: up down status tail clean docker-up docker-down docker-migrate

-include .env
export

# Default ports
DEV_WEB_PORT ?= 5173

# Log files
WEB_LOG=web.log

up:
	@echo "Starting Soup services..."
	@nohup pnpm --filter @soup/web dev > $(WEB_LOG) 2>&1 & echo $$! > .web.pid
	@echo "Web dashboard starting on port $(DEV_WEB_PORT) (logs: $(WEB_LOG))"
	@echo "Note: API server should be started separately (e.g., make docker-up-go)"

	down:
	@echo "Shutting down Soup services..."
	@# Try killing using PID files if they exist
	@if [ -f .web.pid ]; then kill $$(cat .web.pid) 2>/dev/null && rm .web.pid || true; fi
	@# Robust fallback: kill anything listening on the configured ports
	@echo "Ensuring port $(DEV_WEB_PORT) is cleared..."
	@PIDS=$$(lsof -t -i :$(DEV_WEB_PORT) 2>/dev/null); \
	if [ -n "$$PIDS" ]; then \
		echo "Killing remaining PIDs: $$PIDS"; \
		kill -9 $$PIDS 2>/dev/null || true; \
	fi
	@echo "Done."

	status:
	@printf "Web App:    "
	@lsof -i :$(DEV_WEB_PORT) -sTCP:LISTEN >/dev/null && echo "RUNNING" || echo "STOPPED"
	@echo "API Server: Check 'docker ps' for soup-go container status"

	tail:
	@echo "Viewing web logs..."
	@tail -f $(WEB_LOG) 2>/dev/null || echo "No web log found. Use 'docker logs soup-go' for API logs."

	clean:
	@echo "Cleaning up logs and pids..."
	@rm -f $(WEB_LOG) .web.pid

docker-up: docker-up-go

docker-up-go:
	@docker compose -f docker-compose.go.yml --env-file .env up -d --build





docker-down:
	@docker compose -f docker-compose.go.yml down

docker-migrate:
	@docker exec -it soup-go /app/soup-go migrate -old-db /data/soup.db -qb-url ${QB_URL}
