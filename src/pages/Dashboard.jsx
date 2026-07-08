import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "../components/Layout/Sidebar";
import { Header } from "../components/Layout/Header";
import { Card } from "../components/UI/Card";
import { Button } from "../components/UI/Button";
import api from "../services/api";
import {
  CalendarClock,
  Package,
  PackageOpen,
  ShieldAlert,
  Warehouse,
} from "lucide-react";

const numberFormatter = new Intl.NumberFormat("es-GT", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const cardsConfig = (stats) => [
  {
    title: "Total insumos",
    value: stats.totalInsumos,
    icon: Package,
    accent: "text-sky-600 bg-sky-100",
    background: "from-sky-50 via-white to-sky-100",
    route: "/insumos",
  },
  {
    title: "Alertas activas",
    value: stats.alertasActivas,
    icon: ShieldAlert,
    accent: "text-amber-600 bg-amber-100",
    background: "from-amber-50 via-white to-amber-100",
    route: "/alertas",
  },
  {
    title: "Stock bajo",
    value: stats.stockBajo,
    icon: PackageOpen,
    accent: "text-orange-600 bg-orange-100",
    background: "from-orange-50 via-white to-orange-100",
    route: "/stock-bajo",
  },
  {
    title: "Próximos a vencer",
    value: stats.proximosVencer,
    icon: CalendarClock,
    accent: "text-rose-600 bg-rose-100",
    background: "from-rose-50 via-white to-rose-100",
    route: "/proximos-a-vencer",
  },
];

export default function Dashboard({ user }) {
  const [stats, setStats] = useState({
    totalInsumos: 0,
    alertasActivas: 0,
    stockBajo: 0,
    proximosVencer: 0,
  });
  const [topConsumidos, setTopConsumidos] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [insumosRes, alertasRes] = await Promise.all([
          api.get("/insumos?limit=1000"),
          api.get("/alertas?limit=1000"),
        ]);

        const insumos = Array.isArray(insumosRes.data) ? insumosRes.data : [];
        const alertas = Array.isArray(alertasRes.data) ? alertasRes.data : [];

        const stockBajo = insumos.filter(
          (item) =>
            typeof item.stock_minimo === "number" &&
            item.stock_minimo > 0 &&
            item.stock_actual < item.stock_minimo
        ).length;

        const proximosVencer = insumos.filter((item) => {
          const dias = Number(item.dias_para_vencer);
          return !Number.isNaN(dias) && dias <= 30;
        }).length;

        setStats({
          totalInsumos: insumos.length,
          alertasActivas: alertas.length,
          stockBajo,
          proximosVencer,
        });

        const consumidos = insumos
          .map((item) => ({
            id: item.id,
            nombre: item.nombre,
            stock: item.stock_actual ?? 0,
            minimo: item.stock_minimo ?? 0,
            unidad: item.unidad_medida || "Unidad",
            prioridad:
              item.total_consumos ??
              item.consumos ??
              item.salidas_count ??
              0,
          }))
          .sort((a, b) => b.prioridad - a.prioridad || b.stock - a.stock)
          .slice(0, 5);

        setTopConsumidos(consumidos);
      } catch (error) {
        console.error("Error al cargar datos del dashboard", error);
      }
    };

    fetchDashboardData();
  }, []);

  const listados = useMemo(() => {
    if (topConsumidos.length > 0) return topConsumidos;
    return Array.from({ length: 5 }).map((_, index) => ({
      id: `placeholder-${index}`,
      nombre: "Insumo",
      stock: 0,
      minimo: 0,
      unidad: "Unidad",
    }));
  }, [topConsumidos]);

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-sky-50 via-white to-blue-50">
      <Sidebar user={user} />
      <div className="flex-1 overflow-y-auto px-8 py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
          <Card className="rounded-3xl border border-white bg-white/95 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <Header
              title="Dashboard"
              subtitle={`Bienvenido, ${user?.nombre || 'Equipo'} (${user?.rol || 'super_admin'})`}
            />

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cardsConfig(stats).map(
                ({ title, value, icon: Icon, accent, background, route }) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => navigate(route)}
                    className={`flex items-center gap-4 rounded-2xl border border-transparent bg-gradient-to-br ${background} px-5 py-4 text-left shadow-sm transition hover:shadow-lg`}
                  >
                    <div className={`rounded-full p-3 ${accent}`}>
                      <Icon size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {title}
                      </p>
                      <p className="text-2xl font-bold text-slate-900">{value}</p>
                    </div>
                  </button>
                )
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Button
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-200 transition hover:from-sky-600 hover:to-blue-700"
                onClick={() => navigate('/insumos')}
              >
                <Warehouse size={18} />
                Gestionar insumos
              </Button>
              <Button
                variant="purple"
                className="rounded-2xl border border-slate-200 px-6 py-3 text-sm text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                onClick={() => navigate('/movimientos')}
              >
                Registrar movimientos
              </Button>
            </div>
          </Card>

          <Card className="rounded-3xl border border-white bg-white/95 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Top 5 insumos con mayor consumo
              </h2>
              <Button
                variant="outline"
                className="rounded-full px-4 py-2 text-xs"
                onClick={() => navigate('/insumos')}
              >
                Ver todos
              </Button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Stock</th>
                    <th className="px-4 py-3">Mínimo</th>
                    <th className="px-4 py-3">Unidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-slate-600">
                  {listados.map((item) => (
                    <tr
                      key={item.id}
                      className="cursor-pointer hover:bg-slate-50/80"
                      onClick={() => item.id && navigate(`/kardex/${item.id}`)}
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {item.nombre}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {numberFormatter.format(item.stock || 0)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {numberFormatter.format(item.minimo || 0)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.unidad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
