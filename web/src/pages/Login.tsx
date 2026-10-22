import { useState } from "react";
import { api, session } from "../api";
import { Alert, Button } from "../components/ui";

const demo = [
  ["admin@farmastock.it", "admin123", "Amministratore"],
  ["farmacista@farmastock.it", "farma123", "Farmacista"],
  ["cassa@farmastock.it", "cassa123", "Cassiere"],
  ["magazzino@farmastock.it", "magazzino123", "Magazziniere"],
];

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("farmacista@farmastock.it");
  const [password, setPassword] = useState("farma123");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ token: string; user: { storeId: string | null } }>("/auth/login", { method: "POST", body: { email, password } });
      session.token = res.token;
      if (res.user.storeId) session.storeId = res.user.storeId;
      onLogin();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-50 to-slate-100 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-700 text-2xl font-bold text-white">+</div>
          <h1 className="text-xl font-semibold">FarmaStock IT</h1>
          <p className="text-sm text-slate-500">Gestione magazzino per farmacie e catene</p>
        </div>
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {error && <Alert>{error}</Alert>}
          <div><label className="label">Email</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></div>
          <div><label className="label">Password</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <Button className="w-full" disabled={busy}>{busy ? "Accesso…" : "Accedi"}</Button>
        </form>
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white/60 p-3 text-xs text-slate-500">
          <div className="mb-1 font-semibold text-slate-600">Utenti demo</div>
          {demo.map(([e, p, r]) => (
            <button key={e} type="button" onClick={() => { setEmail(e); setPassword(p); }} className="block w-full rounded px-1 py-0.5 text-left hover:bg-slate-100">
              <span className="font-medium text-slate-700">{r}</span> · {e} / {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
