# 🤖 Agent Skills & Development Guidelines

Este documento estabelece as diretrizes arquiteturais, padrões de código, comandos e regras de execução estritas para **Agentes de Inteligência Artificial (AI Agents)** e Engenheiros de Software que desenvolvam ou iterem sobre este repositório.

---

## 🏛️ 1. Arquitetura & Stack Tecnológica

O projeto adota o padrão **Decoupled Monorepo (Headless Architecture)**:

- **Backend**: API RESTful construída em **Laravel 11 (PHP 8.3)** no diretório `backend/`.
- **Frontend**: Single Page Application (SPA) em **React 18 + Vite + TypeScript + Tailwind CSS** no diretório `frontend/`.
- **Infraestrutura**: Orquestração via **Docker Compose** com Nginx Alpine (reverse proxy), PHP 8.3 FPM, Node 20 e MySQL 8.0.
- **Automação**: Gerenciamento de ciclo de vida via **Makefile** e scripts idempotentes.

> 🔒 **Princípio Fundamental:** O Backend e o Frontend comunicam-se exclusivamente via rede HTTP/JSON através de endpoints REST tipados. Nenhuma renderização monolítica Blade ou acoplamento direto deve existir entre as camadas.

---

## ⚙️ 2. Regras e Convenções do Backend (Laravel / PHP 8.3)

1. **Tipagem Estrita Obrigatória (Strict Types)**:
   - Todo ficheiro PHP criado ou modificado deve conter obrigatoriamente no topo:
     ```php
     <?php

     declare(strict_types=1);
     ```
   - Todos os métodos, funções e propriedades devem possuir type-hints e return types explícitos.

2. **Validação Desacoplada (Form Requests)**:
   - **NUNCA** validar requisições diretamente dentro do método do Controller (`$request->validate(...)`).
   - Criar sempre classes dedicadas estendendo `Illuminate\Foundation\Http\FormRequest`.

3. **Transformação de Respostas (API Resources)**:
   - **NUNCA** retornar instâncias puras de Eloquent Models diretamente dos Controllers.
   - Encapsular todas as respostas em `JsonResource` ou `ResourceCollection`.

4. **Padronização do Envelope JSON**:
   - Todas as respostas de sucesso devem respeitar o formato:
     ```json
     {
       "success": true,
       "data": { ... },
       "message": "Mensagem descritiva da operação"
     }
     ```
   - Respostas de erro devem usar códigos HTTP semânticos (ex: 400, 401, 403, 404, 422, 500) com:
     ```json
     {
       "success": false,
       "message": "Descrição do erro",
       "errors": { ... }
     }
     ```

5. **Autenticação & Autorização**:
   - Utilizar **Laravel Sanctum** para autenticação via tokens de API ou cookies SPA stateful.
   - Proteger rotas privadas com middleware `auth:sanctum`.
   - Utilizar Policies para autorização baseada em permissões/roles.

6. **Estilo & Formatação**:
   - Seguir os padrões do Laravel Pint (`./vendor/bin/pint`).

---

## ⚛️ 3. Regras e Convenções do Frontend (React + TypeScript + Vite)

1. **TypeScript Estrito & React Moderno**:
   - Usar TypeScript com `strict: true`.
   - Utilizar apenas componentes funcionais com Hooks. Nunca usar componentes baseados em classes.
   - Definir interfaces e tipos para todos os payloads de API em `src/types/`.

2. **Estilização com Tailwind CSS**:
   - Utilizar classes utilitárias do Tailwind CSS.
   - Garantir suporte a layout responsivo (mobile-first) e estados interativos (hover, focus, disabled).

3. **Comunicação Centralizada com a API**:
   - Nunca usar `fetch` ou instâncias avulsas de Axios nos componentes.
   - Utilizar o cliente HTTP centralizado em `src/services/api.ts` que consome `import.meta.env.VITE_API_BASE_URL`.

4. **Tratamento de Estados Assíncronos**:
   - Todo componente com consumo de dados deve tratar explicitamente:
     - Estado de carregamento (`isLoading` / skeletons).
     - Estado de erro com feedback visual claro.
     - Estado vazio (`empty state`).

5. **Estrutura de Pastas**:
   ```
   frontend/src/
   ├── components/     # Componentes reutilizáveis de UI
   ├── contexts/       # Contextos globais (Auth, Theme)
   ├── hooks/          # Custom hooks reutilizáveis
   ├── pages/          # Páginas e views principais
   ├── services/       # Cliente HTTP (api.ts) e chamadas a endpoints
   ├── types/          # Tipos e interfaces TypeScript
   └── utils/          # Funções utilitárias auxiliares
   ```

---

## 🐳 4. Execução de Comandos via Docker

O host da máquina pode não ter PHP, Composer ou Node instalados. **Todos os comandos de desenvolvimento devem ser executados através dos containers Docker** ou via `make`:

| Ação Desejada | Comando via Makefile | Comando Docker Direto |
| :--- | :--- | :--- |
| **Inicializar projeto** | `make setup` | `bash scripts/setup.sh` |
| **Subir ambiente** | `make up` | `docker compose up -d` |
| **Parar ambiente** | `make down` | `docker compose down` |
| **Instalar pacotes PHP** | `make install` | `docker compose exec backend composer require <pkg>` |
| **Executar Artisan** | - | `docker compose exec backend php artisan <cmd>` |
| **Executar Migrações** | `make migrate` | `docker compose exec backend php artisan migrate` |
| **Recriar DB + Seed** | `make fresh` | `docker compose exec backend php artisan migrate:fresh --seed` |
| **Executar Testes** | `make test` | `docker compose exec backend php artisan test` |
| **Executar Linter** | `make lint` | `docker compose exec backend ./vendor/bin/pint --test` |
| **Instalar pacotes NPM** | `make install` | `docker compose exec frontend npm install <pkg>` |
| **Build do Frontend** | - | `docker compose exec frontend npm run build` |
| **Terminal interativo** | `make shell` | `docker compose exec backend sh` |

---

## 🚫 5. O Que o Agente NÃO DEVE Fazer

1. ❌ **NÃO** executar `composer`, `php artisan` ou `npm` diretamente no terminal do host (usar sempre `docker compose exec` ou alvos do `Makefile`).
2. ❌ **NÃO** remover `declare(strict_types=1);` de nenhum arquivo PHP.
3. ❌ **NÃO** escrever validações com `$request->validate()` dentro de Controllers (usar Form Requests).
4. ❌ **NÃO** retornar Models do Eloquent diretamente sem encapsulamento em API Resources.
5. ❌ **NÃO** hardcodar URLs ou portas na interface (usar variáveis de ambiente `VITE_*`).
6. ❌ **NÃO** commitar ficheiros `.env` ou secrets reais para o repositório.
7. ❌ **NÃO** alterar a estrutura de portas padrão ou nomes de serviços sem atualizar o `Makefile`, `.env.example` e documentação correspondente.
8. ❌ **NÃO** introduzir ferramentas pesadas de infraestrutura (Redis, RabbitMQ, Kafka, Kubernetes) a menos que explicitamente solicitado pelo utilizador.

---

## ✅ 6. Checklist de Validação Obrigatória

Antes de finalizar qualquer tarefa, certifique-se de validar os seguintes pontos:

- [ ] `declare(strict_types=1);` está presente no topo de todos os ficheiros PHP criados/editados.
- [ ] O código segue a tipagem estrita no PHP e TypeScript (`strict: true`).
- [ ] Endpoints e Controllers utilizam Form Requests e API Resources.
- [ ] A suite de testes do backend passa com sucesso (`make test-backend`).
- [ ] O linter do backend passa sem apontamentos (`make lint-backend`).
- [ ] O linter do frontend e a compilação do bundle passam com sucesso (`make lint-frontend` e `npm run build`).
- [ ] Nenhum arquivo temporário, secret ou dependência local foi adicionado fora do `.gitignore`.
