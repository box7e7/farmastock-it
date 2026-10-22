import { useRef, useState } from "react";
import { Minus, Plus, Printer, ScanBarcode, Trash2 } from "lucide-react";
import { api, date, dateTime, eur } from "../api";
import { useApp } from "../App";
import { Alert, Badge, Button, Card, PageHeader, ProductFlags } from "../components/ui";

interface Product { id: string; name: string; aic: string | null; publicPrice: number; vatRate: number; rxRequired: boolean; narcotic: boolean; coldChain: boolean; dpc: boolean; drugClass: string | null; onHand?: number }
interface Line { product: Product; qty: number }

export default function Pos() {
  const { store } = useApp();
  const [code, setCode] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [cart, setCart] = useState<Line[]>([]);
  const [cf, setCf] = useState("");
  const [payment, setPayment] = useState("CARD");
  const [rxConfirmed, setRxConfirmed] = useState(false);
  const [alert, setAlert] = useState<{ tone: "red" | "amber" | "green"; text: string } | null>(null);
  const [receipt, setReceipt] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const needsRx = cart.some((l) => l.product.rxRequired || l.product.narcotic);
  const needsCf = cart.some((l) => l.product.narcotic);
  const total = cart.reduce((s, l) => s + l.qty * (l.product.dpc ? 0 : l.product.publicPrice), 0);

  function add(p: Product) {
    setCart((c) => {
      const ex = c.find((l) => l.product.id === p.id);
      return ex ? c.map((l) => (l === ex ? { ...l, qty: l.qty + 1 } : l)) : [...c, { product: p, qty: 1 }];
    });
    if (p.narcotic) setAlert({ tone: "amber", text: `${p.name}: stupefacente. Ricetta e codice fiscale obbligatori; il movimento va nel registro.` });
    else if (p.rxRequired) setAlert({ tone: "amber", text: `${p.name}: medicinale soggetto a prescrizione. Verificare la ricetta.` });
    else if (p.coldChain) setAlert({ tone: "amber", text: `${p.name}: catena del freddo (2–8 °C).` });
    else setAlert(null);
    setCode(""); setResults([]); inputRef.current?.focus();
  }

  async function onScan(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setReceipt(null);
    const r = await api<any>(`/scan?code=${encodeURIComponent(code)}`);
    if (r.product) {
      if (r.lot?.blocked) { setAlert({ tone: "red", text: `⛔ ${r.product.name}: lotto ${r.lot.lot} soggetto a RICHIAMO. Vendita bloccata, mettere in quarantena.` }); setCode(""); return; }
      if (r.lot && new Date(r.lot.expiry) < new Date()) { setAlert({ tone: "red", text: `⛔ ${r.product.name}: lotto ${r.lot.lot} SCADUTO il ${date(r.lot.expiry)}. Vendita non consentita.` }); setCode(""); return; }
      if (r.onHand <= 0) { setAlert({ tone: "red", text: `${r.product.name}: nessuna giacenza vendibile in ${store.name}.` }); setCode(""); return; }
      add({ ...r.product, onHand: r.onHand });
      return;
    }
    const list = await api<Product[]>(`/products?q=${encodeURIComponent(code)}`);
    setResults(list.slice(0, 8));
    if (!list.length) setAlert({ tone: "red", text: `Codice "${code}" non riconosciuto` });
  }

  async function checkout() {
    try {
      const sale = await api("/sales", { method: "POST", body: { patientCf: cf, paymentMethod: payment, rxConfirmed, lines: cart.map((l) => ({ productId: l.product.id, qty: l.qty })) } });
      setReceipt(sale); setCart([]); setCf(""); setRxConfirmed(false); setAlert({ tone: "green", text: `Vendita ${sale.number} registrata. Giacenze scaricate con logica FEFO.` });
    } catch (e) { setAlert({ tone: "red", text: (e as Error).message }); }
  }

  return (
    <>
      <PageHeader title="Banco · vendita" subtitle={`${store.name} · scansiona Data Matrix, bollino (A + AIC) o EAN, oppure cerca per nome`} />
      {store.type === "WAREHOUSE" && <div className="mb-3"><Alert tone="amber">Il magazzino centrale non effettua vendite al pubblico: selezionare una farmacia.</Alert></div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <Card className="p-3">
            <form onSubmit={onScan} className="flex gap-2">
              <div className="relative flex-1">
                <ScanBarcode className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input ref={inputRef} autoFocus className="input pl-10 text-base" placeholder="Scansiona o digita codice / nome prodotto…" value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <Button>Aggiungi</Button>
            </form>
            <p className="mt-2 text-xs text-slate-400">Prova: <button className="font-mono text-brand-700 hover:underline" onClick={() => setCode("A030000000")}>A030000000</button> (bollino) · <button className="font-mono text-brand-700 hover:underline" onClick={() => setCode("ibuprofene")}>ibuprofene</button> · <button className="font-mono text-brand-700 hover:underline" onClick={() => setCode("morfina")}>morfina</button></p>
            {results.length > 0 && (
              <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {results.map((p) => (
                  <button key={p.id} onClick={() => add(p)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-brand-50">
                    <span>{p.name} <ProductFlags p={p} /></span><span className="tabular-nums text-slate-500">{eur(p.publicPrice)} · giac. {p.onHand}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>
          {alert && <Alert tone={alert.tone}>{alert.text}</Alert>}
          <Card title="Carrello">
            {cart.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">Carrello vuoto</div> : (
              <table className="tbl"><thead><tr><th>Prodotto</th><th className="num">Q.tà</th><th className="num">Prezzo</th><th className="num">Totale</th><th /></tr></thead>
                <tbody>{cart.map((l) => (
                  <tr key={l.product.id}>
                    <td>{l.product.name}<div className="mt-0.5"><ProductFlags p={l.product} /></div></td>
                    <td className="num"><div className="inline-flex items-center gap-1">
                      <button className="rounded p-1 hover:bg-slate-100" onClick={() => setCart((c) => c.map((x) => x === l ? { ...x, qty: Math.max(1, x.qty - 1) } : x))}><Minus size={14} /></button>
                      <span className="w-6 text-center">{l.qty}</span>
                      <button className="rounded p-1 hover:bg-slate-100" onClick={() => setCart((c) => c.map((x) => x === l ? { ...x, qty: x.qty + 1 } : x))}><Plus size={14} /></button>
                    </div></td>
                    <td className="num">{l.product.dpc ? <Badge tone="amber">DPC</Badge> : eur(l.product.publicPrice)}</td>
                    <td className="num font-medium">{eur(l.qty * (l.product.dpc ? 0 : l.product.publicPrice))}</td>
                    <td><button className="rounded p-1 text-slate-400 hover:text-rose-600" onClick={() => setCart((c) => c.filter((x) => x !== l))}><Trash2 size={15} /></button></td>
                  </tr>
                ))}</tbody></table>
            )}
          </Card>
        </div>
        <div className="space-y-3">
          <Card className="p-4">
            <div className="text-xs text-slate-500">Totale da pagare</div>
            <div className="text-3xl font-semibold tabular-nums">{eur(total)}</div>
            <div className="mt-4 space-y-3">
              <div><label className="label">Codice fiscale paziente {needsCf ? "(obbligatorio)" : "(scontrino parlante, detrazione 730)"}</label>
                <input className="input font-mono uppercase" maxLength={16} value={cf} onChange={(e) => setCf(e.target.value.toUpperCase())} placeholder="RSSMRA80A01F205X" /></div>
              <div><label className="label">Pagamento</label>
                <select className="input" value={payment} onChange={(e) => setPayment(e.target.value)}><option value="CARD">Carta / POS</option><option value="CASH">Contanti</option><option value="MIXED">Misto</option></select></div>
              {needsRx && <label className="flex items-start gap-2 rounded-lg bg-violet-50 p-2 text-sm text-violet-900"><input type="checkbox" className="mt-0.5" checked={rxConfirmed} onChange={(e) => setRxConfirmed(e.target.checked)} /> Ricetta verificata dal farmacista</label>}
              <Button className="w-full py-3 text-base" disabled={!cart.length || store.type === "WAREHOUSE"} onClick={checkout}>Conferma vendita</Button>
              <p className="text-[11px] text-slate-400">MVP: documento non fiscale. In produzione la stampa avviene tramite Registratore Telematico (RT) e invio al Sistema TS.</p>
            </div>
          </Card>
          {receipt && (
            <Card className="p-4 font-mono text-xs">
              <div className="mb-2 flex items-center justify-between font-sans"><span className="text-sm font-semibold">Ricevuta {receipt.number}</span><Button variant="secondary" onClick={() => window.print()}><Printer size={14} /> Stampa</Button></div>
              <div className="text-center">{store.name}<br />{dateTime(receipt.createdAt)}<br />DOCUMENTO NON FISCALE (DEMO)</div>
              <hr className="my-2 border-dashed" />
              {receipt.lines.map((l: any) => (
                <div key={l.id} className="flex justify-between gap-2"><span>{l.qty} x {l.name.slice(0, 26)}<br /><span className="text-slate-400">lotto {l.lot} · IVA {l.vatRate}%</span></span><span>{eur(l.total)}</span></div>
              ))}
              <hr className="my-2 border-dashed" />
              <div className="flex justify-between font-semibold"><span>TOTALE</span><span>{eur(receipt.total)}</span></div>
              <div className="flex justify-between text-slate-500"><span>di cui IVA</span><span>{eur(receipt.vatTotal)}</span></div>
              {receipt.patientCf && <div className="mt-1">C.F. {receipt.patientCf}</div>}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
