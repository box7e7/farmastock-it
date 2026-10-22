import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { api, dateTime, num } from "../api";
import { Alert, Badge, Button, Card, Empty, PageHeader, useApi } from "../components/ui";

export default function Recalls() {
  const recalls = useApi<any[]>("/recalls");
  const products = useApi<any[]>("/products?category=FARMACO");
  const [productId, setProductId] = useState("");
  const [lotOptions, setLotOptions] = useState<{ lot: string; expiry: string }[]>([]);
  const [lots, setLots] = useState<string[]>([]);
  const [severity, setSeverity] = useState("II");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);

  async function pickProduct(id: string) {
    setProductId(id); setLots([]);
    if (!id) return setLotOptions([]);
    const d = await api<any>(`/products/${id}`);
    setLotOptions(d.lots.map((l: any) => ({ lot: l.lot, expiry: l.expiry })));
  }

  async function create() {
    try {
      const r = await api<any>("/recalls", { method: "POST", body: { productId, lots, severity, reason } });
      setMsg({ tone: "green", text: `Richiamo registrato: ${r.blockedLots} lotti bloccati in tutta la rete (banco, carico e trasferimenti).` });
      setProductId(""); setLots([]); setReason(""); setLotOptions([]); recalls.reload();
    } catch (e) { setMsg({ tone: "red", text: (e as Error).message }); }
  }

  async function close(id: string) {
    try { await api(`/recalls/${id}/close`, { method: "POST" }); setMsg({ tone: "green", text: "Richiamo chiuso: giacenze dei lotti scaricate come reso per richiamo." }); recalls.reload(); }
    catch (e) { setMsg({ tone: "red", text: (e as Error).message }); }
  }

  return (
    <>
      <PageHeader title="Richiami e ritiri di lotti (AIFA / Ministero)" subtitle="Blocco immediato dei lotti in tutte le sedi, tracciamento delle giacenze coinvolte e chiusura con reso" />
      {msg && <div className="mb-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <Card className="mb-4 p-4" title="Nuovo richiamo">
        <div className="grid gap-3 p-1 md:grid-cols-4">
          <div className="md:col-span-2"><label className="label">Medicinale</label>
            <select className="input" value={productId} onChange={(e) => pickProduct(e.target.value)}>
              <option value="">Seleziona…</option>{products.data?.map((p) => <option key={p.id} value={p.id}>{p.name} · AIC {p.aic}</option>)}
            </select></div>
          <div><label className="label">Classe di urgenza</label>
            <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="I">Classe I (24 h)</option><option value="II">Classe II</option><option value="III">Classe III</option></select></div>
          <div><label className="label">Motivo / nota AIFA</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="es. difetto di qualità, nota AIFA n. …" /></div>
          {lotOptions.length > 0 && (
            <div className="md:col-span-4"><label className="label">Lotti interessati</label>
              <div className="flex flex-wrap gap-2">{lotOptions.map((l) => (
                <label key={l.lot} className={`cursor-pointer rounded-lg border px-3 py-1.5 font-mono text-xs ${lots.includes(l.lot) ? "border-rose-400 bg-rose-50 text-rose-800" : "border-slate-200"}`}>
                  <input type="checkbox" className="mr-1.5" checked={lots.includes(l.lot)} onChange={(e) => setLots(e.target.checked ? [...lots, l.lot] : lots.filter((x) => x !== l.lot))} />{l.lot}
                </label>
              ))}</div></div>
          )}
        </div>
        <Button className="mt-3" variant="danger" disabled={!productId || !lots.length || reason.length < 3} onClick={create}><ShieldAlert size={15} /> Registra richiamo e blocca lotti</Button>
      </Card>
      <Card title="Richiami">
        {recalls.data?.length === 0 && <Empty>Nessun richiamo registrato</Empty>}
        {recalls.data && recalls.data.length > 0 && (
          <table className="tbl"><thead><tr><th>Data</th><th>Medicinale</th><th>Lotti</th><th>Classe</th><th>Giacenze coinvolte</th><th>Stato</th><th /></tr></thead>
            <tbody>{recalls.data.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{dateTime(r.createdAt)}</td>
                <td>{r.product?.name}<div className="text-xs text-slate-400">{r.reason}</div></td>
                <td className="font-mono text-xs">{r.lots}</td>
                <td><Badge tone={r.severity === "I" ? "red" : "amber"}>{r.severity}</Badge></td>
                <td className="text-xs">{r.affected.length === 0 ? <span className="text-slate-400">nessuna</span> : r.affected.map((a: any, i: number) => <div key={i}>{a.store}: <b>{num(a.qty)}</b> pz (lotto {a.lot})</div>)}</td>
                <td>{r.status === "OPEN" ? <Badge tone="red">Aperto</Badge> : <Badge tone="green">Chiuso</Badge>}</td>
                <td>{r.status === "OPEN" && <Button variant="secondary" onClick={() => close(r.id)}>Chiudi con reso</Button>}</td>
              </tr>
            ))}</tbody></table>
        )}
      </Card>
    </>
  );
}
