import { lazy, Suspense, useRef, useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DeploymentGate } from './components/DeploymentGate';
import { gsap } from './gsap';

const EditorPage = lazy(() => import('./EditorPage'));
const LandingPage = lazy(() => import('./LandingPage'));
const ProjectPage = lazy(() => import('./ProjectPage'));
const CollabJoinPage = lazy(() => import('./CollabJoinPage'));

function PageLoader() {
  return (
    <div className="page-loader">
      <div className="page-loader-spinner" />
      <span>Loading...</span>
    </div>
  );
}

function PageTransition({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    if (!ref.current) return;
    gsap.fromTo(
      ref.current,
      { opacity: 0, y: 24, scale: 0.99 },
      { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power3.out' }
    );
  }, [location.pathname]);

  return (
    <div ref={ref} className="page-transition-wrapper">
      {children}
    </div>
  );
}

export default function App() {
  return (
    <DeploymentGate>
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <PageTransition>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/projects" element={<ErrorBoundary><ProjectPage /></ErrorBoundary>} />
              <Route path="/editor/:projectId" element={<ErrorBoundary><EditorPage /></ErrorBoundary>} />
              <Route path="/collab" element={<ErrorBoundary><CollabJoinPage /></ErrorBoundary>} />
              <Route path="*" element={<Navigate to="/projects" replace />} />
            </Routes>
          </PageTransition>
        </Suspense>
      </ErrorBoundary>
    </DeploymentGate>
  );
}
