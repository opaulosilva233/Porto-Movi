# Load environment variables if .env exists
ifneq (,$(wildcard ./.env))
    include .env
    export
endif

.DEFAULT_GOAL := help

# Terminal Colors
COLOR_RESET   = \033[0m
COLOR_INFO    = \033[36m
COLOR_SUCCESS = \033[32m
COLOR_WARNING = \033[33m
COLOR_ERROR   = \033[31m

.PHONY: help setup up down restart build logs ps shell shell-backend shell-frontend install test test-backend test-frontend lint lint-backend lint-frontend migrate fresh seed

help: ## Exibe a lista de comandos disponíveis
	@echo ""
	@echo "Comandos disponíveis:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""

setup: ## Prepara o ambiente completo (cria .env, sobe containers, instala dependências e executa migrações)
	@if [ -f scripts/setup.sh ]; then \
		bash scripts/setup.sh; \
	else \
		echo "$(COLOR_INFO)--> A verificar ficheiro .env...$(COLOR_RESET)"; \
		if [ ! -f .env ]; then cp .env.example .env && echo "$(COLOR_SUCCESS)Ficheiro .env criado.$(COLOR_RESET)"; fi; \
		echo "$(COLOR_INFO)--> A subir containers Docker...$(COLOR_RESET)"; \
		docker compose up -d --build; \
		if [ -f backend/composer.json ]; then \
			echo "$(COLOR_INFO)--> A preparar Backend (Composer & Migrations)...$(COLOR_RESET)"; \
			mkdir -p backend/bootstrap/cache backend/storage/app/public backend/storage/framework/cache/data backend/storage/framework/sessions backend/storage/framework/testing backend/storage/framework/views backend/storage/logs; \
			chmod -R ug+rwX backend/bootstrap/cache backend/storage; \
			docker compose exec backend composer install --no-interaction; \
			docker compose exec backend php artisan key:generate --ansi; \
			docker compose exec backend php artisan migrate --force; \
		fi; \
		if [ -f frontend/package.json ]; then \
			echo "$(COLOR_INFO)--> A instalar dependências do Frontend...$(COLOR_RESET)"; \
			docker compose exec frontend npm install; \
		fi; \
		echo "$(COLOR_SUCCESS)Setup concluído com sucesso!$(COLOR_RESET)"; \
	fi

up: ## Inicia todos os containers Docker em background
	docker compose up -d

down: ## Para e remove todos os containers e redes
	docker compose down

restart: ## Reinicia todos os containers Docker
	docker compose restart

build: ## Reconstrói as imagens Docker
	docker compose build

logs: ## Exibe os logs dos containers em tempo real
	docker compose logs -f

ps: ## Lista o estado e saúde dos containers
	docker compose ps

shell: shell-backend ## Acede ao terminal interativo do backend (padrão)

shell-backend: ## Acede ao terminal interativo do container Backend (PHP)
	docker compose exec backend sh

shell-frontend: ## Acede ao terminal interativo do container Frontend (Node)
	docker compose exec frontend sh

install: ## Instala dependências de backend e frontend dentro dos containers
	@echo "$(COLOR_INFO)--> Instalando dependências do Backend...$(COLOR_RESET)"
	@if [ -f backend/composer.json ]; then \
		docker compose exec backend composer install; \
	fi
	@echo "$(COLOR_INFO)--> Instalando dependências do Frontend...$(COLOR_RESET)"
	@if [ -f frontend/package.json ]; then \
		docker compose exec frontend npm install; \
	fi

test: test-backend test-frontend ## Executa todas as suites de testes (backend e frontend)

test-backend: ## Executa a suite de testes no Backend (Laravel / Pest / PHPUnit)
	@if [ -f backend/composer.json ]; then \
		docker compose exec backend php artisan test; \
	else \
		echo "$(COLOR_WARNING)backend/composer.json não encontrado.$(COLOR_RESET)"; \
	fi

test-frontend: ## Executa os testes no Frontend (se configurado)
	@if [ -f frontend/package.json ]; then \
		docker compose exec frontend npm test --if-present; \
	else \
		echo "$(COLOR_WARNING)frontend/package.json não encontrado.$(COLOR_RESET)"; \
	fi

lint: lint-backend lint-frontend ## Executa linters e verificações de estilo no backend e frontend

lint-backend: ## Executa a verificação de estilo de código no Backend (Laravel Pint)
	@if [ -f backend/composer.json ]; then \
		docker compose exec backend ./vendor/bin/pint --test || docker compose exec backend vendor/bin/pint; \
	else \
		echo "$(COLOR_WARNING)backend/composer.json não encontrado.$(COLOR_RESET)"; \
	fi

lint-frontend: ## Executa o linter no Frontend (ESLint)
	@if [ -f frontend/package.json ]; then \
		docker compose exec frontend npm run lint --if-present; \
	else \
		echo "$(COLOR_WARNING)frontend/package.json não encontrado.$(COLOR_RESET)"; \
	fi

migrate: ## Executa as migrações pendentes da base de dados
	docker compose exec backend php artisan migrate

fresh: ## Recria a base de dados do zero e executa os seeders (migrate:fresh --seed)
	docker compose exec backend php artisan migrate:fresh --seed

seed: ## Executa os seeders da base de dados no Laravel
	docker compose exec backend php artisan db:seed
