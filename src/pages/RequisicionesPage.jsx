import React, { useEffect, useMemo, useState } from 'react';
import { Sidebar } from '../components/Layout/Sidebar';
import { Input } from '../components/UI/Input';
import { Button } from '../components/UI/Button';
import api from '../services/api';
import { generatePdfFromElement } from '../utils/PdfGenerator';
import { ClipboardList, Download, FileOutput, Loader2, Plus, Trash2 } from 'lucide-react';

const FIXED = {
  hospital: 'Hospital Regional de Occidente',
  gerencia: 'Gerencia Administrativa Financiera',
  bodegas: 'Bodegas: Medicamentos, Medico Quirurgico, Suministros, Alimentos',
  lugar: 'Quetzaltenango',
};

const createDetalle = () => ({
  id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
  insumo_id: '',
  nombre_producto: '',
  unidad: '',
  numero_lote: '',
  fecha_vencimiento: '',
  cantidad_solicitada: '',
  cantidad_despachada: '',
  precio_unitario: '',
  lotes: [],
  notas: '',
});

const initialForm = (user) => ({
  fecha: new Date().toISOString().split('T')[0],
  servicio: '',
  comentario: '',
  pacientes_hospitalizados: '',
  solicitante_nombre: user?.nombre || '',
  solicitante_cargo: '',
  jefe_nombre: '',
  jefe_cargo: '',
  recibe_nombre: '',
  recibe_cargo: '',
  entrega_nombre: user?.nombre || '',
  entrega_cargo: user?.rol ? user.rol.replace('_', ' ') : '',
});

const currency = new Intl.NumberFormat('es-GT', {
  style: 'currency',
  currency: 'GTQ',
  minimumFractionDigits: 2,
});

const formatDate = (value) => {
  if (!value) return '____/____/____';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('es-GT');
};

const pickAutoLote = (lotes = []) => {
  if (!Array.isArray(lotes) || lotes.length === 0) return null;
  return [...lotes].sort((a, b) => {
    const fechaA = a.fecha_vencimiento ? new Date(a.fecha_vencimiento) : new Date('9999-12-31');
    const fechaB = b.fecha_vencimiento ? new Date(b.fecha_vencimiento) : new Date('9999-12-31');
    return fechaA - fechaB;
  })[0];
};

export default function RequisicionesPage({ user }) {
  const [form, setForm] = useState(() => initialForm(user));
  const [detalles, setDetalles] = useState([createDetalle()]);
  const [insumos, setInsumos] = useState([]);
  const [requisiciones, setRequisiciones] = useState([]);
  const [selectedRequisicion, setSelectedRequisicion] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [proximoNumero, setProximoNumero] = useState(null);
  const [loadingNumero, setLoadingNumero] = useState(false);

  const fetchNextNumber = async () => {
    setLoadingNumero(true);
    try {
      const { data } = await api.get('/requisiciones/proximo-numero');
      setProximoNumero(data?.numero || null);
    } catch (error) {
      console.error('No se pudo obtener el número de requisición', error);
      setFeedback({
        type: 'error',
        message: 'No se pudo obtener el número de requisición. Intenta nuevamente.',
      });
    } finally {
      setLoadingNumero(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const errores = [];
      try {
        const { data } = await api.get('/insumos?limit=1000');
        setInsumos(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error cargando insumos', error);
        errores.push('No se pudieron cargar los insumos.');
      }

      try {
        const { data } = await api.get('/requisiciones?limit=200');
        const listado = Array.isArray(data) ? data : [];
        setRequisiciones(listado);
        if (listado.length) setSelectedRequisicion(listado[0]);
      } catch (error) {
        console.error('Error cargando historial', error);
        errores.push('No se pudo cargar el historial de requisiciones.');
      }

      if (errores.length) {
        setFeedback({ type: 'error', message: errores.join(' ') });
      } else {
        setFeedback(null);
      }
      setLoading(false);
    };

    loadData();
    fetchNextNumber();
  }, []);

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateDetalle = (id, payload) => {
    setDetalles((prev) => prev.map((detalle) => (detalle.id === id ? { ...detalle, ...payload } : detalle)));
  };

  const handleDetalleChange = async (id, field, value) => {
    if (field === 'insumo_id') {
      const insumo = insumos.find((item) => String(item.id) === value);
      updateDetalle(id, {
        insumo_id: value,
        nombre_producto: insumo?.nombre || '',
        unidad: insumo?.unidad_medida || '',
        numero_lote: '',
        fecha_vencimiento: '',
        precio_unitario: '',
        lotes: [],
      });

      if (value) {
        try {
          const { data } = await api.get(`/insumos/${value}/lotes-disponibles`);
          const lotes = Array.isArray(data) ? data : [];
          const auto = pickAutoLote(lotes);
          updateDetalle(id, {
            lotes,
            numero_lote: auto?.numero_lote || '',
            fecha_vencimiento: auto?.fecha_vencimiento || '',
            precio_unitario: auto?.precio_unitario ?? '',
          });
        } catch (error) {
          console.error('Error obteniendo lotes', error);
          updateDetalle(id, { lotes: [] });
        }
      }
      return;
    }

    if (field === 'numero_lote') {
      setDetalles((prev) =>
        prev.map((detalle) => {
          if (detalle.id !== id) return detalle;
          const lote = detalle.lotes.find((item) => (item.numero_lote || '') === value);
          return {
            ...detalle,
            numero_lote: value,
            fecha_vencimiento: lote?.fecha_vencimiento || '',
            precio_unitario: lote?.precio_unitario ?? detalle.precio_unitario,
          };
        }),
      );
      return;
    }

    updateDetalle(id, { [field]: value });
  };

  const addDetalle = () => setDetalles((prev) => [...prev, createDetalle()]);
  const removeDetalle = (id) => {
    if (detalles.length === 1) return;
    setDetalles((prev) => prev.filter((detalle) => detalle.id !== id));
  };

  const totalFormulario = useMemo(
    () =>
      detalles.reduce((acc, detalle) => {
        const cantidad = Number(detalle.cantidad_despachada || 0);
        const precio = Number(detalle.precio_unitario || 0);
        return acc + cantidad * precio;
      }, 0),
    [detalles],
  );

  const buildPayload = () => {
    if (!proximoNumero) throw new Error('No se ha asignado un número de requisición.');

    const lineas = detalles
      .filter((detalle) => detalle.insumo_id && Number(detalle.cantidad_despachada || 0) > 0)
      .map((detalle) => ({
        insumo_id: Number(detalle.insumo_id),
        nombre_producto: detalle.nombre_producto,
        unidad: detalle.unidad,
        numero_lote: detalle.numero_lote || null,
        fecha_vencimiento: detalle.fecha_vencimiento || null,
        cantidad_solicitada: Number(detalle.cantidad_solicitada || detalle.cantidad_despachada),
        cantidad_despachada: Number(detalle.cantidad_despachada),
        precio_unitario: detalle.precio_unitario ? Number(detalle.precio_unitario) : 0,
        notas: detalle.notas || null,
      }));

    if (!lineas.length) throw new Error('Agrega al menos un producto con cantidad.');

    return {
      ...form,
      numero: proximoNumero,
      pacientes_hospitalizados: form.pacientes_hospitalizados
        ? Number(form.pacientes_hospitalizados)
        : null,
      detalles: lineas,
    };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFeedback(null);
    let payload;
    try {
      payload = buildPayload();
    } catch (error) {
      setFeedback({ type: 'error', message: error.message });
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post('/requisiciones', payload);
      setRequisiciones((prev) => [data, ...prev]);
      setSelectedRequisicion(data);
      setDetalles([createDetalle()]);
      setForm(initialForm(user));
      setFeedback({ type: 'success', message: `Requisición #${data.numero} generada correctamente.` });
      await fetchNextNumber();
    } catch (error) {
      console.error('No se pudo crear la requisición', error);
      const message = error?.response?.data?.detail || 'No se pudo guardar la requisición.';
      setFeedback({ type: 'error', message });
      if (message.toLowerCase().includes('ya existe')) {
        fetchNextNumber();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const downloadDocumento = (elementId, nombreArchivo) => {
    generatePdfFromElement(elementId, nombreArchivo);
  };

  const selectedDetalles = selectedRequisicion?.detalles || [];
  const totalSeleccionado = useMemo(
    () => selectedDetalles.reduce((acc, detalle) => acc + Number(detalle.valor_total || 0), 0),
    [selectedDetalles],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar user={user} />
        <div className="flex flex-1 items-center justify-center">
          <div className="rounded-2xl border border-slate-200 bg-white px-8 py-6 text-slate-500 shadow">
            <Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
            Cargando datos...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50">
      <Sidebar user={user} />
      <div className="flex-1 overflow-y-auto px-8 py-10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
          <header className="rounded-3xl border border-white bg-white/95 px-6 py-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
              {FIXED.hospital}
            </p>
            <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">{FIXED.gerencia}</p>
            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">{FIXED.bodegas}</p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-900">
                  <ClipboardList className="h-8 w-8 text-sky-500" />
                  Requisición de materiales
                </h1>
                <p className="text-sm text-slate-500">
                  Selecciona los productos al inicio y completa los demás datos al final.
                </p>
              </div>
              {selectedRequisicion && (
                <div className="rounded-2xl border border-sky-100 bg-white/80 px-5 py-3 text-right shadow-sm">
                  <p className="text-xs font-semibold uppercase text-slate-500">Última requisición</p>
                  <p className="text-2xl font-bold text-slate-900">#{selectedRequisicion.numero}</p>
                </div>
              )}
            </div>
          </header>

          {feedback && (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                feedback.type === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              {feedback.message}
            </div>
          )}

          <div className="grid gap-8 lg:grid-cols-[2fr,minmax(320px,1fr)]">
            <form onSubmit={handleSubmit} className="space-y-8">
              <section className="rounded-3xl border border-white bg-white/95 p-6 shadow-lg">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold uppercase tracking-[0.3em] text-slate-600">
                      Productos (sección principal)
                    </h3>
                    <p className="text-sm text-slate-500">
                      Igual que la tabla del formato físico. El No. Kardex se genera automáticamente por
                      cada producto.
                    </p>
                  </div>
                  <Button type="button" variant="outline" className="rounded-full text-xs" onClick={addDetalle}>
                    <Plus className="mr-2 h-4 w-4" />
                    Agregar
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm text-slate-700">
                    <thead className="bg-slate-100 text-[12px] uppercase tracking-[0.25em] text-slate-600">
                      <tr>
                        <th className="px-4 py-3 text-left">Nombre del producto</th>
                        <th className="px-4 py-3 text-left">Cant. solicitada</th>
                        <th className="px-4 py-3 text-left">Cant. despachada</th>
                        <th className="px-4 py-3 text-center">No. Kardex</th>
                        <th className="px-4 py-3 text-left">Lote (FEFO)</th>
                        <th className="px-4 py-3 text-right">Valor total</th>
                        <th className="px-4 py-3 text-left">Notas</th>
                        <th className="px-2 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detalles.map((detalle) => {
                        const totalLinea =
                          Number(detalle.cantidad_despachada || 0) * Number(detalle.precio_unitario || 0);
                        return (
                          <tr key={detalle.id} className="bg-white">
                            <td className="px-4 py-3">
                              <select
                                value={detalle.insumo_id}
                                onChange={(e) => handleDetalleChange(detalle.id, 'insumo_id', e.target.value)}
                                className="w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm font-semibold text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                              >
                                <option value="">Selecciona un producto</option>
                                {insumos.map((insumo) => (
                                  <option key={insumo.id} value={insumo.id}>
                                    {insumo.nombre}
                                  </option>
                                ))}
                              </select>
                              <p className="mt-1 text-[11px] uppercase tracking-[0.3em] text-slate-400">
                                {detalle.unidad || 'Unidad'}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <Input
                                type="number"
                                min="0"
                                value={detalle.cantidad_solicitada}
                                onChange={(e) =>
                                  handleDetalleChange(detalle.id, 'cantidad_solicitada', e.target.value)
                                }
                                placeholder="Solicitada"
                                className="text-base"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <Input
                                type="number"
                                min="0"
                                value={detalle.cantidad_despachada}
                                onChange={(e) =>
                                  handleDetalleChange(detalle.id, 'cantidad_despachada', e.target.value)
                                }
                                placeholder="Despachada"
                                className="text-base"
                              />
                            </td>
                            <td className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                              Automático
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={detalle.numero_lote}
                                onChange={(e) => handleDetalleChange(detalle.id, 'numero_lote', e.target.value)}
                                className="w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                              >
                                <option value="">Seleccionar manualmente</option>
                                {detalle.lotes.map((lote, index) => (
                                  <option key={`${lote.numero_lote || 'SIN'}-${index}`} value={lote.numero_lote || ''}>
                                    {(lote.numero_lote && `Lote ${lote.numero_lote}`) || 'Sin lote'} · Disp{' '}
                                    {lote.stock_disponible}
                                  </option>
                                ))}
                              </select>
                              {detalle.fecha_vencimiento && (
                                <p className="mt-1 text-[11px] text-slate-500">
                                  Vence: {formatDate(detalle.fecha_vencimiento)}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-base font-semibold text-slate-900">
                              {currency.format(totalLinea || 0)}
                            </td>
                            <td className="px-4 py-3">
                              <textarea
                                value={detalle.notas}
                                onChange={(e) => handleDetalleChange(detalle.id, 'notas', e.target.value)}
                                rows={2}
                                className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-sky-500 focus:outline-none"
                              />
                            </td>
                            <td className="px-2 py-3">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => removeDetalle(detalle.id)}
                                className="rounded-full border border-rose-200 px-3 py-1 text-xs text-rose-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 text-right text-base font-semibold text-slate-700">
                  Total estimado: {currency.format(totalFormulario || 0)}
                </div>
              </section>

              <section className="rounded-3xl border border-white bg-white/95 p-6 shadow-lg">
                <h3 className="text-base font-semibold uppercase tracking-[0.3em] text-slate-600">
                  Datos generales (parte inferior de la hoja)
                </h3>
                <div className="mt-4 space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Servicio solicitante
                      </label>
                      <Input
                        value={form.servicio}
                        onChange={(e) => handleFormChange('servicio', e.target.value)}
                        placeholder="Lavandería, Quirófano..."
                        className="text-base"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Número de pacientes (opcional)
                      </label>
                      <Input
                        type="number"
                        min="0"
                        value={form.pacientes_hospitalizados}
                        onChange={(e) => handleFormChange('pacientes_hospitalizados', e.target.value)}
                        className="text-base"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Fecha de entrega
                      </label>
                      <Input
                        type="date"
                        value={form.fecha}
                        onChange={(e) => handleFormChange('fecha', e.target.value)}
                        className="text-base"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Lugar
                      </label>
                      <Input value={FIXED.lugar} readOnly className="bg-slate-100 text-base" />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Nombre del solicitante
                      </label>
                      <Input
                        value={form.solicitante_nombre}
                        onChange={(e) => handleFormChange('solicitante_nombre', e.target.value)}
                        className="text-base"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Cargo del solicitante
                      </label>
                      <Input
                        value={form.solicitante_cargo}
                        onChange={(e) => handleFormChange('solicitante_cargo', e.target.value)}
                        className="text-base"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Nombre jefe de departamento
                      </label>
                      <Input
                        value={form.jefe_nombre}
                        onChange={(e) => handleFormChange('jefe_nombre', e.target.value)}
                        className="text-base"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Cargo del jefe
                      </label>
                      <Input
                        value={form.jefe_cargo}
                        onChange={(e) => handleFormChange('jefe_cargo', e.target.value)}
                        className="text-base"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Nombre de quien recibe
                      </label>
                      <Input
                        value={form.recibe_nombre}
                        onChange={(e) => handleFormChange('recibe_nombre', e.target.value)}
                        className="text-base"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Cargo de quien recibe
                      </label>
                      <Input
                        value={form.recibe_cargo}
                        onChange={(e) => handleFormChange('recibe_cargo', e.target.value)}
                        className="text-base"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Nombre de quien entrega
                      </label>
                      <Input
                        value={form.entrega_nombre}
                        onChange={(e) => handleFormChange('entrega_nombre', e.target.value)}
                        className="text-base"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                        Cargo de quien entrega
                      </label>
                      <Input
                        value={form.entrega_cargo}
                        onChange={(e) => handleFormChange('entrega_cargo', e.target.value)}
                        className="text-base"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                      Comentarios / observaciones
                    </label>
                    <textarea
                      value={form.comentario}
                      onChange={(e) => handleFormChange('comentario', e.target.value)}
                      rows={3}
                      className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-base text-slate-700 focus:border-sky-500 focus:outline-none"
                    />
                  </div>

                  <div className="text-right">
                    <Button
                      type="submit"
                      disabled={submitting || !proximoNumero}
                      className="rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-8 py-3 text-base font-semibold text-white shadow-lg"
                    >
                      {submitting ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Guardando
                        </span>
                      ) : (
                        'Generar requisición y despacho'
                      )}
                    </Button>
                  </div>
                </div>
              </section>
            </form>

            <aside className="rounded-3xl border border-white bg-white/95 p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-slate-900">Historial de requisiciones</h3>
              <p className="text-sm text-slate-500">
                Selecciona una requisición para visualizarla o descargarla.
              </p>
              <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-3">
                {requisiciones.length === 0 ? (
                  <p className="text-sm text-slate-500">Aún no hay requisiciones registradas.</p>
                ) : (
                  requisiciones.map((req) => (
                    <button
                      key={req.id}
                      type="button"
                      onClick={() => setSelectedRequisicion(req)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                        selectedRequisicion?.id === req.id
                          ? 'border-sky-200 bg-sky-50 text-sky-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-sky-200'
                      }`}
                    >
                      <p className="font-semibold text-slate-900">
                        #{req.numero} · {req.servicio}
                      </p>
                      <p className="text-xs text-slate-500">
                        {req.fecha ? new Date(req.fecha).toLocaleDateString('es-GT') : 'Sin fecha'} ·{' '}
                        {req.detalles?.length || 0} productos
                      </p>
                    </button>
                  ))
                )}
              </div>
            </aside>
          </div>

          {selectedRequisicion && (
            <section className="rounded-3xl border border-white bg-white/95 p-6 shadow-lg">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Documentos listos</p>
                  <h3 className="text-2xl font-semibold text-slate-900">
                    Requisición #{selectedRequisicion.numero}
                  </h3>
                  <p className="text-sm text-slate-500">
                    Servicio {selectedRequisicion.servicio} ·{' '}
                    {selectedRequisicion.fecha ? new Date(selectedRequisicion.fecha).toLocaleDateString('es-GT') : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full text-xs"
                    onClick={() =>
                      downloadDocumento('requisicion-hoja', `requisicion-${selectedRequisicion.numero}.pdf`)
                    }
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Hoja de requisición
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full text-xs"
                    onClick={() =>
                      downloadDocumento('despacho-hoja', `despacho-${selectedRequisicion.numero}.pdf`)
                    }
                  >
                    <FileOutput className="mr-2 h-4 w-4" />
                    Hoja de despacho
                  </Button>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div id="requisicion-hoja" className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-700">
                  <p className="text-center text-xs font-semibold uppercase tracking-[0.5em] text-slate-500">
                    {FIXED.hospital}
                  </p>
                  <p className="text-center text-[11px] uppercase tracking-[0.35em] text-slate-500">
                    {FIXED.gerencia}
                  </p>
                  <p className="text-center text-[11px] uppercase tracking-[0.3em] text-slate-500">
                    {FIXED.bodegas}
                  </p>
                  <h4 className="mt-3 text-center text-lg font-semibold uppercase tracking-[0.3em] text-slate-900">
                    Requisición de materiales y suministros
                  </h4>
                  <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                    <p>
                      Lugar y fecha:{' '}
                      <span className="font-semibold">
                        {FIXED.lugar} · {formatDate(selectedRequisicion.fecha)}
                      </span>
                    </p>
                    <p>
                      Servicio solicitante:{' '}
                      <span className="font-semibold">{selectedRequisicion.servicio}</span>
                    </p>
                    <p>
                      No. requisición:{' '}
                      <span className="font-semibold">{selectedRequisicion.numero}</span>
                    </p>
                    <p>
                      Pacientes:{' '}
                      <span className="font-semibold">
                        {selectedRequisicion.pacientes_hospitalizados ?? '—'}
                      </span>
                    </p>
                  </div>
                  <table className="mt-4 w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600">
                        <th className="border border-slate-300 px-2 py-1 text-left">Código</th>
                        <th className="border border-slate-300 px-2 py-1 text-left">Nombre del producto</th>
                        <th className="border border-slate-300 px-2 py-1 text-center">Cant. solicitada</th>
                        <th className="border border-slate-300 px-2 py-1 text-center">Cant. despachada</th>
                        <th className="border border-slate-300 px-2 py-1 text-center">No. Kardex</th>
                        <th className="border border-slate-300 px-2 py-1 text-right">Valor total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDetalles.map((detalle) => (
                        <tr key={detalle.id}>
                          <td className="border border-slate-200 px-2 py-1">
                            {detalle.codigo || `INS-${detalle.insumo_id}`}
                          </td>
                          <td className="border border-slate-200 px-2 py-1">{detalle.nombre_producto}</td>
                          <td className="border border-slate-200 px-2 py-1 text-center">
                            {detalle.cantidad_solicitada}
                          </td>
                          <td className="border border-slate-200 px-2 py-1 text-center">
                            {detalle.cantidad_despachada}
                          </td>
                          <td className="border border-slate-200 px-2 py-1 text-center">
                            {detalle.numero_kardex || '—'}
                          </td>
                          <td className="border border-slate-200 px-2 py-1 text-right">
                            {currency.format(detalle.valor_total || 0)}
                          </td>
                        </tr>
                      ))}
                      {selectedDetalles.length === 0 && (
                        <tr>
                          <td colSpan={6} className="border border-slate-200 px-2 py-3 text-center">
                            Sin productos registrados
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <div className="mt-4 grid gap-3 text-[11px] uppercase tracking-wide text-slate-600 md:grid-cols-2">
                    <div>
                      <p className="font-semibold text-slate-900">Nombre del solicitante</p>
                      <p>{selectedRequisicion.solicitante_nombre || '________________'}</p>
                      <p>{selectedRequisicion.solicitante_cargo || 'Cargo'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Nombre jefe de departamento</p>
                      <p>{selectedRequisicion.jefe_nombre || '________________'}</p>
                      <p>{selectedRequisicion.jefe_cargo || 'Cargo'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Nombre de quien recibe</p>
                      <p>{selectedRequisicion.recibe_nombre || '________________'}</p>
                      <p>{selectedRequisicion.recibe_cargo || 'Cargo'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Nombre de quien entrega</p>
                      <p>{selectedRequisicion.entrega_nombre || '________________'}</p>
                      <p>{selectedRequisicion.entrega_cargo || 'Cargo'}</p>
                    </div>
                  </div>
                </div>

                <div id="despacho-hoja" className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-700">
                  <div className="text-center text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    Bodega de Médico Quirúrgico
                    <div className="text-base tracking-tight text-slate-900">Despacho de producto</div>
                  </div>
                  <div className="mt-4 text-xs text-slate-600">
                    <p>
                      Servicio: <span className="font-semibold">{selectedRequisicion.servicio}</span>
                    </p>
                    <p>
                      No. requisición: <span className="font-semibold">{selectedRequisicion.numero}</span>
                    </p>
                    <p>
                      Fecha:{' '}
                      <span className="font-semibold">
                        {selectedRequisicion.fecha ? new Date(selectedRequisicion.fecha).toLocaleDateString('es-GT') : ''}
                      </span>
                    </p>
                    <p>
                      Comentario:{' '}
                      <span className="font-semibold">{selectedRequisicion.comentario || 'Sin comentario'}</span>
                    </p>
                  </div>
                  <table className="mt-4 w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600">
                        <th className="border border-slate-200 px-2 py-1 text-left">Cantidad</th>
                        <th className="border border-slate-200 px-2 py-1 text-left">Producto</th>
                        <th className="border border-slate-200 px-2 py-1 text-right">Precio</th>
                        <th className="border border-slate-200 px-2 py-1 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDetalles.map((detalle) => (
                        <tr key={detalle.id}>
                          <td className="border border-slate-200 px-2 py-1">{detalle.cantidad_despachada}</td>
                          <td className="border border-slate-200 px-2 py-1">{detalle.nombre_producto}</td>
                          <td className="border border-slate-200 px-2 py-1 text-right">
                            {currency.format(detalle.precio_unitario || 0)}
                          </td>
                          <td className="border border-slate-200 px-2 py-1 text-right">
                            {currency.format(detalle.valor_total || 0)}
                          </td>
                        </tr>
                      ))}
                      {selectedDetalles.length === 0 && (
                        <tr>
                          <td colSpan={4} className="border border-slate-200 px-2 py-3 text-center">
                            Sin productos registrados
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="border border-slate-200 px-2 py-2 text-right font-semibold">
                          Total
                        </td>
                        <td className="border border-slate-200 px-2 py-2 text-right font-semibold">
                          {currency.format(totalSeleccionado)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
