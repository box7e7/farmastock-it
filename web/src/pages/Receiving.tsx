import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ScanBarcode, Trash2, Wand2 } from "lucide-react";
import { api, eur } from "../api";
import { useApp } from "../App";
import { Alert, Button, Card, PageHeader, ProductFlags } from "../components/ui";

interface RLine { productId: string; name: string; flags: any; lot: string; expiry: string; qty: number; unitCost: number; serials: string[] }

function gs1Check(body: string) {
  const sum = body.split("").reverse().reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

export default function Receiving() {
  const { suppliers, store } = useApp();
  const [params] = useSearchParams();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [orderId, setOrderId] = useState(params.get("order") ?? "");
  const [orders, setOrders] = useState<any[]>([]);
  const [ref, setRef] = useState("");
  const [code, setCode] = useState("");
  const [lines, setLines] = useState<RLine[]>([]);
  const [msg, setMsg] = useState<{ tone: "red" | "green" | "amber"; text: string } | null>(null);

  useEffect(() => { api<any[]>("/orders").then((o) => setOrders(o.filter((x) => x.status === "SENT"))); }, []);
  useEffect(() => {
    const o = orders.find((x) => x.id === orderId);
    if (!o) return;
    setSupplierId(o.supplierId);
    setLines(o.lines.map((l: any) => ({ productId: l.productId, name: l.product?.name, flags: {}, lot: "", expiry: "", qty: l.qty - l.receivedQty, unitCost: l.unitCost, serials: [] })));
    setMsg({ tone: "amber", text: `Ordine ${o.number} caricato: scansionare i Data Matrix per compilare lotto e scadenza.` });
  }, [orderId, orders]);

  async function onScan(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    const r = await api<any>(`/scan?code=${encodeURIComponent(code)}`);
    setCode("");
    if (!r.product) { setMsg({ tone: "red", text: `Codice non riconosciuto (${r.scan.kind})` }); return; }
    if (r.lot?.blocked) { setMsg({ tone: "red", text: `⛔ Lotto ${r.lot.lot} di ${r.product.name} è oggetto di richiamo: non caricare, rendere al fornitore.` }); return; }
    const s = r.scan;
    setLines((ls) => {
      const idx = ls.findIndex((l) => l.productId === r.product.id && (!l.lot || l.lot === s.lot));
      if (idx >= 0) {
        const l = ls[idx];
        const sameLot = l.lot && l.lot === s.lot;
        const updated = { ...l, lot: s.lot ?? l.lot, expiry: s.expiry ?? l.expiry, flags: r.product, serials: s.serial ? [...l.serials, s.serial] : l.serials,
          qty: sameLot && !orderId ? l.qty + 1 : l.qty };
        return ls.map((x, i) => (i === idx ? updated : x));
      }
      return [...ls, { productId: r.product.id, name: r.product.name, flags: r.product, lot: s.lot ?? "", expiry: s.expiry ?? "", qty: 1, unitCost: r.product.purchasePrice, serials: s.serial ? [s.serial] : [] }];
    });
    setMsg({ tone: "green", text: `${r.product.name}${s.kind === "DATAMATRIX" ? ` · lotto ${s.lot} · scad. ${s.expiry} · seriale ${s.serial}` : ` (${s.kind}): inserire lotto e scadenza`}` });
  }

  async function demoDataMatrix() {
    const list = await api<any[]>("/products?category=FARMACO");
    const candidates = lines.length ? list.filter((p) => lines.some((l) => l.productId === p.id && !l.lot)) : list;
    const p = (candidates.length ? candidates : list)[Math.floor(Math.random() * (candidates.length || list.length))];
    const body = "0380" + p.aic;
    const exp = new Date(); exp.setMonth(exp.getMonth() + 18);
    const yymmdd = `${String(exp.getFullYear()).slice(2)}${String(exp.getMonth() + 1).padStart(2, "0")}00`;
    setCode(`(01)${body}${gs1Check(body)}(17)${yymmdd}(10)DM${Math.floor(Math.random() * 9000 + 1000)}(21)${Math.random().toString(36).slice(2, 12).toUpperCase()}`);
  }

  const update = (i: number, k: keyof RLine, v: any) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const valid = lines.length > 0 && lines.every((l) => l.lot && l.expiry && l.qty > 0);

  async function confirm() {
    try {
      const res = await api<any>("/receipts", { method: "POST", body: { supplierId, orderId: orderId || undefined, ref: ref || undefined, lines: lines.map(({ productId, lot, expiry, qty, unitCost }) => ({ productId, lot, expiry, qty, unitCost })) } });
      setMsg({ tone: "green", text: `Carico ${res.ref} registrato: ${res.lines} righe. Giacenze e costo medio aggiornati.` });
      setLines([]); setOrderId(""); setRef("");
      api<any[]>("/orders").then((o) => setOrders(o.filter((x) => x.status === "SENT")));
    } catch (e) { setMsg({ tone: "red", text: (e as Error).message }); }
  }

  return (
    <>
      <PageHeader title="Carico merce" subtitle={`${store.name} · ricevimento da grossista o ordine, con acquisizione lotto/scadenza da Data Matrix`} />
      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label">Da ordine (opzionale)</label>
            <select className="input" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">— Carico libero —</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.number} · {o.supplier.name}</option>)}
            </select></div>
          <div><label className="label">Fornitore</label>
            <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={!!orderId}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label className="label">Rif. DDT / fattura</label><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="es. DDT 12345 del 22/10" /></div>
        </div>
        <form onSubmit={onScan} className="mt-3 flex gap-2">
          <div className="relative flex-1"><ScanBarcode className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input className="input pl-10 font-mono" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scansiona Data Matrix (01)…(17)…(10)…(21)… / bollino / EAN" /></div>
          <Button>Leggi</Button>
          <Button type="button" variant="secondary" onClick={demoDataMatrix} title="Genera un Data Matrix di prova"><Wand2 size={15} /> Data Matrix demo</Button>
        </form>
      </Card>
      {msg && <div className="mb-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <Card title={`Righe di carico (${lines.length})`}>
        {lines.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">Scansiona i prodotti ricevuti o seleziona un ordine</div> : (
          <div className="overflow-x-auto">
            <table className="tbl"><thead><tr><th>Prodotto</th><th>Lotto</th><th>Scadenza</th><th className="num">Q.tà</th><th className="num">Costo unit.</th><th className="num">Totale</th><th /></tr></thead>
              <tbody>{lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.name}<div><ProductFlags p={l.flags} /></div>{l.serials.length > 0 && <div className="text-[11px] text-slate-400">{l.serials.length} seriali letti</div>}</td>
                  <td><input className="input w-28 font-mono" value={l.lot} onChange={(e) => update(i, "lot", e.target.value)} /></td>
                  <td><input type="date" className="input w-36" value={l.expiry} onChange={(e) => update(i, "expiry", e.target.value)} /></td>
                  <td className="num"><input type="number" min={1} className="input w-20 text-right" value={l.qty} onChange={(e) => update(i, "qty", Number(e.target.value))} /></td>
                  <td className="num"><input type="number" step="0.01" className="input w-24 text-right" value={l.unitCost} onChange={(e) => update(i, "unitCost", Number(e.target.value))} /></td>
                  <td className="num">{eur(l.qty * l.unitCost)}</td>
                  <td><button className="p-1 text-slate-400 hover:text-rose-600" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 size={15} /></button></td>
                </tr>
              ))}</tbody></table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 p-3">
          <span className="text-sm text-slate-500">Totale carico: <b className="text-slate-800">{eur(lines.reduce((s, l) => s + l.qty * l.unitCost, 0))}</b></span>
          <Button disabled={!valid} onClick={confirm}>Conferma carico</Button>
        </div>
      </Card>
    </>
  );
}
