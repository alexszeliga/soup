.PHONY: up down status tail clean

# Default ports
API_PORT=3001
WEB_PORT=5173

# Log files
API_LOG=server.log
WEB_LOG=web.log

up:
	@echo "Starting Soup services..."
	@nohup pnpm --filter @soup/server dev > $(API_LOG) 2>&1 & echo $$! > .api.pid
	@nohup pnpm --filter @soup/web dev > $(WEB_LOG) 2>&1 & echo $$! > .web.pid
	@echo "API server starting on port $(API_PORT) (logs: $(API_LOG))"
	@echo "Web dashboard starting on port $(WEB_PORT) (logs: $(WEB_LOG))"

down:
	@echo "Shutting down Soup services..."
	@lsof -t -i :$(API_PORT),$(WEB_PORT) | xargs -r kill -9
	@rm -f .api.pid .web.pid
	@echo "Done."

status:
	@printf "API Server: "
	@lsof -i :$(API_PORT) -sTCP:LISTEN >/dev/null && echo "RUNNING" || echo "STOPPED"
	@printf "Web App:    "
	@lsof -i :$(WEB_PORT) -sTCP:LISTEN >/dev/null && echo "RUNNING" || echo "STOPPED"

tail:
	@./scripts/tail-logs.sh

clean:
	@echo "Cleaning up logs and pids..."
	@rm -f $(API_LOG) $(WEB_LOG) .api.pid .web.pid
