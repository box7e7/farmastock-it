import { Printer } from "lucide-react";
import { dateTime, num } from "../api";
import { useApp } from "../App";
import { Button, Card, Empty, PageHeader, movementLabels, useApi } from "../components/ui";

export default function Narcotics() {
  const { store } = useApp();
  const { data } = useApi<any[]>("/narcotics");
  return (
    <>
      <PageHeader title="Registro stupefacenti (entrata/uscita)" subtitle={`${store.name} · DPR 309/90 · vista in sola lettura sul registro movimenti immutabile`}
        actions={<Button variant="secondary" onClick={() => window.print()}><Printer size={15} /> Stampa</Button>} />
      <p className="mb-4 text-xs text-slate-500">MVP: le registrazioni derivano automaticamente da carichi, vendite e rettifiche e non sono modificabili; le correzioni avvengono solo con movimenti di storno. La conformità completa al DM 11/05/2010 (chiusura periodica, firma) è prevista nella fase 5.</p>
      {data?.length === 0 && <Card><Empty>Nessun medicinale stupefacente a catalogo</Empty></Card>}
      {data?.map((s) => (
        <Card key={s.product.id} className="mb-4" title={`${s.product.name} · AIC ${s.product.aic} · ${s.product.activeIngredient ?? ""} · giacenza ${num(s.balance)}`}>
          {s.rows.length === 0 ? <Empty>Nessun movimento</Empty> : (
            <table className="tbl"><thead><tr><th className="num">N.</th><th>Data</th><th>Operazione</th><th>Lotto</th><th>Rif. documento</th><th className="num">Entrata</th><th className="num">Uscita</th><th className="num">Giacenza</th></tr></thead>
              <tbody>{s.rows.map((r: any) => (
                <tr key={r.n}><td className="num text-slate-400">{r.n}</td><td className="whitespace-nowrap">{dateTime(r.date)}</td><td>{movementLabels[r.type] ?? r.type}</td><td className="font-mono text-xs">{r.lot}</td>
                  <td className="text-xs text-slate-500">{r.ref}</td><td className="num text-emerald-700">{r.in || ""}</td><td className="num text-rose-700">{r.out || ""}</td><td className="num font-semibold">{num(r.balance)}</td></tr>
              ))}</tbody></table>
          )}
        </Card>
      ))}
    </>
  );
}
