// src/pages/CrearUsuariosPage.jsx
import React, { useState } from 'react';
import { Sidebar } from '../components/Layout/Sidebar';
import { Header } from '../components/Layout/Header';
import { Card } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Input } from '../components/UI/Input';
import api from '../services/api';

const roles = [
  { value: 'super_admin', label: 'Super administrador' },
  { value: 'admin', label: 'Administrador' },
  { value: 'empleado', label: 'Empleado' },
];

export default function CrearUsuariosPage({ user }) {
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    password: '',
    rol: 'empleado',
  });
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    try {
      await api.post('/usuarios', formData);
      setSuccess('Usuario creado exitosamente.');
      setFormData({
        nombre: '',
        email: '',
        password: '',
        rol: 'empleado',
      });
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al crear usuario.');
    }
  };

  return (
    <div className="flex">
      <Sidebar user={user} />
      <div className="flex-1 p-8">
        <Header
          title="Crear Usuario"
          subtitle="Registro de nuevos usuarios del sistema"
        />

        <Card>
          {error && (
            <div className="mb-4 rounded bg-red-50 p-3 text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 rounded bg-green-50 p-3 text-green-700">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Nombre completo
              </label>
              <Input
                value={formData.nombre}
                onChange={(e) =>
                  setFormData({ ...formData, nombre: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Correo electrónico
              </label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Contraseña
              </label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Rol
              </label>
              <select
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                value={formData.rol}
                onChange={(e) =>
                  setFormData({ ...formData, rol: e.target.value })
                }
              >
                {roles.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" className="w-full">
              Crear usuario
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
