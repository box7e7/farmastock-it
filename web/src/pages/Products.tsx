import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { api, eur, num } from "../api";
import { useApp } from "../App";
import { Alert, Badge, Button, Card, Empty, PageHeader, ProductFlags, categoryLabels, useApi } from "../components/ui";

interface Row {
  id: string; name: string; aic: string | null; gtin: string | null; category: string; drugClass: string | null; vatRate: number;
  publicPrice: number; avgCost: number; onHand: number; min: number; max: number; rxRequired: boolean; narcotic: boolean; coldChain: boolean; dpc: boolean;
  preferredSupplier?: { name: string } | null;
}

export default function Products() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [showNew, setShowNew] = useState(false);
  const { data, error, reload } = useApi<Row[]>(`/products?q=${encodeURIComponent(q)}&category=${category}`);

  return (
    <>
      <PageHeader title="Catalogo prodotti" subtitle="Farmaci, parafarmaci, dispositivi, cosmetici, integratori, veterinari"
        actions={<Button onClick={() => setShowNew((v) => !v)}><Plus size={16} /> Nuovo prodotto</Button>} />
      {showNew && <NewProduct onDone={() => { setShowNew(false); reload(); }} />}
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <input className="input max-w-sm" placeholder="Cerca per nome, AIC, EAN, principio attivo…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Tutte le categorie</option>
            {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {error && <div className="p-3"><Alert>{error}</Alert></div>}
        {data && data.length === 0 && <Empty>Nessun prodotto trovato</Empty>}
        {data && data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Prodotto</th><th>AIC / EAN</th><th>Categoria</th><th className="num">IVA</th><th className="num">Prezzo</th><th className="num">CMP</th><th className="num">Giacenza</th><th className="num">Min/Max</th></tr></thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id}>
                    <td><Link to={`/catalogo/${p.id}`} className="font-medium text-slate-800 hover:text-brand-700 hover:underline">{p.name}</Link>
                      <div className="mt-0.5"><ProductFlags p={p} /></div></td>
                    <td className="font-mono text-xs text-slate-500">{p.aic ?? p.gtin}</td>
                    <td>{categoryLabels[p.category]}</td>
                    <td className="num">{p.vatRate}%</td>
                    <td className="num">{eur(p.publicPrice)}</td>
                    <td className="num text-slate-500">{eur(p.avgCost)}</td>
                    <td className="num">{p.onHand <= p.min && p.min > 0 ? <Badge tone="amber">{num(p.onHand)}</Badge> : num(p.onHand)}</td>
                    <td className="num text-slate-500">{num(p.min)} / {num(p.max)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function NewProduct({ onDone }: { onDone: () => void }) {
  const { suppliers } = useApp();
  const [f, setF] = useState({
    name: "", aic: "", gtin: "", category: "FARMACO", drugClass: "OTC", activeIngredient: "", vatRate: 10, publicPrice: 0, purchasePrice: 0,
    rxRequired: false, narcotic: false, coldChain: false, dpc: false, packMultiple: 1, preferredSupplierId: suppliers[0]?.id ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    try {
      await api("/products", {
        method: "POST",
        body: { ...f, aic: f.aic || null, gtin: f.gtin || null, drugClass: f.category === "FARMACO" ? f.drugClass : null, activeIngredient: f.activeIngredient || null },
      });
      onDone();
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <Card className="mb-4 p-4" title="Nuovo prodotto">
      <div className="grid gap-3 p-1 sm:grid-cols-2 lg:grid-cols-4">
        {error && <div className="sm:col-span-2 lg:col-span-4"><Alert>{error}</Alert></div>}
        <div className="sm:col-span-2"><label className="label">Descrizione</label><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><label className="label">Codice AIC / Minsan (9 cifre)</label><input className="input font-mono" value={f.aic} onChange={(e) => set("aic", e.target.value)} /></div>
        <div><label className="label">EAN / GTIN</label><input className="input font-mono" value={f.gtin} onChange={(e) => set("gtin", e.target.value)} /></div>
        <div><label className="label">Categoria</label><select className="input" value={f.category} onChange={(e) => set("category", e.target.value)}>{Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label">Classe</label><select className="input" disabled={f.category !== "FARMACO"} value={f.drugClass} onChange={(e) => set("drugClass", e.target.value)}>{["A", "C", "H", "SOP", "OTC"].map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label className="label">Principio attivo</label><input className="input" value={f.activeIngredient} onChange={(e) => set("activeIngredient", e.target.value)} /></div>
        <div><label className="label">Aliquota IVA</label><select className="input" value={f.vatRate} onChange={(e) => set("vatRate", Number(e.target.value))}>{[4, 5, 10, 22].map((v) => <option key={v} value={v}>{v}%</option>)}</select></div>
        <div><label className="label">Prezzo al pubblico (IVA incl.)</label><input type="number" step="0.01" className="input" value={f.publicPrice} onChange={(e) => set("publicPrice", Number(e.target.value))} /></div>
        <div><label className="label">Prezzo d'acquisto</label><input type="number" step="0.01" className="input" value={f.purchasePrice} onChange={(e) => set("purchasePrice", Number(e.target.value))} /></div>
        <div><label className="label">Fornitore preferito</label><select className="input" value={f.preferredSupplierId} onChange={(e) => set("preferredSupplierId", e.target.value)}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><label className="label">Multiplo d'ordine</label><input type="number" min={1} className="input" value={f.packMultiple} onChange={(e) => set("packMultiple", Number(e.target.value))} /></div>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-4 text-sm">
          {([["rxRequired", "Richiede ricetta"], ["narcotic", "Stupefacente"], ["coldChain", "Catena del freddo"], ["dpc", "DPC (proprietà ASL)"]] as const).map(([k, l]) => (
            <label key={k} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={f[k]} onChange={(e) => set(k, e.target.checked)} /> {l}</label>
          ))}
        </div>
      </div>
      <div className="mt-3 flex gap-2"><Button onClick={save} disabled={!f.name}>Salva prodotto</Button><Button variant="secondary" onClick={onDone}>Annulla</Button></div>
    </Card>
  );
}
