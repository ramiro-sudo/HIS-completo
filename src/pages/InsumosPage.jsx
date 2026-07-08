import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sidebar } from '../components/Layout/Sidebar'
import api from '../services/api'
import { Input } from '../components/UI/Input'
import { Button } from '../components/UI/Button'
import {
  Layers3,
  Package,
  PackagePlus,
  PencilLine,
  Scale,
  Search,
  Trash2,
} from 'lucide-react'

const initialForm = {
  nombre: '',
  descripcion: '',
  unidad_medida: '',
  stock_minimo: '',
  especialidad_id: '',
}

const numberFormatter = new Intl.NumberFormat('es-GT', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const isAdminRole = (rol) => ['admin', 'super_admin'].includes(rol)

export default function InsumosPage({ user }) {
  const [insumos, setInsumos] = useState([])
  const [especialidades, setEspecialidades] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingInsumo, setEditingInsumo] = useState(null)
  const [formData, setFormData] = useState(initialForm)
  const navigate = useNavigate()

  const isAdmin = isAdminRole(user?.rol)

  const especialidadesMap = useMemo(() => {
    const map = {}
    especialidades.forEach((esp) => {
      map[esp.id] = esp.nombre
    })
    return map
  }, [especialidades])

  const getEspecialidadNombre = (insumo) => {
    if (insumo?.especialidad?.nombre) return insumo.especialidad.nombre
    if (insumo?.especialidad_id && especialidadesMap[insumo.especialidad_id]) {
      return especialidadesMap[insumo.especialidad_id]
    }
    return 'Sin especialidad'
  }

  useEffect(() => {
    const loadData = async () => {
      try {
        const [insumosRes, especialidadesRes] = await Promise.all([
          api.get('/insumos?limit=1000'),
          api.get('/especialidades/'),
        ])
        setInsumos(Array.isArray(insumosRes.data) ? insumosRes.data : [])
        const catalog = (especialidadesRes.data || []).map((esp) => ({
          id: esp.id,
          nombre: esp.nombre,
        }))
        setEspecialidades(
          catalog.length
            ? catalog
            : [
                { id: 'Cirugia', nombre: 'Cirugía' },
                { id: 'Laboratorio', nombre: 'Laboratorio' },
                { id: 'Urgencias', nombre: 'Urgencias' },
                { id: 'Medicina Interna', nombre: 'Medicina Interna' },
                { id: 'Pediatria', nombre: 'Pediatría' },
                { id: 'Ginecologia', nombre: 'Ginecología' },
                { id: 'Farmacia', nombre: 'Farmacia' },
                { id: 'Esteril', nombre: 'Estéril' },
                { id: 'General', nombre: 'General' },
              ]
        )
      } catch (err) {
        console.error('Error al cargar insumos/especialidades', err)
        setError('No se pudieron cargar los datos.')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const resetForm = () => {
    setFormData(initialForm)
    setEditingInsumo(null)
    setError('')
    setSuccess('')
  }

  const handleCreateOrUpdate = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    const parsedEspecialidadId = formData.especialidad_id
      ? Number(formData.especialidad_id)
      : null

    const payload = {
      ...formData,
      stock_minimo: formData.stock_minimo ? Number(formData.stock_minimo) : undefined,
      especialidad_id: Number.isNaN(parsedEspecialidadId) ? null : parsedEspecialidadId,
    }

    try {
      if (editingInsumo) {
        await api.put(`/insumos/${editingInsumo.id}`, payload)
        setSuccess('Insumo actualizado correctamente.')
      } else {
        await api.post('/insumos', payload)
        setSuccess('Insumo creado correctamente.')
      }
      resetForm()
      setShowForm(false)
      const { data } = await api.get('/insumos?limit=1000')
      setInsumos(Array.isArray(data) ? data : [])
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(detail || 'Ocurrió un error al guardar el insumo.')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este insumo?')) return
    try {
      await api.delete(`/insumos/${id}`)
      setSuccess('Insumo eliminado correctamente.')
      setInsumos((prev) => prev.filter((item) => item.id !== id))
    } catch (err) {
      console.error('Error al eliminar insumo', err)
      setError('No se pudo eliminar el insumo.')
    }
  }

  const startEdit = (insumo) => {
    setEditingInsumo(insumo)
    const especialidadId =
      insumo.especialidad_id ??
      insumo.especialidad?.id ??
      ''
    setFormData({
      nombre: insumo.nombre || '',
      descripcion: insumo.descripcion || '',
      unidad_medida: insumo.unidad_medida || '',
      stock_minimo: insumo.stock_minimo ?? '',
      especialidad_id: especialidadId ? String(especialidadId) : '',
    })
    setShowForm(true)
    setError('')
    setSuccess('')
  }

  const filteredInsumos = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return insumos
    return insumos.filter((insumo) =>
      [insumo.nombre, insumo.descripcion, getEspecialidadNombre(insumo)]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term))
    )
  }, [insumos, search])

  if (loading) {
    return (
      <div className="flex">
        <Sidebar user={user} />
        <div className="flex-1 p-8">
          <div className="h-96 animate-pulse rounded-3xl bg-slate-200" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50">
      <Sidebar user={user} />
      <div className="flex-1 overflow-y-auto px-8 py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
          <section className="rounded-3xl border border-white bg-white/95 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="rounded-full bg-sky-100 p-3 text-sky-600">
                  <Layers3 size={26} />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Gestión de insumos</h1>
                  <p className="text-sm font-medium text-slate-500">
                    Administra todos los insumos del inventario
                  </p>
                </div>
              </div>
              {isAdmin && (
                <Button
                  onClick={() => {
                    if (editingInsumo) resetForm()
                    setShowForm((prev) => !prev)
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-200 transition hover:from-sky-600 hover:to-blue-700"
                >
                  <PackagePlus size={16} />
                  {showForm ? 'Cerrar formulario' : 'Nuevo insumo'}
                </Button>
              )}
            </div>

            {showForm && isAdmin && (
              <div className="mt-6 space-y-4 rounded-2xl border border-slate-100 bg-slate-50 p-6">
                <h2 className="text-lg font-semibold text-slate-900">
                  {editingInsumo ? 'Editar insumo' : 'Crear nuevo insumo'}
                </h2>
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {success}
                  </div>
                )}
                <form onSubmit={handleCreateOrUpdate} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Nombre *</label>
                    <Input
                      value={formData.nombre}
                      onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Descripción</label>
                    <textarea
                      rows={3}
                      value={formData.descripcion}
                      onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Unidad de medida</label>
                    <div className="relative">
                      <Scale className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={formData.unidad_medida}
                        onChange={(e) => setFormData({ ...formData, unidad_medida: e.target.value })}
                        placeholder="ej: unidades, kg, litros"
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Stock mínimo</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.stock_minimo}
                      onChange={(e) => setFormData({ ...formData, stock_minimo: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Especialidad</label>
                    <select
                      value={formData.especialidad_id}
                      onChange={(e) => setFormData({ ...formData, especialidad_id: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                    >
                      <option value="">Selecciona una especialidad</option>
                      {especialidades.map((esp) => (
                        <option key={esp.id} value={esp.id}>
                          {esp.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-3 md:col-span-2">
                    <Button type="submit" className="rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-200">
                      {editingInsumo ? <><PencilLine size={14} />Actualizar</> : <><PackagePlus size={14} />Crear</>}
                    </Button>
                    <Button variant="outline" className="rounded-full px-4 py-2 text-sm" type="button" onClick={() => { resetForm(); setShowForm(false) }}>
                      Cancelar
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-white bg-white/95 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar insumo..."
                  className="w-64 rounded-full border border-slate-200 bg-white px-9 py-2 text-sm text-slate-600 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Nombre</th>
                    <th className="px-4 py-3 text-left">Especialidad</th>
                    <th className="px-4 py-3 text-left">Unidad</th>
                    <th className="px-4 py-3 text-right">Stock</th>
                    <th className="px-4 py-3 text-right">Mínimo</th>
                    {isAdmin && <th className="px-4 py-3 text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredInsumos.length > 0 ? (
                    filteredInsumos.map((insumo) => (
                      <tr
                        key={insumo.id}
                        className="hover:bg-slate-50/80"
                        onClick={() => navigate(`/kardex/${insumo.id}`)}
                      >
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {insumo.nombre}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {getEspecialidadNombre(insumo)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {insumo.unidad_medida || 'Unidad'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          <span
                            className={`inline-flex min-w-[64px] justify-center rounded-full px-3 py-1 text-xs font-semibold ${
                              (insumo.stock_actual || 0) >= (insumo.stock_minimo || 0)
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-red-50 text-red-600 border border-red-200'
                            }`}
                          >
                            {numberFormatter.format(insumo.stock_actual || 0)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {numberFormatter.format(insumo.stock_minimo || 0)}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                className="rounded-full px-3 py-1 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  startEdit(insumo)
                                }}
                              >
                                <PencilLine size={14} />
                              </Button>
                              <Button
                                variant="outline"
                                className="rounded-full px-3 py-1 text-xs text-red-600"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDelete(insumo.id)
                                }}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={isAdmin ? 6 : 5} className="px-4 py-6 text-center text-sm text-slate-500">
                        No se encontraron insumos para el criterio ingresado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}


