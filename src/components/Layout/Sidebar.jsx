// src/components/Layout/Sidebar.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Boxes,
  ClipboardList,
  FileOutput,
  FileText,
  LayoutDashboard,
  ShieldCheck,
  Shuffle,
  Users,
} from 'lucide-react';
import { logout } from '../../utils/Auth.js';

const roleThemes = {
  super_admin: {
    subtitle: 'Super Administrador',
    badge: 'bg-amber-100 text-amber-700',
    accentBar: 'from-amber-100 via-white to-amber-50 border-t-4 border-amber-300',
  },
  admin: {
    subtitle: 'Admin Principal',
    badge: 'bg-emerald-100 text-emerald-700',
    accentBar: 'from-emerald-50 via-white to-emerald-50 border-t-4 border-emerald-300',
  },
  empleado: {
    subtitle: 'Empleado bodega',
    badge: 'bg-sky-100 text-sky-700',
    accentBar: 'from-sky-50 via-white to-sky-100 border-t-4 border-sky-300',
  },
};

const navigationItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/insumos', label: 'Insumos', icon: Boxes },
  { to: '/movimientos', label: 'Movimientos', icon: Shuffle },
  { to: '/requisiciones', label: 'Requisiciones', icon: ClipboardList },
  { to: '/despacho', label: 'Despacho', icon: FileOutput },
  { to: '/facturas', label: 'Facturas', icon: FileText },
  {
    to: '/reportes-bi',
    label: 'Reportes BI',
    icon: BarChart3,
    roles: ['super_admin', 'admin'],
  },
  {
    to: '/auditoria',
    label: 'Auditoría',
    icon: ShieldCheck,
    roles: ['super_admin', 'admin'],
  },
  {
    to: '/crear-usuarios',
    label: 'Crear Usuarios',
    icon: Users,
    roles: ['super_admin'],
  },
];

const baseClasses =
  'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors duration-200';

export function Sidebar({ user }) {
  const rol = user?.rol || 'empleado';
  const theme = roleThemes[rol] || roleThemes.empleado;

  return (
    <aside className={`flex min-h-screen w-64 flex-col border-r border-slate-100 bg-white shadow-xl`}>
      <div
        className={`border-b border-slate-100 bg-gradient-to-br ${theme.accentBar} px-6 py-8`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-sky-600">
          HIS-Bodega
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Panel Operativo</h1>
        <p className="mt-6 text-sm font-medium text-slate-500">
          {theme.subtitle}
        </p>
        <span
          className={`mt-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${theme.badge}`}
        >
          {rol.replace('_', ' ')}
        </span>
      </div>

  <nav className="flex-1 space-y-1 px-4 py-6">
        {navigationItems
          .filter(({ roles }) => !roles || roles.includes(rol))
          .map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `${baseClasses} ${
                  isActive
                    ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-200'
                    : 'text-slate-600 hover:bg-sky-50 hover:text-sky-600'
                }`
              }
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
      </nav>

      <div className="border-t border-slate-100 px-6 py-5">
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100"
        >
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
}
