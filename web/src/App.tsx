import { createContext, useContext, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import {
  AlertTriangle, Boxes, CalendarClock, ClipboardList, LayoutDashboard, LogOut, Package, PackagePlus, Pill, ScanBarcode, ShieldAlert, ShoppingCart,
} from "lucide-react";
import { api, session } from "./api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import Stock from "./pages/Stock";
import Receiving from "./pages/Receiving";
import Replenishment from "./pages/Replenishment";
import Pos from "./pages/Pos";
import Expiry from "./pages/Expiry";
import Recalls from "./pages/Recalls";
import Narcotics from "./pages/Narcotics";
import Movements from "./pages/Movements";

export interface Store { id: string; code: string; name: string; type: string; city?: string }
export interface Supplier { id: string; name: string; type: string; leadTimeDays: number }
interface Ctx { user: { id: string; name: string; role: string }; stores: Store[]; suppliers: Supplier[]; store: Store; setStore: (id: string) => void }

const AppCtx = createContext<Ctx>(null!);
export const useApp = () => useContext(AppCtx);

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/banco", label: "Banco (vendita)", icon: ScanBarcode },
  { to: "/carico", label: "Carico merce", icon: PackagePlus },
  { to: "/riordino", label: "Riordino e ordini", icon: ShoppingCart },
  { to: "/giacenze", label: "Giacenze e lotti", icon: Boxes },
  { to: "/catalogo", label: "Catalogo prodotti", icon: Package },
  { to: "/scadenze", label: "Scadenze", icon: CalendarClock },
  { to: "/richiami", label: "Richiami AIFA", icon: ShieldAlert },
  { to: "/stupefacenti", label: "Registro stupefacenti", icon: Pill },
  { to: "/movimenti", label: "Movimenti", icon: ClipboardList },
];

const roleLabel: Record<string, string> = { ADMIN: "Amministratore", PHARMACIST: "Farmacista", CASHIER: "Cassiere", WAREHOUSE: "Magazziniere" };

export default function App() {
  const [ctx, setCtx] = useState<Omit<Ctx, "store" | "setStore"> | null>(null);
  const [storeId, setStoreId] = useState<string | null>(session.storeId);
  const [loggedIn, setLoggedIn] = useState(!!session.token);
  const navigate = useNavigate();

  useEffect(() => {
    if (!loggedIn) return;
    api("/me").then((d) => {
      setCtx(d);
      const valid = d.stores.find((s: Store) => s.id === session.storeId);
      const sid = valid?.id ?? d.user.storeId ?? d.stores.find((s: Store) => s.type === "STORE")?.id ?? d.stores[0].id;
      session.storeId = sid;
      setStoreId(sid);
    }).catch(() => setLoggedIn(false));
  }, [loggedIn]);

  if (!loggedIn) {
    return (
      <Routes>
        <Route path="*" element={<Login onLogin={() => { setLoggedIn(true); navigate("/"); }} />} />
      </Routes>
    );
  }
  const store = ctx?.stores.find((s) => s.id === storeId);
  if (!ctx || !store) return <div className="p-10 text-slate-400">Caricamento…</div>;

  const setStore = (id: string) => { session.storeId = id; setStoreId(id); };
  const logout = () => { session.token = null; setLoggedIn(false); setCtx(null); navigate("/login"); };

  return (
    <AppCtx.Provider value={{ ...ctx, store, setStore }}>
      <div className="flex min-h-screen">
        <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
          <div className="flex items-center gap-2 px-5 py-4">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-700 text-lg font-bold text-white">+</div>
            <div>
              <div className="text-sm font-semibold leading-tight">FarmaStock IT</div>
              <div className="text-[11px] text-slate-400">MVP · gestione magazzino</div>
            </div>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${isActive ? "bg-brand-50 font-semibold text-brand-800" : "text-slate-600 hover:bg-slate-50"}`}>
                <Icon size={17} /> {label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-slate-100 p-3 text-xs text-slate-500">
            <div className="font-medium text-slate-700">{ctx.user.name}</div>
            <div>{roleLabel[ctx.user.role] ?? ctx.user.role}</div>
            <button onClick={logout} className="mt-2 inline-flex items-center gap-1 text-slate-500 hover:text-rose-600"><LogOut size={14} /> Esci</button>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur md:px-6">
            <select className="md:hidden input w-auto" value={location.pathname} onChange={(e) => navigate(e.target.value)}>
              {nav.map((n) => <option key={n.to} value={n.to}>{n.label}</option>)}
            </select>
            <div className="flex items-center gap-2 text-sm">
              <span className="hidden text-slate-500 sm:inline">Punto vendita</span>
              <select className="input w-auto font-medium" value={store.id} onChange={(e) => setStore(e.target.value)}>
                {ctx.stores.map((s) => <option key={s.id} value={s.id}>{s.type === "WAREHOUSE" ? "🏭 " : "🏥 "}{s.name}</option>)}
              </select>
            </div>
            <div className="hidden items-center gap-1.5 text-xs text-amber-700 lg:flex"><AlertTriangle size={14} /> Ambiente demo: dati e codici AIC fittizi</div>
          </header>
          <main className="flex-1 p-4 md:p-6" key={store.id}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/banco" element={<Pos />} />
              <Route path="/carico" element={<Receiving />} />
              <Route path="/riordino" element={<Replenishment />} />
              <Route path="/giacenze" element={<Stock />} />
              <Route path="/catalogo" element={<Products />} />
              <Route path="/catalogo/:id" element={<ProductDetail />} />
              <Route path="/scadenze" element={<Expiry />} />
              <Route path="/richiami" element={<Recalls />} />
              <Route path="/stupefacenti" element={<Narcotics />} />
              <Route path="/movimenti" element={<Movements />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
        </div>
      </div>
    </AppCtx.Provider>
  );
}
