import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, date, dateTime, eur, num } from "../api";
import { useApp } from "../App";
import { Alert, Badge, Button, Card, PageHeader, ProductFlags, categoryLabels, movementLabels, useApi } from "../components/ui";

export default function ProductDetail() {
  const { id } = useParams();
  const { store } = useApp();
  const { data, error, reload } = useApi<any>(`/products/${id}`);
  const [rule, setRule] = useState({ min: 0, max: 0 });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { if (data) setRule({ min: data.rule?.min ?? 0, max: data.rule?.max ?? 0 }); }, [data]);
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <div className="text-slate-400">Caricamento…</div>;
  const p = data.product;

  async function saveRule() {
    try { await api(`/products/${id}/rule`, { method: "PUT", body: rule }); setMsg("Scorte aggiornate"); reload(); }
    catch (e) { setMsg((e as Error).message); }
  }

  return (
    <>
      <PageHeader title={p.name} subtitle={`${categoryLabels[p.category]} · ${p.aic ? `AIC ${p.aic}` : `EAN ${p.gtin}`}${p.activeIngredient ? ` · ${p.activeIngredient}` : ""}`}
        actions={<Link to="/catalogo"><Button variant="secondary">← Catalogo</Button></Link>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4" title="Scheda">
          <dl className="grid grid-cols-2 gap-y-2 p-1 text-sm">
            <dt className="text-slate-500">Caratteristiche</dt><dd><ProductFlags p={p} /></dd>
            <dt className="text-slate-500">GTIN / NTIN</dt><dd className="font-mono text-xs">{p.gtin ?? "—"}</dd>
            <dt className="text-slate-500">Prezzo pubblico</dt><dd>{eur(p.publicPrice)} <span className="text-xs text-slate-400">IVA {p.vatRate}%</span></dd>
            <dt className="text-slate-500">Ultimo acquisto</dt><dd>{eur(p.purchasePrice)}</dd>
            <dt className="text-slate-500">Costo medio (CMP)</dt><dd>{eur(p.avgCost)}</dd>
            <dt className="text-slate-500">Fornitore</dt><dd>{p.preferredSupplier?.name ?? "—"}</dd>
            <dt className="text-slate-500">Multiplo ordine</dt><dd>{p.packMultiple}</dd>
          </dl>
        </Card>
        <Card className="p-4" title={`Scorte · ${store.name}`}>
          <div className="space-y-3 p-1">
            {msg && <Alert tone="green">{msg}</Alert>}
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">Scorta minima</label><input type="number" className="input" value={rule.min} onChange={(e) => setRule({ ...rule, min: Number(e.target.value) })} /></div>
              <div><label className="label">Scorta massima</label><input type="number" className="input" value={rule.max} onChange={(e) => setRule({ ...rule, max: Number(e.target.value) })} /></div>
            </div>
            <Button onClick={saveRule}>Salva scorte</Button>
            <p className="text-xs text-slate-400">Il riordino usa min/max e la domanda degli ultimi 30 giorni (copertura 14 gg).</p>
          </div>
        </Card>
        <Card title="Lotti nella rete">
          <table className="tbl"><thead><tr><th>Lotto</th><th>Scadenza</th><th>Sede</th><th className="num">Q.tà</th></tr></thead>
            <tbody>{data.lots.flatMap((l: any) => l.balances.map((b: any) => (
              <tr key={l.id + b.storeId}>
                <td className="font-mono text-xs">{l.lot} {l.blocked && <Badge tone="red">BLOCCATO</Badge>} {l.owner === "ASL" && <Badge tone="amber">ASL</Badge>}</td>
                <td className={new Date(l.expiry) < new Date() ? "font-semibold text-rose-700" : ""}>{date(l.expiry)}</td>
                <td className="text-xs">{b.store.name}</td><td className="num">{num(b.qty)}</td>
              </tr>
            )))}</tbody></table>
        </Card>
      </div>
      <Card className="mt-4" title="Ultimi movimenti (tutte le sedi)">
        <div className="overflow-x-auto">
          <table className="tbl"><thead><tr><th>Data</th><th>Sede</th><th>Tipo</th><th>Lotto</th><th className="num">Q.tà</th><th>Rif.</th></tr></thead>
            <tbody>{data.movements.map((m: any) => (
              <tr key={m.id}><td className="whitespace-nowrap">{dateTime(m.createdAt)}</td><td className="text-xs">{m.store.name}</td><td>{movementLabels[m.type] ?? m.type}</td>
                <td className="font-mono text-xs">{m.lot.lot}</td><td className={`num font-medium ${m.qty < 0 ? "text-rose-700" : "text-emerald-700"}`}>{m.qty > 0 ? "+" : ""}{num(m.qty)}</td><td className="text-xs text-slate-500">{m.ref}</td></tr>
            ))}</tbody></table>
        </div>
      </Card>
    </>
  );
}
