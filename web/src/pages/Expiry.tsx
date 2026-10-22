import { useState } from "react";
import { Trash2, Undo2 } from "lucide-react";
import { api, date, eur, num } from "../api";
import { useApp } from "../App";
import { Alert, Badge, Button, Card, Empty, Kpi, PageHeader, useApi } from "../components/ui";

interface Row { lotId: string; lot: string; expiry: string; qty: number; days: number; bucket: string; owner: string; blocked: boolean; product: string; supplier?: string; value: number }
const buckets = [["EXPIRED", "Scaduti", "red"], ["30", "≤ 30 gg", "red"], ["60", "31–60 gg", "amber"], ["90", "61–90 gg", "amber"], ["180", "91–180 gg", "gray"]] as const;

export default function Expiry() {
  const { store } = useApp();
  const { data, reload } = useApi<Row[]>("/expiry");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const selected = Object.keys(sel).filter((k) => sel[k]);

  async function act(action: "WRITEOFF" | "RETURN") {
    try {
      const r = await api<{ ref: string }>("/expiry/action", { method: "POST", body: { lotIds: selected, action } });
      setMsg({ tone: "green", text: `${action === "RETURN" ? "Reso al fornitore" : "Scarico per distruzione"} ${r.ref} registrato (${selected.length} lotti).` });
      setSel({}); reload();
    } catch (e) { setMsg({ tone: "red", text: (e as Error).message }); }
  }

  const sum = (b: string) => (data ?? []).filter((r) => r.bucket === b).reduce((s, r) => s + r.value, 0);

  return (
    <>
      <PageHeader title="Gestione scadenze" subtitle={`${store.name} · lotti in scadenza entro 180 giorni (logica FEFO al banco)`}
        actions={<><Button variant="secondary" disabled={!selected.length} onClick={() => act("RETURN")}><Undo2 size={15} /> Reso a fornitore</Button>
          <Button variant="danger" disabled={!selected.length} onClick={() => act("WRITEOFF")}><Trash2 size={15} /> Scarico per distruzione</Button></>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        {buckets.map(([k, l]) => <Kpi key={k} label={l} value={eur(sum(k))} tone={k === "EXPIRED" || k === "30" ? "bad" : k === "180" ? "default" : "warn"} />)}
      </div>
      {msg && <div className="mb-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <Card>
        {data?.length === 0 && <Empty>Nessun lotto in scadenza nei prossimi 180 giorni</Empty>}
        {data && data.length > 0 && (
          <table className="tbl"><thead><tr><th /><th>Prodotto</th><th>Lotto</th><th>Scadenza</th><th>Fascia</th><th>Fornitore</th><th className="num">Q.tà</th><th className="num">Valore</th></tr></thead>
            <tbody>{data.map((r) => {
              const b = buckets.find(([k]) => k === r.bucket)!;
              return (
                <tr key={r.lotId}>
                  <td><input type="checkbox" checked={!!sel[r.lotId]} onChange={(e) => setSel({ ...sel, [r.lotId]: e.target.checked })} /></td>
                  <td>{r.product} {r.owner === "ASL" && <Badge tone="amber">DPC</Badge>} {r.blocked && <Badge tone="red">Richiamo</Badge>}</td>
                  <td className="font-mono text-xs">{r.lot}</td>
                  <td>{date(r.expiry)} <span className="text-xs text-slate-400">({r.days < 0 ? `scaduto da ${-r.days} gg` : `tra ${r.days} gg`})</span></td>
                  <td><Badge tone={b[2]}>{b[1]}</Badge></td>
                  <td className="text-xs text-slate-500">{r.supplier}</td>
                  <td className="num">{num(r.qty)}</td>
                  <td className="num">{eur(r.value)}</td>
                </tr>
              );
            })}</tbody></table>
        )}
      </Card>
    </>
  );
}
