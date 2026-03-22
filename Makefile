.DEFAULT_GOAL := help

.PHONY: help build up down

help:
	@printf "\nMyConcierge Commands\n\n"
	@printf "  \033[36m%-10s\033[0m %s\n" "help" "Show available make targets"
	@printf "  \033[36m%-10s\033[0m %s\n" "build" "Build assistant-api, assistant-worker, and gateway-web Docker images"
	@printf "  \033[36m%-10s\033[0m %s\n" "up" "Start assistant-api, assistant-worker, gateway-web, and swagger with Docker Compose"
	@printf "  \033[36m%-10s\033[0m %s\n" "down" "Stop Docker Compose services"
	@printf "\n"

build:
	docker compose build assistant-api assistant-worker gateway-web

up:
	docker compose up --build assistant-api assistant-worker gateway-web swagger

down:
	docker compose down --remove-orphans
