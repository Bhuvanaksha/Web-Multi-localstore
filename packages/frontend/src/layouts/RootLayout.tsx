import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { NotificationBell } from '../features/NotificationBell';
import { SearchBar } from '../features/SearchBar';
import { api } from '../lib/api';
import { canBuy, canPublish, canSell, homeForRole } from '../lib/roles';
import { Avatar } from '../shared/ui/Avatar';
import { Button } from '../shared/ui/Button';
import { Toaster, toastInfo } from '../shared/ui/Toast';
import { useAuthStore } from '../stores/useAuthStore';
import { useCartStore } from '../stores/useCartStore';
import { useUIStore } from '../stores/useUIStore';

export function RootLayout() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const role = user?.role;
  const showBuy = canBuy(role);
  const showSell = canSell(role);
  const showPublish = canPublish(role);
  const setSession = useAuthStore((s) => s.setSession);
  const logout = useAuthStore((s) => s.logout);
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const cartCount = useCartStore((s) => s.items.reduce((sum, i) => sum + i.quantity, 0));
  const navigate = useNavigate();
  const [idleWarning, setIdleWarning] = useState(false);
  const idleTimer = useRef<number | null>(null);
  const warningTimer = useRef<number | null>(null);

  // Apply theme to <html data-theme>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Idle session timeout: warn after IDLE_WARN_MS, auto-log out after
  // IDLE_TIMEOUT_MS of no mouse/keyboard/touch/scroll activity.
  useEffect(() => {
    if (!user) return;
    const IDLE_WARN_MS = 25 * 60 * 1000; // warn at 25 min
    const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // sign out at 30 min

    const clearTimers = () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      if (warningTimer.current) window.clearTimeout(warningTimer.current);
      idleTimer.current = null;
      warningTimer.current = null;
    };

    const arm = () => {
      clearTimers();
      setIdleWarning(false);
      idleTimer.current = window.setTimeout(() => {
        warningTimer.current = window.setTimeout(
          () => {
            logout();
            navigate('/login');
            toastInfo('Signed out after 30 minutes of inactivity');
          },
          5 * 60 * 1000,
        ); // 5 min grace after the warning
        setIdleWarning(true);
      }, IDLE_WARN_MS);
    };

    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'keydown',
      'click',
      'touchstart',
      'scroll',
    ];
    for (const e of events) window.addEventListener(e, arm);
    arm();
    return () => {
      for (const e of events) window.removeEventListener(e, arm);
      clearTimers();
    };
  }, [user, logout, navigate]);

  // Re-hydrate the session from the backend when we have a token.
  useEffect(() => {
    if (accessToken && !user) {
      api
        .get('/auth/me')
        .then((res) => setSession(res.data.user, accessToken))
        .catch(() => logout());
    }
  }, [accessToken, user, setSession, logout]);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      logout();
      navigate('/');
    }
  };

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="brand">
            ⍺ Alpha
          </Link>
          <SearchBar />
          <NavLink to="/marketplace" style={{ fontSize: '0.9rem' }}>
            Marketplace
          </NavLink>
          {showBuy && user && (
            <NavLink to="/orders" style={{ fontSize: '0.9rem' }}>
              Orders
            </NavLink>
          )}
          {showBuy && user && (
            <Link to="/cart" style={{ fontSize: '0.9rem', position: 'relative' }}>
              🛒 Cart
              {cartCount > 0 && (
                <span className="notif-badge">{cartCount > 9 ? '9+' : cartCount}</span>
              )}
            </Link>
          )}
          <span className="header-spacer" />
          {showPublish && user && (
            <Link to="/submit">
              <Button size="sm">New post</Button>
            </Link>
          )}
          {showSell && user && (
            <Link to="/provider" style={{ fontSize: '0.9rem' }}>
              Provider
            </Link>
          )}
          {user && <NotificationBell />}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          {user ? (
            <div className="flex">
              <Link to={homeForRole(role)} className="flex" style={{ color: 'var(--text)' }}>
                <Avatar name={user.username} size="sm" />
                <span className="muted" style={{ fontSize: '0.9rem' }}>
                  {user.username}
                </span>
              </Link>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          ) : (
            <div className="flex">
              <NavLink to="/login">
                <Button variant="ghost" size="sm">
                  Log in
                </Button>
              </NavLink>
              <NavLink to="/register">
                <Button size="sm">Sign up</Button>
              </NavLink>
            </div>
          )}
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      {idleWarning && (
        <div
          style={{
            position: 'fixed',
            bottom: '1rem',
            right: '1rem',
            zIndex: 1000,
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '0.75rem 1rem',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            maxWidth: 320,
          }}
        >
          <strong>Still there?</strong>
          <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            You'll be signed out in 5 minutes due to inactivity. Move your mouse to keep the
            session.
          </p>
        </div>
      )}
      <Toaster />
    </>
  );
}
