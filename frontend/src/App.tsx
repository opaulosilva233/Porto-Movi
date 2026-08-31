import { useState, useEffect } from 'react';
import { api } from './services/api';
import { ApiResponse, HealthCheckData } from './types';
import { 
  Server, 
  Layers, 
  Terminal, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  ExternalLink,
  Code2,
  ShieldCheck,
  Cpu
} from 'lucide-react';

export default function App() {
  const [healthData, setHealthData] = useState<HealthCheckData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string>('');

  const checkHealth = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get<ApiResponse<HealthCheckData>>('/health');
      if (response.data.success && response.data.data) {
        setHealthData(response.data.data);
      } else {
        setError(response.data.message || 'Erro inesperado na resposta da API');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(`Não foi possível conectar à API do backend (${err.message}). Certifique-se de que os containers Docker estão em execução.`);
      } else {
        setError('Erro ao conectar ao servidor backend.');
      }
    } finally {
      setIsLoading(false);
      setLastChecked(new Date().toLocaleTimeString());
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col justify-between selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 font-bold text-slate-950">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-white">Starter Template</span>
              <span className="text-xs ml-2 px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 font-mono border border-cyan-500/20">v1.0.0</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="hidden sm:inline-block text-slate-400">Decoupled Monorepo</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" /> Docker Ready
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-12 flex-1 w-full space-y-10">
        {/* Hero Section */}
        <section className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800 text-cyan-300 text-xs font-medium mb-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            Template Base Pronto para Novos Projetos Web
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            Desenvolvimento Web Desacoplado & de Alto Desempenho
          </h1>
          <p className="text-base text-slate-400 leading-relaxed">
            Ambiente completo orquestrado via Docker com <strong className="text-slate-200">Laravel 11 API</strong> no backend, <strong className="text-slate-200">React + Vite + TypeScript</strong> no frontend e base de dados <strong className="text-slate-200">MySQL 8.0</strong>.
          </p>
        </section>

        {/* Live System Status Card */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Server className="w-5 h-5 text-cyan-400" />
                Diagnóstico & Conectividade do Ambiente
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Verificação em tempo real da comunicação entre Frontend (Vite), Backend (Nginx/PHP) e Base de Dados (MySQL).
              </p>
            </div>
            <button
              onClick={checkHealth}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white font-medium text-xs transition-colors shadow-md shadow-cyan-600/20 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Verificando...' : 'Re-testar Conexão'}
            </button>
          </div>

          {/* Status Metrics */}
          {error ? (
            <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/80 text-red-300 flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold text-sm">Falha de Comunicação com o Backend</div>
                <div className="text-xs text-red-400/90">{error}</div>
                <div className="text-xs text-slate-400 mt-2 font-mono">
                  Dica: Execute <code className="text-cyan-300">make setup</code> ou <code className="text-cyan-300">make logs</code> no terminal.
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Frontend Card */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Frontend SPA</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/50">
                    <CheckCircle2 className="w-3 h-3" /> Ativo
                  </span>
                </div>
                <div className="text-sm font-semibold text-white">React 18 + Vite + TS</div>
                <div className="text-xs text-slate-500 font-mono">Porta: 5173 (Host)</div>
              </div>

              {/* Backend Card */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Backend API</span>
                  {healthData ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/50">
                      <CheckCircle2 className="w-3 h-3" /> Online
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/50">
                      Aguardando...
                    </span>
                  )}
                </div>
                <div className="text-sm font-semibold text-white">
                  Laravel {healthData?.app.laravel_version || '11'} (PHP {healthData?.app.php_version?.split('-')[0] || '8.3'})
                </div>
                <div className="text-xs text-slate-500 font-mono">Porta: 8000 (Nginx)</div>
              </div>

              {/* Database Card */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Base de Dados</span>
                  {healthData?.database.status === 'healthy' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/50">
                      <CheckCircle2 className="w-3 h-3" /> Conectado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/50">
                      Aguardando
                    </span>
                  )}
                </div>
                <div className="text-sm font-semibold text-white">MySQL 8.0</div>
                <div className="text-xs text-slate-500 font-mono">Porta: 3306 (Host)</div>
              </div>
            </div>
          )}

          {lastChecked && (
            <div className="text-[11px] text-slate-500 text-right font-mono">
              Última verificação: {lastChecked}
            </div>
          )}
        </section>

        {/* Quick Start & Makefile Commands */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Makefile Cheatsheet */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              Comandos Essenciais do Makefile
            </h3>
            <div className="space-y-2 font-mono text-xs">
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex justify-between items-center">
                <span className="text-cyan-400">make setup</span>
                <span className="text-slate-400">Inicializa todo o ambiente do zero</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex justify-between items-center">
                <span className="text-cyan-400">make up / make down</span>
                <span className="text-slate-400">Inicia ou encerra os containers</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex justify-between items-center">
                <span className="text-cyan-400">make test</span>
                <span className="text-slate-400">Executa testes (Backend + Frontend)</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex justify-between items-center">
                <span className="text-cyan-400">make lint</span>
                <span className="text-slate-400">Analisa estilo de código (Pint / ESLint)</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex justify-between items-center">
                <span className="text-cyan-400">make shell</span>
                <span className="text-slate-400">Abre terminal no container Laravel</span>
              </div>
            </div>
          </div>

          {/* Architecture Guidelines */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Code2 className="w-4 h-4 text-cyan-400" />
              Estrutura & Boas Práticas
            </h3>
            <ul className="space-y-2.5 text-xs text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">•</span>
                <span><strong>API First:</strong> Backend em Laravel retorna exclusivamente respostas JSON estruturadas.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">•</span>
                <span><strong>Strict Types:</strong> Todo ficheiro PHP deve conter <code>declare(strict_types=1);</code>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">•</span>
                <span><strong>Form Requests & Resources:</strong> Validações e transformações desacopladas dos Controllers.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">•</span>
                <span><strong>Componentização:</strong> React funcional com TypeScript, Tailwind CSS e Axios centralizado.</span>
              </li>
            </ul>
            <div className="pt-2">
              <a
                href="http://localhost:8000/api/health"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
              >
                Abrir JSON de Healthcheck da API <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/60 py-6 text-center text-xs text-slate-500">
        <p>Starter Template para Novos Projetos Web • Licença MIT</p>
      </footer>
    </div>
  );
}
