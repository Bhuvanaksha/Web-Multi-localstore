import { Suspense, lazy } from 'react';
import { Outlet, createBrowserRouter } from 'react-router-dom';
import { DashboardLayout } from './layouts/DashboardLayout';
import { RootLayout } from './layouts/RootLayout';
import { NotFoundPage } from './pages/NotFoundPage';

/**
 * Route-level code splitting: every page except the always-rendered layouts
 * and the 404 fallback is lazy-loaded, so the initial bundle stays small and
 * each route becomes its own chunk fetched on demand.
 */
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() =>
  import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);
const VerifyEmailPage = lazy(() =>
  import('./pages/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage })),
);
const SearchPage = lazy(() =>
  import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })),
);
const MarketplacePage = lazy(() =>
  import('./pages/MarketplacePage').then((m) => ({ default: m.MarketplacePage })),
);
const CartPage = lazy(() => import('./pages/CartPage').then((m) => ({ default: m.CartPage })));
const OrdersPage = lazy(() =>
  import('./pages/OrdersPage').then((m) => ({ default: m.OrdersPage })),
);
const ResourceDetailPage = lazy(() =>
  import('./pages/ResourceDetailPage').then((m) => ({ default: m.ResourceDetailPage })),
);
const SubmitResourcePage = lazy(() =>
  import('./pages/SubmitResourcePage').then((m) => ({ default: m.SubmitResourcePage })),
);
const AdminPanelPage = lazy(() =>
  import('./pages/AdminPanelPage').then((m) => ({ default: m.AdminPanelPage })),
);
const ProviderPage = lazy(() =>
  import('./pages/ProviderPage').then((m) => ({ default: m.ProviderPage })),
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

function RouteFallback() {
  return (
    <div className="page" aria-busy="true">
      <div className="skeleton" style={{ height: '2rem', width: '60%' }} />
      <div className="skeleton" style={{ height: '1rem', width: '30%', marginTop: '0.75rem' }} />
      <div className="skeleton" style={{ height: '12rem', marginTop: '1rem' }} />
    </div>
  );
}

/** Suspense boundary wrapping every lazy route below the RootLayout. */
function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Outlet />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        element: <AppRoutes />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'login', element: <LoginPage /> },
          { path: 'login/provider', element: <LoginPage provider /> },
          { path: 'register', element: <RegisterPage /> },
          { path: 'register/provider', element: <RegisterPage provider /> },
          { path: 'forgot-password', element: <ForgotPasswordPage /> },
          { path: 'reset-password', element: <ResetPasswordPage /> },
          { path: 'verify', element: <VerifyEmailPage /> },
          { path: 'search', element: <SearchPage /> },
          { path: 'marketplace', element: <MarketplacePage /> },
          { path: 'cart', element: <CartPage /> },
          { path: 'orders', element: <OrdersPage /> },
          { path: 'resources/:id', element: <ResourceDetailPage /> },
          { path: 'submit', element: <SubmitResourcePage /> },
          { path: 'admin', element: <AdminPanelPage /> },
          { path: 'provider', element: <ProviderPage /> },
          {
            element: <DashboardLayout />,
            children: [
              { path: 'dashboard', element: <DashboardPage /> },
              { path: 'dashboard/settings', element: <SettingsPage /> },
              {
                path: 'dashboard/analytics',
                element: (
                  <div className="page">
                    <h1>Analytics</h1>
                    <p>Content performance charts will live here.</p>
                  </div>
                ),
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
