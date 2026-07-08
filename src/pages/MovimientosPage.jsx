// src/pages/MovimientosPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Sidebar } from '../components/Layout/Sidebar';
import api from '../services/api';
import { Input } from '../components/UI/Input';
import { Button } from '../components/UI/Button';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Info,
  PackagePlus,
  PackageMinus,
} from 'lucide-react';

const entradaInitial = () => ({
  insumo_id: '',
  cantidad: '',
  precio_unitario: '',
  fecha: new Date().toISOString().split('T')[0],
  numero_referencia: '',
  proveedor: '',
  numero_lote: '',
  fecha_vencimiento: '',
});

const salidaInitial = () => ({
  insumo_id: '',
  cantidad: '',
  precio_unitario: '',
  fecha: new Date().toISOString().split('T')[0],
  numero_referencia: '',
  destinatario: '',
  numero_lote: '',
  fecha_vencimiento: '',
});

const isAdminRole = (rol) => ['admin', 'super_admin','empleado'].includes(rol);

const normalizeCantidad = (value) => (value ? Number(value) : 0);

const computeFefoLote = (movimientos) => {
  if (!Array.isArray(movimientos)) return null;

  const lotes = new Map();

  movimientos.forEach((mov) => {
    const lote = mov.numero_lote || mov.lote || 'SIN-LOTE';
    if (!lotes.has(lote)) {
      lotes.set(lote, {
        numero_lote: lote,
        fecha_vencimiento: mov.fecha_vencimiento,
        precio_unitario: mov.precio_unitario || 0,
        saldo: 0,
      });
    }
    const ref = lotes.get(lote);
    const cantidad = Number(mov.cantidad) || 0;

    if (mov.tipo === 'ENTRADA') {
      ref.saldo += cantidad;
      if (!ref.fecha_vencimiento && mov.fecha_vencimiento) {
        ref.fecha_vencimiento = mov.fecha_vencimiento;
      }
      if (!ref.precio_unitario && mov.precio_unitario) {
        ref.precio_unitario = mov.precio_unitario;
      }
    } else if (mov.tipo === 'SALIDA') {
      ref.saldo -= cantidad;
    }
  });

  const disponibles = Array.from(lotes.values()).filter((l) => l.saldo > 0);
  if (disponibles.length === 0) {
    return null;
  }

  disponibles.sort((a, b) => {
    const fechaA = a.fecha_vencimiento
      ? new Date(a.fecha_vencimiento)
      : new Date('9999-12-31');
    const fechaB = b.fecha_vencimiento
      ? new Date(b.fecha_vencimiento)
      : new Date('9999-12-31');
    return fechaA - fechaB;
  });

  return disponibles[0];
};

export default function MovimientosPage({ user }) {
  const [insumos, setInsumos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('entrada');
  const [entradaForm, setEntradaForm] = useState(entradaInitial());
  const [salidaForm, setSalidaForm] = useState(salidaInitial());
  const [feedback, setFeedback] = useState({ type: null, message: '' });
  const [fefoInfo, setFefoInfo] = useState(null);
  const [fefoLoading, setFefoLoading] = useState(false);

  const isAdmin = isAdminRole(user?.rol);

  useEffect(() => {
    fetchInsumos();
  }, []);

  const fetchInsumos = async () => {
    try {
      const { data } = await api.get('/insumos?limit=1000');
      setInsumos(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error al cargar insumos:', error);
      setFeedback({
        type: 'error',
        message: 'No se pudieron cargar los insumos disponibles.',
      });
    } finally {
      setLoading(false);
    }
  };

  const currentUserId = useMemo(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored).id : null;
    } catch {
      return null;
    }
  }, []);

  const handleEntradaChange = (field, value) => {
    setEntradaForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSalidaChange = (field, value) => {
    setSalidaForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEntradaSubmit = async (event) => {
    event.preventDefault();
    setFeedback({ type: null, message: '' });

    try {
      const payload = {
        ...entradaForm,
        cantidad: Number(entradaForm.cantidad),
        precio_unitario: Number(entradaForm.precio_unitario) || 0,
        insumo_id: Number(entradaForm.insumo_id),
        usuario_id: currentUserId,
      };

      const proveedorLimpio = entradaForm.proveedor?.trim();
      if (proveedorLimpio) {
        payload.proveedor = proveedorLimpio;
        payload.remitente_destinatario = proveedorLimpio;
      }

      await api.post('/entradas', payload);

      setFeedback({
        type: 'success',
        message: 'Entrada registrada correctamente.',
      });
      setEntradaForm(entradaInitial());
      fetchInsumos();
    } catch (error) {
      console.error('Error al registrar entrada:', error);
      const detail = error.response?.data?.detail;
      setFeedback({
        type: 'error',
        message: detail || 'No se pudo registrar la entrada.',
      });
    }
  };

  const fetchFefoForInsumo = async (insumoId) => {
    if (!insumoId) {
      setFefoInfo(null);
      setSalidaForm((prev) => ({
        ...prev,
        numero_lote: '',
        fecha_vencimiento: '',
        precio_unitario: '',
      }));
      return;
    }

    setFefoLoading(true);
    try {
      const { data } = await api.get(`/kardex/${insumoId}`);
      const movimientos = data?.movimientos || data || [];
      const loteSeleccionado = computeFefoLote(movimientos);
      setFefoInfo(loteSeleccionado);
      setSalidaForm((prev) => ({
        ...prev,
        numero_lote: loteSeleccionado?.numero_lote || '',
        fecha_vencimiento: loteSeleccionado?.fecha_vencimiento
          ? new Date(loteSeleccionado.fecha_vencimiento)
              .toISOString()
              .split('T')[0]
          : '',
        precio_unitario: loteSeleccionado?.precio_unitario || prev.precio_unitario,
      }));
    } catch (error) {
      console.error('Error al calcular FEFO:', error);
      setFefoInfo(null);
      setFeedback({
        type: 'error',
        message:
          'No se pudo determinar el lote disponible. Verifique el kardex del insumo.',
      });
    } finally {
      setFefoLoading(false);
    }
  };

  const handleSalidaSubmit = async (event) => {
    event.preventDefault();
    setFeedback({ type: null, message: '' });

    if (!fefoInfo) {
      setFeedback({
        type: 'error',
        message:
          'No hay lote disponible para la salida. Registre primero una entrada.',
      });
      return;
    }

    if (normalizeCantidad(salidaForm.cantidad) > fefoInfo.saldo) {
      setFeedback({
        type: 'error',
        message: `La cantidad solicitada supera el saldo disponible del lote (${fefoInfo.saldo}).`,
      });
      return;
    }

  try {
    const payload = {
      ...salidaForm,
      cantidad: Number(salidaForm.cantidad),
      precio_unitario: Number(salidaForm.precio_unitario) || 0,
      insumo_id: Number(salidaForm.insumo_id),
      usuario_id: currentUserId,
      numero_lote: fefoInfo.numero_lote,
    };
    if (salidaForm.destinatario) {
      payload.destinatario = salidaForm.destinatario;
      payload.remitente_destinatario = salidaForm.destinatario;
    }

    await api.post('/salidas', payload);

      setFeedback({
        type: 'success',
        message: 'Salida registrada correctamente.',
      });
      setSalidaForm(salidaInitial());
      setFefoInfo(null);
      fetchInsumos();
    } catch (error) {
      console.error('Error al registrar salida:', error);
      const detail = error.response?.data?.detail;
      setFeedback({
        type: 'error',
        message: detail || 'No se pudo registrar la salida.',
      });
    }
  };

  useEffect(() => {
    if (activeTab === 'salida' && salidaForm.insumo_id) {
      fetchFefoForInsumo(salidaForm.insumo_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, salidaForm.insumo_id]);

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50">
        <Sidebar user={user} />
        <div className="flex-1 px-8 py-10">
          <div className="mx-auto mt-20 max-w-xl rounded-3xl border border-red-100 bg-white p-10 text-center shadow-lg">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
              <Info size={24} />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">
              Acceso restringido
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              SÃ³lo los usuarios con rol administrador pueden registrar
              movimientos de inventario.
            </p>
          </div>
        </div>
      </div>
    );
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
                  <PackagePlus size={26} />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">
                    Registrar Movimientos
                  </h1>
                  <p className="text-sm font-medium text-slate-500">
                    Registra entradas y salidas de insumos
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3 rounded-full border border-slate-200 bg-slate-50/80 p-1">
              <button
                type="button"
                onClick={() => setActiveTab('entrada')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeTab === 'entrada'
                    ? 'bg-white text-sky-600 shadow'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <ArrowDownToLine size={16} />
                Entrada
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('salida')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeTab === 'salida'
                    ? 'bg-white text-sky-600 shadow'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <ArrowUpFromLine size={16} />
                Salida
              </button>
            </div>

            {feedback.message && (
              <div
                className={`mt-6 rounded-2xl border p-4 text-sm ${
                  feedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {feedback.message}
              </div>
            )}

            {loading ? (
              <div className="mt-10 h-64 animate-pulse rounded-2xl bg-slate-100/70" />
            ) : (
              <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                {activeTab === 'entrada' ? (
                  <form
                    onSubmit={handleEntradaSubmit}
                    className="grid grid-cols-1 gap-5 md:grid-cols-2"
                  >
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Insumo *
                      </label>
                      <select
                        value={entradaForm.insumo_id}
                        onChange={(e) =>
                          handleEntradaChange('insumo_id', e.target.value)
                        }
                        required
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                      >
                        <option value="">Buscar insumo</option>
                        {insumos.map((insumo) => (
                          <option key={insumo.id} value={insumo.id}>
                            {insumo.nombre} (Stock: {insumo.stock_actual ?? 0})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Cantidad *
                      </label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={entradaForm.cantidad}
                        onChange={(e) =>
                          handleEntradaChange('cantidad', e.target.value)
                        }
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Precio Unitario
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={entradaForm.precio_unitario}
                        onChange={(e) =>
                          handleEntradaChange('precio_unitario', e.target.value)
                        }
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Fecha *
                      </label>
                      <Input
                        type="date"
                        value={entradaForm.fecha}
                        onChange={(e) =>
                          handleEntradaChange('fecha', e.target.value)
                        }
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Numero de Referencia (Factura)
                      </label>
                      <Input
                        value={entradaForm.numero_referencia}
                        onChange={(e) =>
                          handleEntradaChange('numero_referencia', e.target.value)
                        }
                        placeholder="Ej: FAC-20483"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Proveedor
                      </label>
                      <Input
                        value={entradaForm.proveedor}
                        onChange={(e) =>
                          handleEntradaChange('proveedor', e.target.value)
                        }
                        placeholder="CASA MEDICA"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Numero de Lote
                      </label>
                      <Input
                        value={entradaForm.numero_lote}
                        onChange={(e) =>
                          handleEntradaChange('numero_lote', e.target.value)
                        }
                        placeholder="Ej: LOTE-9768973"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Fecha de Vencimiento
                      </label>
                      <Input
                        type="date"
                        value={entradaForm.fecha_vencimiento}
                        onChange={(e) =>
                          handleEntradaChange('fecha_vencimiento', e.target.value)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 md:col-span-2">
                      <Button
                        type="submit"
                        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-200 transition hover:from-sky-600 hover:to-blue-700"
                      >
                        <PackagePlus size={16} />
                        Registrar Entrada
                      </Button>
                    </div>
                  </form>
                ) : (
                  <form
                    onSubmit={handleSalidaSubmit}
                    className="grid grid-cols-1 gap-5 md:grid-cols-2"
                  >
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Insumo *
                      </label>
                      <select
                        value={salidaForm.insumo_id}
                        onChange={(e) => {
                          handleSalidaChange('insumo_id', e.target.value);
                          fetchFefoForInsumo(e.target.value);
                        }}
                        required
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                      >
                        <option value="">Buscar insumo</option>
                        {insumos.map((insumo) => (
                          <option key={insumo.id} value={insumo.id}>
                            {insumo.nombre} (Stock: {insumo.stock_actual ?? 0})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Cantidad *
                      </label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={salidaForm.cantidad}
                        onChange={(e) =>
                          handleSalidaChange('cantidad', e.target.value)
                        }
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Precio Unitario
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={salidaForm.precio_unitario}
                        onChange={(e) =>
                          handleSalidaChange('precio_unitario', e.target.value)
                        }
                        readOnly
                        className="bg-slate-100"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Fecha *
                      </label>
                      <Input
                        type="date"
                        value={salidaForm.fecha}
                        onChange={(e) =>
                          handleSalidaChange('fecha', e.target.value)
                        }
                        required
                      />
                    </div>

                    <div className="md:col-span-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-600">
                      <p className="font-semibold text-slate-800">
                        Lote seleccionado (FEFO automatico)
                      </p>
                      {fefoLoading ? (
                        <p className="mt-2 text-slate-500">
                          Calculando lote con vencimiento mas proximo...                        </p>
                      ) : fefoInfo ? (
                        <ul className="mt-2 space-y-1 text-sm">
                          <li>
                            <span className="font-medium text-slate-700">
                              Lote:
                            </span>{' '}
                            {fefoInfo.numero_lote}
                          </li>
                          <li>
                            <span className="font-medium text-slate-700">
                              Vence:
                            </span>{' '}
                            {fefoInfo.fecha_vencimiento
                              ? new Date(fefoInfo.fecha_vencimiento).toLocaleDateString(
                                  'es-ES'
                                )
                              : 'Sin fecha'}
                          </li>
                          <li>
                            <span className="font-medium text-slate-700">
                              Stock disponible:
                            </span>{' '}
                            {fefoInfo.saldo}
                          </li>
                        </ul>
                      ) : (
                        <p className="mt-2 text-rose-600">
                          No se encontro un lote disponible para este insumo.
                        </p>
                      )}
                      <p className="mt-3 text-xs text-slate-500">
                        El sistema aplica automÃ¡ticamente la polÃ­tica FEFO (toma
                        el lote que vence antes). No puedes cambiar el lote de
                        forma manual.
                      </p>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Numero de Referencia (Factura)
                      </label>
                      <Input
                        value={salidaForm.numero_referencia}
                        onChange={(e) =>
                          handleSalidaChange('numero_referencia', e.target.value)
                        }
                        placeholder="NÃºmero de documento"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Destinatario
                      </label>
                      <Input
                        value={salidaForm.destinatario}
                        onChange={(e) =>
                          handleSalidaChange('destinatario', e.target.value)
                        }
                        placeholder="Nombre del destinatario"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 md:col-span-2">
                      <Button
                        type="submit"
                        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-200 transition hover:from-sky-600 hover:to-blue-700"
                      >
                        <PackageMinus size={16} />
                        Registrar Salida
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}






