import { Link } from "react-router-dom";
import { date, eur, num } from "../api";
import { Alert, Card, Empty, Kpi, PageHeader, useApi } from "../components/ui";

interface Dash {
  store: { name: string };
  kpi: { stockValue: number; expiredValue: number; expiringValue: number; blockedUnits: number; belowMin: number; openRecalls: number; skuCount: number; salesToday: number; ticketsToday: number };
  salesByDay: { day: string; total: number; count: number }[];
  belowMin: { productId: string; product: string; onHand: number; min: number }[];
  expiring: { product: string; lot: string; expiry: string; qty: number }[];
}

export default function Dashboard() {
  const { data, error } = useApi<Dash>("/dashboard");
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <div className="text-slate-400">Caricamento…</div>;
  const { kpi } = data;
  const max = Math.max(1, ...data.salesByDay.map((d) => d.total));

  return (
    <>
      <PageHeader title={`Dashboard · ${data.store.name}`} subtitle="Situazione del magazzino in tempo reale (inventario perpetuo)" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Valore magazzino (CMP)" value={eur(kpi.stockValue)} hint={`${kpi.skuCount} referenze in catalogo`} />
        <Kpi label="Vendite oggi" value={eur(kpi.salesToday)} hint={`${kpi.ticketsToday} scontrini`} />
        <Kpi label="Sotto scorta minima" value={kpi.belowMin} tone={kpi.belowMin ? "warn" : "default"} hint="Da riordinare" />
        <Kpi label="Richiami aperti" value={kpi.openRecalls} tone={kpi.openRecalls ? "bad" : "default"} hint={`${num(kpi.blockedUnits)} pz bloccati`} />
        <Kpi label="Scaduti in giacenza" value={eur(kpi.expiredValue)} tone={kpi.expiredValue ? "bad" : "default"} hint="Da smaltire o rendere" />
        <Kpi label="In scadenza ≤ 90 gg" value={eur(kpi.expiringValue)} tone={kpi.expiringValue ? "warn" : "default"} hint="Valore a rischio" />
      </div>

      <Card className="mt-4" title="Vendite ultimi 14 giorni">
        <div className="flex h-44 items-end gap-1.5 px-4 pb-3 pt-4">
          {data.salesByDay.map((d) => (
            <div key={d.day} className="group flex flex-1 flex-col items-center gap-1">
              <div className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100">{eur(d.total)}</div>
              <div className="w-full rounded-t bg-brand-500/80 group-hover:bg-brand-700" style={{ height: `${(d.total / max) * 120}px` }} title={`${d.day}: ${eur(d.total)} (${d.count} scontrini)`} />
              <div className="text-[10px] text-slate-400">{d.day.slice(8, 10)}/{d.day.slice(5, 7)}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Prodotti sotto scorta minima" actions={<Link to="/riordino" className="text-xs font-medium text-brand-700 hover:underline">Proposta d'ordine →</Link>}>
          {data.belowMin.length === 0 ? <Empty>Nessun prodotto sotto scorta</Empty> : (
            <table className="tbl"><thead><tr><th>Prodotto</th><th className="num">Giacenza</th><th className="num">Minimo</th></tr></thead>
              <tbody>{data.belowMin.map((r) => (
                <tr key={r.productId}><td><Link className="hover:underline" to={`/catalogo/${r.productId}`}>{r.product}</Link></td><td className="num font-semibold text-amber-700">{num(r.onHand)}</td><td className="num">{num(r.min)}</td></tr>
              ))}</tbody></table>
          )}
        </Card>
        <Card title="Lotti in scadenza (≤ 90 giorni)" actions={<Link to="/scadenze" className="text-xs font-medium text-brand-700 hover:underline">Gestisci scadenze →</Link>}>
          {data.expiring.length === 0 ? <Empty>Nessun lotto in scadenza</Empty> : (
            <table className="tbl"><thead><tr><th>Prodotto</th><th>Lotto</th><th>Scadenza</th><th className="num">Q.tà</th></tr></thead>
              <tbody>{data.expiring.map((r) => (
                <tr key={r.product + r.lot}><td>{r.product}</td><td className="font-mono text-xs">{r.lot}</td><td>{date(r.expiry)}</td><td className="num">{num(r.qty)}</td></tr>
              ))}</tbody></table>
          )}
        </Card>
      </div>
    </>
  );
}
