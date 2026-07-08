// src/pages/FacturasPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Sidebar } from "../components/Layout/Sidebar";
import { Header } from "../components/Layout/Header";
import { Card } from "../components/UI/Card";
import { Button } from "../components/UI/Button";
import { Plus, Eye, Trash2, X } from "lucide-react";

const PAGE_SIZE = 15;

const numberFormatter = new Intl.NumberFormat("es-GT", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const currencyGT = new Intl.NumberFormat("es-GT", {
  style: "currency",
  currency: "GTQ",
  minimumFractionDigits: 2,
});

export default function FacturasPage({ user }) {
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    const fetchFacturas = async () => {
      try {
        const response = await fetch("http://localhost:8000/entradas/", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });
        const data = await response.json();
        const registros = Array.isArray(data) ? data : [];
        registros.sort((a, b) => {
          const fechaA = a.fecha ? new Date(a.fecha) : new Date(0);
          const fechaB = b.fecha ? new Date(b.fecha) : new Date(0);
          if (fechaA.getTime() === fechaB.getTime()) {
            return (b.id || 0) - (a.id || 0);
          }
          return fechaB - fechaA;
        });
        setFacturas(registros);
      } catch (err) {
        console.error("Error al cargar facturas", err);
        setError("No se pudieron cargar las facturas.");
      } finally {
        setLoading(false);
      }
    };
    fetchFacturas();
  }, []);

  const totalPages = Math.max(1, Math.ceil(facturas.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return facturas.slice(start, start + PAGE_SIZE);
  }, [facturas, page]);

  const changePage = (nextPage) => {
    if (nextPage < 1 || nextPage > totalPages) return;
    setPage(nextPage);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Eliminar esta entrada?")) return;
    try {
      const response = await fetch(`http://localhost:8000/entradas/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (!response.ok) throw new Error("Error al eliminar la factura");
      setFacturas((prev) => prev.filter((factura) => factura.id !== id));
    } catch (err) {
      console.error("Error al eliminar factura", err);
      setError("No se pudo eliminar la factura.");
    }
  };

  if (loading) {
    return (
      <div className="flex">
        <Sidebar user={user} />
        <div className="flex-1 p-8">
          <Header title="Facturas registradas" />
          <div className="animate-pulse">
            <div className="h-96 rounded-3xl bg-slate-200" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar user={user} />
      <div className="flex-1 p-8">
        <Header
          title="Facturas registradas"
          subtitle="Entradas provenientes de compras y proveedores"
        />

        <div className="mb-6 flex justify-between items-center">
          <Button
            variant="outline"
            onClick={() => (window.location.href = "/movimientos")}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nueva factura
          </Button>
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3 text-left">Fecha</th>
                  <th className="px-6 py-3 text-left">Insumo</th>
                  <th className="px-6 py-3 text-right">Cantidad</th>
                  <th className="px-6 py-3 text-right">Precio unit.</th>
                  <th className="px-6 py-3 text-left">Referencia</th>
                  <th className="px-6 py-3 text-left">Proveedor</th>
                  <th className="px-6 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-600">
                {pageRows.map((factura) => (
                  <tr key={factura.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {factura.fecha
                        ? new Date(factura.fecha).toLocaleDateString("es-ES")
                        : "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {factura.insumo?.nombre ||
                        factura.insumo_nombre ||
                        "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {numberFormatter.format(factura.cantidad || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {currencyGT.format(factura.precio_unitario || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {factura.numero_referencia || "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {factura.proveedor ||
                        factura.remitente_destinatario ||
                        "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        type="button"
                        className="mr-3 text-sky-600 hover:text-sky-800"
                        onClick={() => setPreview(factura)}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="text-red-600 hover:text-red-800"
                        onClick={() => handleDelete(factura.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-xs text-slate-500">
            <span>
              Mostrando {facturas.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} a{' '}
              {Math.min(page * PAGE_SIZE, facturas.length)} de {facturas.length} entradas
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="rounded-full px-3 py-1 text-xs"
                disabled={page === 1}
                onClick={() => changePage(1)}
              >
                Primera
              </Button>
              <Button
                variant="outline"
                className="rounded-full px-3 py-1 text-xs"
                disabled={page === 1}
                onClick={() => changePage(page - 1)}
              >
                Anterior
              </Button>
              <span className="px-2 text-xs font-semibold text-slate-600">
                Pagina {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                className="rounded-full px-3 py-1 text-xs"
                disabled={page === totalPages}
                onClick={() => changePage(page + 1)}
              >
                Siguiente
              </Button>
              <Button
                variant="outline"
                className="rounded-full px-3 py-1 text-xs"
                disabled={page === totalPages}
                onClick={() => changePage(totalPages)}
              >
                Ultima
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-w-xl w-full rounded-3xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-900">Vista previa de factura</h3>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-700"
                onClick={() => setPreview(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-6 py-5 text-sm text-slate-600">
              <div className="grid grid-cols-2 gap-3">
                <p><strong>Fecha:</strong> {preview.fecha ? new Date(preview.fecha).toLocaleDateString('es-ES') : '—'}</p>
                <p><strong>Referencia:</strong> {preview.numero_referencia || '—'}</p>
                <p>
                  <strong>Insumo:</strong>{" "}
                  {preview.insumo?.nombre ||
                    preview.insumo_nombre ||
                    "—"}
                </p>
                <p><strong>Proveedor:</strong> {preview.proveedor || preview.remitente_destinatario || '—'}</p>
                <p><strong>Cantidad:</strong> {numberFormatter.format(preview.cantidad || 0)}</p>
                <p><strong>Precio unitario:</strong> {currencyGT.format(preview.precio_unitario || 0)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-right font-semibold text-slate-700">
                Total: {currencyGT.format((preview.precio_unitario || 0) * (preview.cantidad || 0))}
              </div>
            </div>
            <div className="flex justify-end border-t border-slate-100 px-6 py-4">
              <Button variant="outline" onClick={() => setPreview(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}






