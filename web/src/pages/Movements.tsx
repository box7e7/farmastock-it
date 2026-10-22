import { useState } from "react";
import { dateTime, num } from "../api";
import { useApp } from "../App";
import { Card, Empty, PageHeader, movementLabels, useApi } from "../components/ui";

export default function Movements() {
  const { store } = useApp();
  const [type, setType] = useState("");
  const { data } = useApi<any[]>(`/movements?type=${type}`);
  return (
    <>
      <PageHeader title="Movimenti di magazzino" subtitle={`${store.name} · registro immutabile (ultimi 300)`} />
      <Card>
        <div className="border-b border-slate-100 p-3">
          <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Tutti i tipi</option>{Object.entries(movementLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {data?.length === 0 && <Empty>Nessun movimento</Empty>}
        {data && data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="tbl"><thead><tr><th>Data</th><th>Tipo</th><th>Prodotto</th><th>Lotto</th><th className="num">Q.tà</th><th>Riferimento</th></tr></thead>
              <tbody>{data.map((m) => (
                <tr key={m.id}><td className="whitespace-nowrap">{dateTime(m.createdAt)}</td><td>{movementLabels[m.type] ?? m.type}</td><td>{m.product.name}</td>
                  <td className="font-mono text-xs">{m.lot.lot}</td><td className={`num font-medium ${m.qty < 0 ? "text-rose-700" : "text-emerald-700"}`}>{m.qty > 0 ? "+" : ""}{num(m.qty)}</td><td className="text-xs text-slate-500">{m.ref}</td></tr>
              ))}</tbody></table>
          </div>
        )}
      </Card>
    </>
  );
}
