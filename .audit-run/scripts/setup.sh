#!/usr/bin/env bash

# ==============================================================================
# Starter Template Bootstrap / Setup Script
# ==============================================================================
set -e

# ANSI Color Codes
COLOR_RESET="\033[0m"
COLOR_BOLD="\033[1m"
COLOR_CYAN="\033[36m"
COLOR_GREEN="\033[32m"
COLOR_YELLOW="\033[33m"
COLOR_RED="\033[31m"
COLOR_GRAY="\033[90m"

echo -e "${COLOR_CYAN}${COLOR_BOLD}"
echo "============================================================"
echo "    🚀 Starter Template: Inicialização do Ambiente         "
echo "============================================================"
echo -e "${COLOR_RESET}"

# ------------------------------------------------------------------------------
# 1. Verificação de Pré-requisitos
# ------------------------------------------------------------------------------
echo -e "${COLOR_CYAN}--> [1/6] Verificando pré-requisitos do sistema...${COLOR_RESET}"

if ! command -v docker >/dev/null 2>&1; then
    echo -e "${COLOR_RED}❌ Erro: O comando 'docker' não foi encontrado.${COLOR_RESET}"
    echo -e "Por favor, instala o Docker Desktop ou Docker Engine: https://docs.docker.com/get-docker/"
    exit 1
fi

# Detect docker compose syntax
if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
else
    echo -e "${COLOR_RED}❌ Erro: 'docker compose' não está disponível.${COLOR_RESET}"
    echo -e "Instala o plugin Docker Compose v2 ou superior."
    exit 1
fi

# Check if Docker daemon is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${COLOR_RED}❌ Erro: O serviço/daemon do Docker não está a correr.${COLOR_RESET}"
    echo -e "Inicia o Docker Desktop ou o daemon do Docker e tenta novamente."
    exit 1
fi

echo -e "${COLOR_GREEN}✓ Docker e Docker Compose estão operacionais.${COLOR_RESET}"

# ------------------------------------------------------------------------------
# 2. Configuração de Variáveis de Ambiente (.env)
# ------------------------------------------------------------------------------
echo -e "\n${COLOR_CYAN}--> [2/6] Configurando ficheiro de ambiente (.env)...${COLOR_RESET}"

if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${COLOR_GREEN}✓ Ficheiro .env criado com sucesso a partir de .env.example.${COLOR_RESET}"
    else
        echo -e "${COLOR_YELLOW}⚠️ Aviso: .env.example não encontrado. A criar .env básico.${COLOR_RESET}"
        touch .env
    fi
else
    echo -e "${COLOR_GRAY}✓ Ficheiro .env já existente. Mantendo configurações existentes.${COLOR_RESET}"
fi

# Load variables safely from .env if present for summary
if [ -f .env ]; then
    NGINX_PORT=$(grep -E '^NGINX_PORT=' .env | cut -d '=' -f2 | tr -d ' "\r')
    FRONTEND_PORT=$(grep -E '^FRONTEND_PORT=' .env | cut -d '=' -f2 | tr -d ' "\r')
    DB_PORT=$(grep -E '^DB_PORT=' .env | cut -d '=' -f2 | tr -d ' "\r')
    DB_DATABASE=$(grep -E '^DB_DATABASE=' .env | cut -d '=' -f2 | tr -d ' "\r')
fi

NGINX_PORT=${NGINX_PORT:-8000}
FRONTEND_PORT=${FRONTEND_PORT:-5173}
DB_PORT=${DB_PORT:-3306}
DB_DATABASE=${DB_DATABASE:-app_database}

# ------------------------------------------------------------------------------
# 3. Construção e Inicialização dos Containers Docker
# ------------------------------------------------------------------------------
echo -e "\n${COLOR_CYAN}--> [3/6] Construindo e iniciando containers Docker...${COLOR_RESET}"
$DOCKER_COMPOSE up -d --build

# ------------------------------------------------------------------------------
# 4. Aguardar prontidão da Base de Dados (MySQL)
# ------------------------------------------------------------------------------
echo -e "\n${COLOR_CYAN}--> [4/6] Aguardando prontidão da base de dados...${COLOR_RESET}"
MAX_TRIES=30
COUNTER=0

while [ $COUNTER -lt $MAX_TRIES ]; do
    DB_STATUS=$($DOCKER_COMPOSE ps --format json db 2>/dev/null | grep -o '"Health":"[^"]*"' | cut -d':' -f2 | tr -d '"' || true)
    if [ "$DB_STATUS" = "healthy" ]; then
        echo -e "${COLOR_GREEN}✓ Base de dados MySQL pronta para conexões.${COLOR_RESET}"
        break
    fi
    COUNTER=$((COUNTER + 1))
    echo -e "${COLOR_GRAY}  Aguardando inicialização do MySQL ($COUNTER/$MAX_TRIES)...${COLOR_RESET}"
    sleep 2
done

if [ $COUNTER -eq $MAX_TRIES ]; then
    echo -e "${COLOR_YELLOW}⚠️ Aviso: Timeout ao aguardar healthcheck do MySQL. Continuando...${COLOR_RESET}"
fi

# ------------------------------------------------------------------------------
# 5. Instalação e Preparação da Aplicação (Backend & Frontend)
# ------------------------------------------------------------------------------
echo -e "\n${COLOR_CYAN}--> [5/6] Preparando aplicações e dependências...${COLOR_RESET}"

# Backend / Laravel Setup
if [ -f backend/composer.json ]; then
    # Empty runtime directories are not preserved when a project is copied or
    # downloaded without Git metadata. Laravel needs them during Composer's
    # post-autoload scripts, so create them before running composer install.
    echo -e "${COLOR_GRAY}  Preparando diretórios de runtime do Laravel...${COLOR_RESET}"
    mkdir -p \
        backend/bootstrap/cache \
        backend/storage/app/public \
        backend/storage/framework/cache/data \
        backend/storage/framework/sessions \
        backend/storage/framework/testing \
        backend/storage/framework/views \
        backend/storage/logs
    chmod -R ug+rwX backend/bootstrap/cache backend/storage

    echo -e "${COLOR_GRAY}  Instalando dependências PHP (Composer)...${COLOR_RESET}"
    $DOCKER_COMPOSE exec backend composer install --no-interaction --prefer-dist

    # The root .env is mounted at /var/www/backend/.env by Docker Compose.
    # Generate APP_KEY there if it has not been generated yet.
    if [ -f .env ] && grep -q '^APP_KEY=$' .env; then
        echo -e "${COLOR_GRAY}  Gerando chave de aplicação do Laravel (APP_KEY)...${COLOR_RESET}"
        $DOCKER_COMPOSE exec backend php artisan key:generate --ansi
    fi

    echo -e "${COLOR_GRAY}  Executando migrações da base de dados...${COLOR_RESET}"
    $DOCKER_COMPOSE exec backend php artisan migrate --force
    echo -e "${COLOR_GREEN}✓ Backend configurado com sucesso.${COLOR_RESET}"
else
    echo -e "${COLOR_GRAY}  backend/composer.json não encontrado. Pulando etapa de Composer.${COLOR_RESET}"
fi

# Frontend / React Setup
if [ -f frontend/package.json ]; then
    echo -e "${COLOR_GRAY}  Instalando dependências Node do Frontend...${COLOR_RESET}"
    $DOCKER_COMPOSE exec frontend npm install
    echo -e "${COLOR_GREEN}✓ Frontend configurado com sucesso.${COLOR_RESET}"
else
    echo -e "${COLOR_GRAY}  frontend/package.json não encontrado. Pulando etapa de NPM.${COLOR_RESET}"
fi

# ------------------------------------------------------------------------------
# 6. Resumo e Conclusão
# ------------------------------------------------------------------------------
echo -e "\n${COLOR_GREEN}${COLOR_BOLD}============================================================${COLOR_RESET}"
echo -e "${COLOR_GREEN}${COLOR_BOLD}    ✨ Setup concluído com sucesso! Ambiente pronto!       ${COLOR_RESET}"
echo -e "${COLOR_GREEN}${COLOR_BOLD}============================================================${COLOR_RESET}"
echo ""
echo -e "  ${COLOR_BOLD}Serviços disponíveis:${COLOR_RESET}"
echo -e "  --------------------------------------------------------"
echo -e "  🌐 ${COLOR_BOLD}Frontend (React/Vite):${COLOR_RESET}  ${COLOR_CYAN}http://localhost:${FRONTEND_PORT}${COLOR_RESET}"
echo -e "  🔌 ${COLOR_BOLD}Backend API (Nginx):${COLOR_RESET}    ${COLOR_CYAN}http://localhost:${NGINX_PORT}${COLOR_RESET}"
echo -e "  🩺 ${COLOR_BOLD}Healthcheck Endpoint:${COLOR_RESET}   ${COLOR_CYAN}http://localhost:${NGINX_PORT}/api/health${COLOR_RESET}"
echo -e "  🗄️  ${COLOR_BOLD}MySQL Database:${COLOR_RESET}         ${COLOR_CYAN}localhost:${DB_PORT}${COLOR_RESET} (DB: ${DB_DATABASE})"
echo ""
echo -e "  ${COLOR_BOLD}Comandos úteis para o dia-a-dia:${COLOR_RESET}"
echo -e "  --------------------------------------------------------"
echo -e "  ${COLOR_CYAN}make up${COLOR_RESET}             -> Iniciar containers"
echo -e "  ${COLOR_CYAN}make logs${COLOR_RESET}           -> Ver logs em tempo real"
echo -e "  ${COLOR_CYAN}make shell${COLOR_RESET}          -> Acessar terminal do backend"
echo -e "  ${COLOR_CYAN}make test${COLOR_RESET}           -> Executar suite de testes"
echo -e "  ${COLOR_CYAN}make lint${COLOR_RESET}           -> Verificar estilo de código"
echo -e "  ${COLOR_CYAN}make down${COLOR_RESET}           -> Parar containers"
echo ""
