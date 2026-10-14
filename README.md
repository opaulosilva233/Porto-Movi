# Porto Movi

**Os transportes do Porto, num só mapa.**

O Porto Movi é um projeto pessoal de Paulo Silva para explorar os transportes públicos do Porto e da Área Metropolitana: ver onde estão os autocarros, encontrar uma paragem e consultar horários e percursos numa interface simples.

Reúne **STCP, Metro do Porto e UNIR**, com vistas próprias para cada rede, pesquisa, favoritos e um mapa interativo. É um projeto em desenvolvimento, construído com React e Laravel, que evolui à medida que são integradas e validadas novas fontes de dados.

> Projeto independente, sem ligação oficial aos operadores. A informação apresentada depende das fontes disponíveis e distingue horários programados de dados em tempo real.

## O que já faz

- **Mapa interativo** com veículos, paragens, estações e traçados de percursos.
- **STCP em tempo real**, com posição, velocidade, sentido e destino quando disponíveis.
- **Pesquisa** por linha, nome ou código de paragem, conforme os dados de cada rede.
- **Próximas partidas** e horários organizados por linha e destino.
- **Paragens próximas**, mediante autorização de localização no navegador.
- **Favoritos por operador**, guardados no próprio navegador.
- **Tema claro e escuro**, com interface adaptada a computador e telemóvel.

### Estado das integrações

| Funcionalidade | STCP | Metro do Porto | UNIR |
| --- | --- | --- | --- |
| Paragens ou estações no mapa | Sim | Sim | Sim |
| Horários programados | Sim, via GTFS | Sim, via GTFS | Sim, via Q.Horas |
| Consulta de percursos | Sim | Sim | Sim, para os serviços do dia consultado |
| Posições GPS dos veículos | Sim | Não integradas | Não integradas |
| Chegadas em tempo real | Estimativas calculadas a partir do GPS | Quando confirmadas pela fonte | Não integradas |
| Favoritos e pesquisa | Sim | Sim | Sim |

A UNIR utiliza o mesmo painel de paragens e os mesmos cartões de horários da STCP. A vista de autocarros indica a indisponibilidade de GPS; não são criadas posições fictícias a partir dos horários.

## Dados e limitações

### STCP

As posições são obtidas através da plataforma FIWARE do Porto Digital. O GTFS fornece linhas, destinos, paragens, traçados e horários.

Os tempos de chegada são **estimativas do Porto Movi**, calculadas com base na posição do veículo, distância restante no percurso e velocidade. Não são previsões oficiais da STCP nem incluem um modelo de trânsito. Em caso de falha na atualização das posições, a aplicação pode mostrar a última resposta válida, identificada como tal.

### Metro do Porto

As estações, os percursos e os horários são importados do [GTFS oficial do Metro do Porto](https://www.metrodoporto.pt/pages/337). O painel consulta também o serviço GraphQL usado pelo Explore Porto.

Uma partida só é identificada como tempo real quando a resposta da fonte o confirma. As restantes são apresentadas como programadas; supressões são assinaladas quando fornecidas. Esta integração não mostra a posição GPS dos metros.

O endereço GTFS definido no código aponta para uma publicação específica. **É necessário atualizar o feed quando forem publicados novos horários.** A interface avisa quando o calendário importado não abrange o dia consultado.

### UNIR

A integração utiliza os serviços públicos usados pelo [Q.Horas UNIR](https://qhoras.unirmobilidade.pt/): paragens da AMP, horários por dia e percursos por serviço.

Os dados são consultados diretamente, com cache no backend, sem importação manual de GTFS. Atualmente, a integração disponibiliza **horários programados**, sem posições GPS ou previsões de chegada em tempo real. Horas como `24:10` pertencem à madrugada seguinte do dia de serviço; a consulta também considera viagens noturnas do dia anterior.

Os serviços do Q.Horas e do Explore Porto podem mudar ou ficar indisponíveis. A existência de informação numa aplicação de terceiros não significa que exista uma API pública equivalente disponível para este projeto.

O mapa utiliza Leaflet e cartografia OpenStreetMap. Os dados e a cartografia mantêm as condições de utilização das respetivas fontes.

## Executar localmente

É necessário ter **Git, Docker e Docker Compose**. Os comandos abaixo usam Bash; em Windows, podem ser executados no WSL com a integração do Docker ativada. PHP, Composer e Node.js correm nos containers.

```bash
git clone https://github.com/opaulosilva233/Porto-Movi.git
cd Porto-Movi
bash scripts/setup.sh
```

O script cria o `.env` a partir do exemplo, inicia os serviços, instala as dependências, gera a chave Laravel e executa as migrações. Um `.env` existente é preservado.

Depois, importar os dados da STCP e do Metro:

```bash
docker compose exec backend php artisan stcp:import-gtfs
docker compose exec backend php artisan metro:import-gtfs
```

A UNIR não precisa desta etapa. É necessária ligação à Internet para descarregar feeds, consultar as fontes e carregar os mapas.

| Serviço | Endereço local |
| --- | --- |
| Aplicação | [localhost:5173](http://localhost:5173) |
| API | [localhost:8000/api](http://localhost:8000/api) |
| Estado do backend | [localhost:8000/api/health](http://localhost:8000/api/health) |

Estes endereços correspondem às portas definidas no `.env.example`. O ambiente Compose incluído destina-se ao desenvolvimento local.

### Configuração

A configuração fica no ficheiro `.env` da raiz, partilhado com o backend Laravel. As principais opções são:

| Variável | Utilização |
| --- | --- |
| `FRONTEND_PORT` / `NGINX_PORT` | Portas locais da aplicação e da API |
| `VITE_API_BASE_URL` | Endereço da API utilizado pelo navegador |
| `FRONTEND_URL` | Origem do frontend permitida pelo backend |
| `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | Ligação à base de dados |
| `STCP_GTFS_URL` | ZIP GTFS alternativo; vazio procura o recurso mais recente no catálogo configurado |
| `METRO_GTFS_URL` | Endereço do ZIP GTFS do Metro |
| `METRO_DEPARTURES_URL` / `METRO_FEED_PREFIX` | Fonte de partidas do Metro e prefixo dos identificadores |
| `UNIR_API_URL` / `UNIR_STOPS_URL` | Fontes de horários, percursos e paragens UNIR |

As opções do Metro podem ser acrescentadas ao `.env`; os valores predefinidos estão em `backend/config/metro.php`. As restantes fontes estão configuradas em `backend/config/stcp.php` e `backend/config/unir.php`.

### Atualizar horários

Os feeds GTFS **não são atualizados automaticamente**. Para voltar a importar, usar os mesmos comandos de instalação ou indicar um novo ZIP:

```bash
docker compose exec backend php artisan stcp:import-gtfs --url="URL_DO_ZIP_STCP"
docker compose exec backend php artisan metro:import-gtfs --url="URL_DO_ZIP_METRO"
```

A atualização das posições e dos painéis na interface é independente da importação dos horários. A UNIR mantém cache de uma hora para paragens e percursos e de um minuto para horários.

## Desenvolvimento

| Componente | Tecnologias |
| --- | --- |
| Interface | React 18, TypeScript, Vite, Tailwind CSS, Lucide |
| Mapas | Leaflet, OpenStreetMap |
| API | Laravel 11, PHP 8.3 |
| Base de dados | MySQL 8 |
| Ambiente | Docker Compose, Nginx, Node.js 20 |
| Validação | PHPUnit, Laravel Pint, ESLint, TypeScript, GitHub Actions |

```text
backend/
  app/Console/Commands/     Importadores GTFS
  app/Http/Controllers/Api/ Endpoints por operador
  app/Services/            Posições e chegadas STCP
  config/                  Configuração das fontes
  database/migrations/     Estrutura dos dados
  tests/Feature/           Testes da API e das importações
frontend/
  src/components/          Mapa e painéis
  src/services/            Cliente da API
  src/types/               Tipos partilhados no frontend
  src/App.tsx              Interface e navegação entre operadores
docker/                    PHP e Nginx
scripts/                   Preparação do ambiente
```

Comandos úteis, executados na raiz do projeto:

```bash
# Iniciar ou parar o ambiente
docker compose up -d
docker compose down

# Consultar os logs
docker compose logs -f backend frontend nginx

# Aplicar novas migrações
docker compose exec backend php artisan migrate

# Validar backend e frontend
docker compose exec backend php artisan test
docker compose exec backend vendor/bin/pint --test
docker compose exec frontend npm run lint
docker compose exec frontend npm run build
```

Os testes cobrem, entre outros casos, normalização de veículos, calendários e exceções, serviços após a meia-noite, percursos e falhas das fontes externas. O build do frontend verifica os tipos TypeScript e gera os ficheiros de produção.

### Se algo não carregar

- **API indisponível:** verificar `docker compose ps` e os logs do backend e do Nginx.
- **STCP ou Metro sem paragens/horários:** confirmar que as migrações e a importação GTFS foram executadas.
- **Metro sem horários para hoje:** atualizar o feed e voltar a importar.
- **UNIR sem autocarros no mapa:** o GPS ainda não está integrado; usar Paragens para consultar horários e percursos.
- **Paragens próximas indisponíveis:** verificar a permissão de localização do navegador. Fora de `localhost`, esta funcionalidade requer normalmente HTTPS.

## Sobre o projeto

Desenvolvido por **Paulo Silva** como projeto pessoal. O foco é tornar a consulta dos transportes mais prática e continuar a melhorar a aplicação com dados verificáveis. A cobertura de tempo real, sobretudo na UNIR, continua dependente do acesso a fontes adequadas.

Sugestões e problemas podem ser registados nas [issues do repositório](https://github.com/opaulosilva233/Porto-Movi/issues). Ao reportar um problema com transportes, indicar o operador, a linha, a paragem e a data/hora ajuda a reproduzir a situação.

## Licença

O código está disponível sob a [licença MIT](LICENSE). Esta licença não substitui as condições de utilização dos dados de transporte ou da cartografia.
