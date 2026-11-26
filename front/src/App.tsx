import {Component, type ReactNode} from 'react';
import {BrowserRouter, Navigate, Route, Routes, useLocation} from 'react-router';
import {AuthProvider} from './auth/AuthContext';
import {PublicOnly, RequireAuth} from './auth/guards';
import {ToastProvider} from './components/Toasts';
import {AppLayout} from './layouts/AppLayout';
import {getLegacyRedirect} from './lib/legacyRedirect';
import {ThemeProvider} from './lib/theme';
import {AlertsPage} from './pages/AlertsPage';
import {DashboardPage} from './pages/DashboardPage';
import {ForgotPasswordPage} from './pages/ForgotPasswordPage';
import {LoginPage} from './pages/LoginPage';
import {NotFoundPage} from './pages/NotFoundPage';
import {ProductDetailPage} from './pages/ProductDetailPage';
import {RegisterPage} from './pages/RegisterPage';
import {ResetPasswordPage} from './pages/ResetPasswordPage';
import {SettingsPage} from './pages/SettingsPage';
import {VerifyPage} from './pages/VerifyPage';

/** Si algo revienta al pintar, mejor un aviso que una pantalla en blanco. */
class ErrorBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};

  static getDerivedStateFromError() {
    return {failed: true};
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex min-h-dvh items-center justify-center bg-surface p-6 text-center">
        <div className="max-w-sm">
          <p className="mb-2 font-manrope text-xl font-extrabold text-on-surface">Algo ha fallado al mostrar la página</p>
          <p className="mb-6 text-sm text-on-surface-variant">Recarga para volver a intentarlo.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-11 rounded-xl px-5 font-bold text-white primary-gradient"
          >
            Recargar
          </button>
        </div>
      </div>
    );
  }
}

/** Rutas de la aplicación. Separadas del router para poder probarlas con MemoryRouter. */
export function AppRoutes() {
  const location = useLocation();

  // Enlaces de los emails antiguos: /?verify_token=X y /?reset_token=X.
  const legacy = getLegacyRedirect(location.search);
  if (legacy) return <Navigate to={legacy} replace />;

  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/entrar" element={<LoginPage />} />
        <Route path="/registro" element={<RegisterPage />} />
        <Route path="/recuperar" element={<ForgotPasswordPage />} />
      </Route>
      <Route path="/verificar" element={<VerifyPage />} />
      <Route path="/restablecer" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route element={<DashboardPage />}>
            <Route index element={null} />
            <Route path="productos/:productId" element={<ProductDetailPage />} />
          </Route>
          <Route path="alertas" element={<AlertsPage />} />
          <Route path="ajustes" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

/** Proveedores comunes (tema, avisos y sesión). */
export function AppProviders({children}: {children: ReactNode}) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppProviders>
          <AppRoutes />
        </AppProviders>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
