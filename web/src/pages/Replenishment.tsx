import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Send } from "lucide-react";
import { api, dateTime, eur, num } from "../api";
import { useApp } from "../App";
import { Alert, Badge, Button, Card, Empty, PageHeader, useApi } from "../components/ui";

interface Row { productId: string; name: string; aic: string | null; supplier: string; onHand: number; onOrder: number; soldLast30: number; min: number; max: number; avgDaily: number; reorderPoint: number; target: number; suggested: number; daysOfCover: number | null; unitCost: number }

export default function Replenishment() {
  const { store } = useApp();
  const proposal = useApi<Row[]>("/replenishment");
  const orders = useApi<any[]>("/orders");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!proposal.data) return;
    setQty(Object.fromEntries(proposal.data.map((r) => [r.productId, r.suggested])));
    setSel(Object.fromEntries(proposal.data.map((r) => [r.productId, true])));
  }, [proposal.data]);

  const groups = (proposal.data ?? []).reduce<Record<string, Row[]>>((g, r) => ((g[r.supplier] ??= []).push(r), g), {});
  const chosen = (proposal.data ?? []).filter((r) => sel[r.productId] && qty[r.productId] > 0);

  async function generate() {
    try {
      const created = await api<any[]>("/orders/from-proposal", { method: "POST", body: { lines: chosen.map((r) => ({ productId: r.productId, qty: qty[r.productId] })) } });
      setMsg({ tone: "green", text: `Creati ${created.length} ordini (${created.map((o) => o.number).join(", ")}) e trasmessi ai fornitori (simulato).` });
      proposal.reload(); orders.reload();
    } catch (e) { setMsg({ tone: "red", text: (e as Error).message }); }
  }

  return (
    <>
      <PageHeader title="Riordino automatico" subtitle={`${store.name} · proposta calcolata su scorte min/max, vendite ultimi 30 gg, ordini aperti e lead time`}
        actions={<><Button variant="secondary" onClick={() => proposal.reload()}><RefreshCw size={15} /> Ricalcola</Button>
          <Button disabled={!chosen.length} onClick={generate}><Send size={15} /> Genera e invia ordini ({chosen.length})</Button></>} />
      {msg && <div className="mb-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {proposal.data && proposal.data.length === 0 && <Card><Empty>Nessun prodotto da riordinare: scorte sopra il punto di riordino.</Empty></Card>}
      {Object.entries(groups).map(([supplier, rows]) => (
        <Card key={supplier} className="mb-4" title={`${supplier} · ${rows.length} righe · ${eur(rows.filter((r) => sel[r.productId]).reduce((s, r) => s + (qty[r.productId] ?? 0) * r.unitCost, 0))}`}>
          <div className="overflow-x-auto">
            <table className="tbl"><thead><tr><th /><th>Prodotto</th><th className="num">Giacenza</th><th className="num">In ordine</th><th className="num">Venduto 30gg</th><th className="num">Media/g</th><th className="num">Copertura</th><th className="num">Min / Max</th><th className="num">P. riordino</th><th className="num">Da ordinare</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.productId}>
                  <td><input type="checkbox" checked={!!sel[r.productId]} onChange={(e) => setSel({ ...sel, [r.productId]: e.target.checked })} /></td>
                  <td><Link to={`/catalogo/${r.productId}`} className="hover:underline">{r.name}</Link></td>
                  <td className="num">{r.onHand === 0 ? <Badge tone="red">0</Badge> : num(r.onHand)}</td>
                  <td className="num">{num(r.onOrder)}</td>
                  <td className="num">{num(r.soldLast30)}</td>
                  <td className="num">{num(r.avgDaily)}</td>
                  <td className="num">{r.daysOfCover === null ? "—" : `${num(r.daysOfCover)} gg`}</td>
                  <td className="num">{num(r.min)} / {num(r.max)}</td>
                  <td className="num">{num(r.reorderPoint)}</td>
                  <td className="num"><input type="number" min={0} className="input w-20 text-right" value={qty[r.productId] ?? 0} onChange={(e) => setQty({ ...qty, [r.productId]: Number(e.target.value) })} /></td>
                </tr>
              ))}</tbody></table>
          </div>
        </Card>
      ))}

      <Card className="mt-6" title="Ordini ai fornitori">
        {orders.data?.length === 0 && <Empty>Nessun ordine</Empty>}
        {orders.data && orders.data.length > 0 && (
          <table className="tbl"><thead><tr><th>Numero</th><th>Data</th><th>Fornitore</th><th className="num">Righe</th><th className="num">Totale</th><th>Stato</th><th /></tr></thead>
            <tbody>{orders.data.map((o) => (
              <Fragment key={o.id}>
                <tr className="cursor-pointer" onClick={() => setOpen(open === o.id ? null : o.id)}>
                  <td className="font-mono text-xs">{o.number}</td><td>{dateTime(o.createdAt)}</td><td>{o.supplier.name}</td><td className="num">{o.lines.length}</td><td className="num">{eur(o.total)}</td>
                  <td>{o.status === "SENT" ? <Badge tone="blue">Inviato</Badge> : o.status === "RECEIVED" ? <Badge tone="green">Ricevuto</Badge> : <Badge>{o.status}</Badge>}</td>
                  <td>{o.status === "SENT" && <Link to={`/carico?order=${o.id}`} onClick={(e) => e.stopPropagation()} className="text-xs font-medium text-brand-700 hover:underline">Ricevi →</Link>}</td>
                </tr>
                {open === o.id && (
                  <tr><td colSpan={7} className="bg-slate-50">
                    {o.lines.map((l: any) => <div key={l.id} className="flex justify-between py-0.5 text-xs"><span>{l.product?.name}</span><span className="tabular-nums">{num(l.qty)} × {eur(l.unitCost)} · ricevuti {num(l.receivedQty)}</span></div>)}
                  </td></tr>
                )}
              </Fragment>
            ))}</tbody></table>
        )}
      </Card>
    </>
  );
}
