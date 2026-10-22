import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "../api";

export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => { reload(); }, [reload, ...deps]);
  return { data, error, loading, reload, setData };
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "", title, actions }: { children: ReactNode; className?: string; title?: string; actions?: ReactNode }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 disabled:bg-slate-300",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400",
  danger: "bg-rose-600 text-white hover:bg-rose-700 disabled:bg-slate-300",
  ghost: "text-slate-600 hover:bg-slate-100",
};
export function Button({ variant = "primary", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...props} className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${variants[variant]} ${className}`} />;
}

const tones = {
  gray: "bg-slate-100 text-slate-700",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-rose-100 text-rose-800",
  blue: "bg-sky-100 text-sky-800",
  violet: "bg-violet-100 text-violet-800",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}

export function Kpi({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: string; tone?: "default" | "warn" | "bad" }) {
  const color = tone === "bad" ? "text-rose-700" : tone === "warn" ? "text-amber-700" : "text-slate-900";
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </Card>
  );
}

export function Alert({ tone = "red", children }: { tone?: "red" | "green" | "amber"; children: ReactNode }) {
  const c = tone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-rose-200 bg-rose-50 text-rose-800";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${c}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-slate-400">{children}</div>;
}

export function ProductFlags({ p }: { p: { drugClass?: string | null; rxRequired?: boolean; narcotic?: boolean; coldChain?: boolean; dpc?: boolean } }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {p.drugClass && <Badge tone="blue">{p.drugClass}</Badge>}
      {p.rxRequired && <Badge tone="violet">Rx</Badge>}
      {p.narcotic && <Badge tone="red">Stupef.</Badge>}
      {p.coldChain && <Badge tone="blue">2–8 °C</Badge>}
      {p.dpc && <Badge tone="amber">DPC</Badge>}
    </span>
  );
}

export const movementLabels: Record<string, string> = {
  RECEIPT: "Carico", SALE: "Vendita", TRANSFER_OUT: "Trasf. uscita", TRANSFER_IN: "Trasf. entrata", COUNT: "Inventario",
  ADJUST: "Rettifica", EXPIRY_WRITEOFF: "Scaduti / distruzione", RETURN_SUPPLIER: "Reso fornitore", RECALL: "Richiamo",
};

export const categoryLabels: Record<string, string> = {
  FARMACO: "Farmaco", PARAFARMACO: "Parafarmaco", DISPOSITIVO: "Dispositivo medico", COSMETICO: "Cosmetico", INTEGRATORE: "Integratore", VETERINARIO: "Veterinario",
};
