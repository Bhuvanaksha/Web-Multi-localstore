import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { canBuy, canSell } from '../lib/roles';
import { useAuthStore } from '../stores/useAuthStore';

export function DashboardLayout() {
  const user = useAuthStore((s) => s.user);

  if (!user) return <Navigate to="/login" replace />;

  const sell = canSell(user.role);
  const buy = canBuy(user.role);

  return (
    <div className="shell">
      <aside className="sidebar">
        {buy ? (
          <>
            <NavLink to="/dashboard" end>
              My Dashboard
            </NavLink>
            <NavLink to="/marketplace">Marketplace</NavLink>
            <NavLink to="/orders">My Orders</NavLink>
          </>
        ) : (
          <NavLink to="/dashboard" end>
            My Dashboard
          </NavLink>
        )}
        {sell && <NavLink to="/provider">Provider Studio</NavLink>}
        <NavLink to="/dashboard/settings">Settings</NavLink>
        {user.role === 'member' || user.role === 'moderator' || user.role === 'admin' ? (
          <NavLink to="/dashboard/analytics">Analytics</NavLink>
        ) : null}
        {user.role === 'admin' && <NavLink to="/admin">Admin Panel</NavLink>}
      </aside>
      <section>
        <Outlet />
      </section>
    </div>
  );
}
