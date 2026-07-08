// src/pages/Login.jsx
import React, { useState } from 'react'
import { Card } from '../components/UI/Card'
import { Button } from '../components/UI/Button'
import { Input } from '../components/UI/Input'
import api from '../services/api.js'
import { saveToken, saveUser } from '../utils/Auth.js'

export default function Login({ onLogin }) {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams()
      params.append('username', formData.email.trim())
      params.append('password', formData.password)
      params.append('grant_type', 'password')

      const tokenResponse = await api.post('/auth/token', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })

      const { access_token: accessToken } = tokenResponse.data
      saveToken(accessToken)

      const { data: user } = await api.get('/usuarios/me')
      saveUser(user)

      onLogin(user)
    } catch (err) {
      console.error('Error al iniciar sesion:', err)
      const message = err.response?.data?.detail || 'Credenciales incorrectas. Intentalo nuevamente.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-white to-blue-50 px-4 py-16">
      <Card className="w-full max-w-md rounded-3xl border border-white/60 bg-white/90 p-10 shadow-[0_20px_45px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">HIS-Bodega</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Sistema de Gestion de Inventario
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">
              Correo electronico
            </label>
            <Input
              type="email"
              value={formData.email}
              onChange={(event) =>
                setFormData({ ...formData, email: event.target.value })
              }
              className="rounded-xl border-slate-200 bg-sky-50/60 text-slate-700 transition focus:ring-sky-400"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">
              Contrasena
            </label>
            <Input
              type="password"
              value={formData.password}
              onChange={(event) =>
                setFormData({ ...formData, password: event.target.value })
              }
              className="rounded-xl border-slate-200 text-slate-700 transition focus:ring-sky-400"
              required
            />
          </div>

          <Button
            type="submit"
            className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 py-3 text-sm font-semibold text-white shadow-md shadow-sky-200 transition hover:from-sky-600 hover:to-blue-700"
            disabled={loading}
          >
            {loading ? 'Iniciando...' : 'Iniciar sesion'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
