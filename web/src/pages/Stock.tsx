import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRightLeft, ClipboardCheck } from "lucide-react";
import { api, date, eur, num } from "../api";
import { useApp } from "../App";
import { Alert, Badge, Button, Card, Empty, PageHeader, categoryLabels, useApi } from "../components/ui";

interface Row { lotId: string; qty: number; lot: string; expiry: string; owner: string; blocked: boolean; value: number; product: { id: string; name: string; aic: string | null; category: string; narcotic: boolean; coldChain: boolean } }

const filters = [["", "Tutte"], ["expiring", "In scadenza ≤90gg"], ["expired", "Scaduti"], ["blocked", "Bloccati (richiamo)"], ["dpc", "DPC (ASL)"]];

export default function Stock() {
  const { store, stores } = useApp();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const { data, error, reload } = useApi<Row[]>(`/stock?q=${encodeURIComponent(q)}&filter=${filter}`);
  const [action, setAction] = useState<{ row: Row; kind: "count" | "transfer" } | null>(null);
  const [value, setValue] = useState(0);
  const [toStore, setToStore] = useState("");
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const total = (data ?? []).filter((r) => r.owner === "PHARMACY").reduce((s, r) => s + r.value, 0);
  const today = new Date();

  async function submit() {
    if (!action) return;
    try {
      if (action.kind === "count") {
        const r = await api<{ diff: number }>("/stock/count", { method: "POST", body: { lotId: action.row.lotId, countedQty: value } });
        setMsg({ tone: "green", text: r.diff === 0 ? "Conteggio conforme, nessuna differenza" : `Rettifica inventariale registrata: ${r.diff > 0 ? "+" : ""}${r.diff} pz` });
      } else {
        const r = await api<{ ref: string }>("/stock/transfer", { method: "POST", body: { toStoreId: toStore, lines: [{ lotId: action.row.lotId, qty: value }] } });
        setMsg({ tone: "green", text: `Trasferimento ${r.ref} eseguito` });
      }
      setAction(null); reload();
    } catch (e) { setMsg({ tone: "red", text: (e as Error).message }); }
  }

  return (
    <>
      <PageHeader title="Giacenze per lotto" subtitle={`${store.name} · valore (CMP, esclusa merce DPC): ${eur(total)}`} />
      {msg && <div className="mb-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {action && (
        <Card className="mb-4 p-4" title={action.kind === "count" ? "Conteggio inventariale (ciclico)" : "Trasferimento tra sedi"}>
          <div className="flex flex-wrap items-end gap-3 p-1">
            <div className="text-sm"><div className="font-medium">{action.row.product.name}</div><div className="text-xs text-slate-500">Lotto {action.row.lot} · a sistema {num(action.row.qty)} pz</div></div>
            {action.kind === "transfer" && (
              <div><label className="label">Destinazione</label>
                <select className="input" value={toStore} onChange={(e) => setToStore(e.target.value)}>
                  <option value="">Seleziona…</option>{stores.filter((s) => s.id !== store.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
            )}
            <div><label className="label">{action.kind === "count" ? "Quantità contata" : "Quantità"}</label><input type="number" min={0} className="input w-28" value={value} onChange={(e) => setValue(Number(e.target.value))} /></div>
            <Button onClick={submit} disabled={action.kind === "transfer" && (!toStore || value <= 0)}>Conferma</Button>
            <Button variant="secondary" onClick={() => setAction(null)}>Annulla</Button>
          </div>
        </Card>
      )}
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <input className="input max-w-xs" placeholder="Cerca prodotto o AIC…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex flex-wrap gap-1">{filters.map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-lg px-3 py-1.5 text-sm ${filter === k ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{l}</button>
          ))}</div>
        </div>
        {error && <div className="p-3"><Alert>{error}</Alert></div>}
        {data?.length === 0 && <Empty>Nessun lotto</Empty>}
        {data && data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="tbl"><thead><tr><th>Prodotto</th><th>Categoria</th><th>Lotto</th><th>Scadenza</th><th>Stato</th><th className="num">Q.tà</th><th className="num">Valore</th><th /></tr></thead>
              <tbody>{data.map((r) => {
                const expired = new Date(r.expiry) < today;
                return (
                  <tr key={r.lotId}>
                    <td><Link to={`/catalogo/${r.product.id}`} className="hover:underline">{r.product.name}</Link></td>
                    <td className="text-xs text-slate-500">{categoryLabels[r.product.category]}</td>
                    <td className="font-mono text-xs">{r.lot}</td>
                    <td className={expired ? "font-semibold text-rose-700" : ""}>{date(r.expiry)}</td>
                    <td className="space-x-1">{r.blocked && <Badge tone="red">Richiamo</Badge>}{expired && <Badge tone="red">Scaduto</Badge>}{r.owner === "ASL" && <Badge tone="amber">DPC/ASL</Badge>}{r.product.narcotic && <Badge tone="violet">Stupef.</Badge>}{r.product.coldChain && <Badge tone="blue">Frigo</Badge>}</td>
                    <td className="num font-medium">{num(r.qty)}</td>
                    <td className="num text-slate-500">{r.owner === "ASL" ? "—" : eur(r.value)}</td>
                    <td className="whitespace-nowrap text-right">
                      <button title="Conteggio" className="rounded p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => { setAction({ row: r, kind: "count" }); setValue(r.qty); }}><ClipboardCheck size={16} /></button>
                      <button title="Trasferisci" className="rounded p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => { setAction({ row: r, kind: "transfer" }); setValue(1); }}><ArrowRightLeft size={16} /></button>
                    </td>
                  </tr>
                );
              })}</tbody></table>
          </div>
        )}
      </Card>
    </>
  );
}
