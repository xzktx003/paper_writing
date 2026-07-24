import { useEffect, useState, type ReactNode } from 'react';
import {
  evaluateDeploymentCompatibility,
  type DeploymentCompatibility,
  type HealthResponse,
} from '../../api/deploymentHandshake';

type GateState =
  | { status: 'checking' }
  | { status: 'ready' }
  | { status: 'blocked'; compatibility?: DeploymentCompatibility; message: string };

export function DeploymentGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/health', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(`Health check returned HTTP ${response.status}`);
        const health = await response.json() as HealthResponse;
        const compatibility = evaluateDeploymentCompatibility(__OPENPRISM_BUILD_ID__, health);
        if (cancelled) return;
        if (compatibility.compatible) setState({ status: 'ready' });
        else setState({
          status: 'blocked',
          compatibility,
          message: `Frontend build ${__OPENPRISM_BUILD_ID__} is not compatible with the running backend.`,
        });
      })
      .catch(error => {
        if (!cancelled) setState({
          status: 'blocked',
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => { cancelled = true; };
  }, []);

  if (state.status === 'ready') return children;
  if (state.status === 'checking') {
    return (
      <div className="deployment-gate" role="status">
        <div className="page-loader-spinner" />
        <strong>正在核对前后端版本…</strong>
      </div>
    );
  }
  return (
    <div className="deployment-gate deployment-gate-blocked" role="alert">
      <h1>前后端版本不一致</h1>
      <p>当前页面与服务器不是同一次构建。为避免使用旧接口修改论文，工作区已暂停加载。</p>
      <code>{state.compatibility?.reason || 'backend-unreachable'}</code>
      <small>{state.message}</small>
      <button type="button" onClick={() => window.location.reload()}>重新检查</button>
      <p className="deployment-gate-admin-hint">管理员需要重新构建并重启前后端服务，然后再刷新页面。</p>
    </div>
  );
}
