import { useEffect, useRef, useState } from "react";

// ---------- Types ----------
type Risk = {
  name: string;
  likelihood: number | ""; // % 0..100
  min: number | ""; // days
  mode: number | "";
  max: number | "";
  kill: 0 | 1 | "";
  notes?: string;
};

type Results = {
  successPct: number; // 0..1
  killedPct: number; // 0..1
  expectedDelayNotKilled: number; // days
  p50Late: number; // days (only late & not killed)
  p85Late: number;
  p90Late: number;
  runs: number;
  lateCount: number;
  notKilledCount: number;
};

// ---------- Worker code as a string (typed to satisfy TS) ----------
const workerCode = () => {
  const makeMulberry32 = (seed: number) => {
    return function rng(): number {
      seed |= 0;
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const sampleTriangular = (a: number, m: number, b: number, rng: () => number): number => {
    if (!(a < b) || !(a <= m && m <= b)) return 0; // guard invalid
    const u = rng();
    const k = (m - a) / Math.max(1e-12, b - a);
    if (u <= k) return a + Math.sqrt(u * (b - a) * (m - a));
    return b - Math.sqrt((1 - u) * (b - a) * (b - m));
  };

  const percentile = (arr: number[], p: number): number => {
    if (!arr.length) return 0;
    const a = arr.slice().sort((x: number, y: number) => x - y);
    const idx = (a.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return a[lo];
    const w = idx - lo;
    return a[lo] * (1 - w) + a[hi] * w;
  };

  self.onmessage = (e: MessageEvent) => {
    const data = (e as any).data || {};
    if (data.cmd !== "run") return;

    const seed = Number(data.seed) || (Date.now() % 2147483647);
    const rng = makeMulberry32(seed);

    const risks = data.risks || [] as any[];
    const R: { p: number; a: number; m: number; b: number; kill: number }[] = [];
    for (let i = 0; i < risks.length; i++) {
      const r = risks[i] || {};
      const p = Math.max(0, Math.min(1, (Number(r.likelihood) || 0) / 100));
      const a = Number(r.min) || 0;
      const m = Number(r.mode) || 0;
      const b = Number(r.max) || 0;
      const kill = Number(r.kill) ? 1 : 0;
      if (isFinite(p) && p > 0 && (kill === 1 || (a !== 0 || m !== 0 || b !== 0))) {
        R.push({ p, a, m, b, kill });
      }
    }

    const N = Math.max(1, Math.min(20000, Math.floor(Number(data.iterations) || 0)));
    const slack = Math.max(0, Number(data.slack) || 0);

    let successCount = 0;
    let killedCount = 0;
    let notKilledCount = 0;
    let sumDelayNotKilled = 0;
    const lateDelays: number[] = [];

    for (let i = 0; i < N; i++) {
      let anyKill = false;
      let totalDelay = 0;
      for (let j = 0; j < R.length; j++) {
        const r = R[j];
        if (rng() < r.p) {
          if (r.kill === 1) anyKill = true;
          if (r.b > r.a && r.m >= r.a && r.m <= r.b) {
            totalDelay += sampleTriangular(r.a, r.m, r.b, rng);
          }
        }
      }
      const success = !anyKill && totalDelay <= slack;
      if (success) successCount++;
      if (anyKill) killedCount++;
      if (!anyKill) {
        notKilledCount++;
        sumDelayNotKilled += totalDelay;
        if (totalDelay > slack) lateDelays.push(totalDelay);
      }
      if (i % 1000 === 0) (self as any).postMessage({ type: "progress", done: i, total: N });
    }

    const successPct = successCount / N;
    const killedPct = killedCount / N;
    const expectedDelayNotKilled = notKilledCount ? sumDelayNotKilled / notKilledCount : 0;
    const p50Late = percentile(lateDelays, 0.5);
    const p85Late = percentile(lateDelays, 0.85);
    const p90Late = percentile(lateDelays, 0.9);

    (self as any).postMessage({
      type: "done",
      results: {
        successPct,
        killedPct,
        expectedDelayNotKilled,
        p50Late,
        p85Late,
        p90Late,
        runs: N,
        lateCount: lateDelays.length,
        notKilledCount,
      },
    });
  };
};

function useWorker() {
  const workerRef = useRef<Worker | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const code = workerCode.toString();
    const blob = new Blob([`(${code})()`], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const w = new Worker(url);
    workerRef.current = w;
    URL.revokeObjectURL(url);

    w.onmessage = (e: MessageEvent) => {
      if ((e as any).data?.type === "progress") {
        setProgress({ done: (e as any).data.done, total: (e as any).data.total });
      } else if ((e as any).data?.type === "done") {
        setResults((e as any).data.results);
        setRunning(false);
        setProgress(null);
      }
    };

    return () => {
      w.terminate();
      workerRef.current = null;
    };
  }, []);

  const run = (risks: Risk[], iterations: number, slack: number, seed?: number) => {
    if (!workerRef.current) return;
    setRunning(true);
    setResults(null);
    setProgress({ done: 0, total: Math.min(20000, Math.max(1, Math.floor(iterations))) });
    workerRef.current.postMessage({ cmd: "run", risks, iterations, slack, seed: seed ?? Math.floor(Math.random() * 1e9) });
  };

  const stop = () => {
    if (!workerRef.current) return;
    workerRef.current.terminate();
    const code = workerCode.toString();
    const blob = new Blob([`(${code})()`], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    workerRef.current = w;
    setRunning(false);
    setProgress(null);
  };

  return { run, stop, running, progress, results };
}

const emptyRisk = (): Risk => ({ name: "", likelihood: "", min: "", mode: "", max: "", kill: "", notes: "" });

const sampleRisks: Risk[] = [
  { name: "Minor bugs backlog", likelihood: 50, min: 2, mode: 4, max: 7, kill: 0, notes: "Nuisance work slows testing" },
  { name: "Vendor part late", likelihood: 25, min: 10, mode: 20, max: 40, kill: 0, notes: "External dependency" },
  { name: "Critical compliance issue", likelihood: 5, min: 0, mode: 0, max: 0, kill: 1, notes: "If it hits, project is stopped" },
  { name: "Team attrition", likelihood: 15, min: 7, mode: 14, max: 28, kill: 0, notes: "Loss of key engineer" },
  { name: "Scope creep", likelihood: 40, min: 3, mode: 7, max: 14, kill: 0, notes: "Adds unplanned features" },
  { name: "Earthquake", likelihood: 1, min: 0, mode: 0, max: 0, kill: 1, notes: "Disaster" },
  { name: "Covid", likelihood: 5, min: 0, mode: 0, max: 0, kill: 1, notes: "Disaster" },
];

export default function RiskSimulatorApp() {
  const [risks, setRisks] = useState<Risk[]>(() => {
    const base = [...sampleRisks];
    while (base.length < 10) base.push(emptyRisk());
    return base;
  });
  const [iterations, setIterations] = useState(20000);
  const [slack, setSlack] = useState(15);
  const [seed, setSeed] = useState<string>("");
  const { run, stop, running, progress, results } = useWorker();

  const canAddRow = risks.length < 50;

  const addRow = () => {
    if (!canAddRow) return;
    setRisks((r) => [...r, emptyRisk()]);
  };

  const add5 = () => {
    setRisks((r) => {
      const toAdd = Math.min(5, 50 - r.length);
      return [...r, ...Array.from({ length: toAdd }, emptyRisk)];
    });
  };

  const loadSample = () => {
    const rows: Risk[] = [...sampleRisks];
    while (rows.length < Math.max(10, risks.length)) rows.push(emptyRisk());
    setRisks(rows.slice(0, 50));
  };

  const clearAll = () => {
    setRisks(Array.from({ length: 10 }, emptyRisk));
  };

  const handleRun = () => {
    const prepared = risks
      .slice(0, 50)
      .map((r) => ({
        ...r,
        likelihood: r.likelihood === "" ? 0 : Number(r.likelihood),
        min: r.min === "" ? 0 : Number(r.min),
        mode: r.mode === "" ? 0 : Number(r.mode),
        max: r.max === "" ? 0 : Number(r.max),
        kill: (r.kill === "" ? 0 : Number(r.kill)) as 0 | 1,
      }))
      .filter((r) => (
        (r.likelihood as number) > 0 &&
        (r.kill === 1 || (Number.isFinite(r.min) && Number.isFinite(r.mode) && Number.isFinite(r.max)))
      ));

    const iters = Math.max(1, Math.min(20000, Math.floor(iterations)));
    const slackDays = Math.max(0, Number(slack));
    const sd = seed.trim() !== "" ? Number(seed) : Math.floor(Math.random() * 1e9);
    run(prepared as any, iters, slackDays, sd);
  };

  const fmtPct = (x?: number | null) => (x == null ? "—" : (x * 100).toFixed(1) + "%");
  const fmtNum = (x?: number | null) => (x == null ? "—" : (Math.round((x as number) * 10) / 10).toString());

  return (
    <div className="container">
      <h1 className="page-title">Project Risk Simulator</h1>
      <p className="subtitle">Up to 50 risks · 20,000 simulations · Client-side only (no backend)</p>

      <div className="grid-3 mb-6">
        <div className="card">
          <label className="label">Slack (days)</label>
          <input type="number" className="input" value={slack}
                 onChange={(e) => setSlack(Number(e.target.value))} min={0} />
        </div>
        <div className="card">
          <label className="label">Iterations (max 20,000)</label>
          <input type="number" className="input" value={iterations}
                 onChange={(e) => setIterations(Number(e.target.value))} min={100} max={20000} step={100} />
        </div>
        <div className="card">
          <label className="label">Random Seed (optional)</label>
          <input type="number" className="input" value={seed}
                 onChange={(e) => setSeed(e.target.value)} placeholder="e.g., 12345" />
        </div>
      </div>

      <div className="button-row">
        <button onClick={addRow} disabled={!canAddRow} className="btn btn-dark">+ Add Row</button>
        <button onClick={add5} disabled={!canAddRow} className="btn btn-outline">+ Add 5 Rows</button>
        <button onClick={loadSample} className="btn btn-outline">Load Sample Risks</button>
        <button onClick={clearAll} className="btn btn-outline">Clear All</button>
        <div className="spacer" />
        {!running ? (
          <button onClick={handleRun} className="btn btn-success">Run Simulation</button>
        ) : (
          <button onClick={stop} className="btn btn-danger">Stop</button>
        )}
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Risk</th>
              <th>Likelihood %</th>
              <th>Min (days)</th>
              <th>Most likely</th>
              <th>Max (days)</th>
              <th>Kill (0/1)</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {risks.map((r, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>
                  <input className="input input-sm" style={{ width: 260 }} value={r.name}
                         onChange={(e) => setRisks(prev => prev.map((x, i) => i===idx? { ...x, name: e.target.value }: x))} />
                </td>
                <td>
                  <input type="number" min={0} max={100} className="input input-sm" style={{ width: 110 }} value={r.likelihood as any}
                         onChange={(e) => setRisks(prev => prev.map((x,i)=> i===idx? { ...x, likelihood: e.target.value === ''? '' : Number(e.target.value) }: x))} />
                </td>
                <td>
                  <input type="number" min={0} className="input input-sm" style={{ width: 100 }} value={r.min as any}
                         onChange={(e) => setRisks(prev => prev.map((x,i)=> i===idx? { ...x, min: e.target.value === ''? '' : Number(e.target.value) }: x))} />
                </td>
                <td>
                  <input type="number" min={0} className="input input-sm" style={{ width: 100 }} value={r.mode as any}
                         onChange={(e) => setRisks(prev => prev.map((x,i)=> i===idx? { ...x, mode: e.target.value === ''? '' : Number(e.target.value) }: x))} />
                </td>
                <td>
                  <input type="number" min={0} className="input input-sm" style={{ width: 100 }} value={r.max as any}
                         onChange={(e) => setRisks(prev => prev.map((x,i)=> i===idx? { ...x, max: e.target.value === ''? '' : Number(e.target.value) }: x))} />
                </td>
                <td>
                  <input type="number" min={0} max={1} className="input input-sm" style={{ width: 80 }} value={r.kill as any}
                         onChange={(e) => {
                           const val = e.target.value === '' ? '' : (Number(e.target.value) ? 1 : 0);
                           setRisks(prev => prev.map((x,i)=> i===idx? { ...x, kill: val as any }: x))
                         }} />
                </td>
                <td>
                  <input className="input input-sm" style={{ width: 360 }} value={r.notes || ''}
                         onChange={(e) => setRisks(prev => prev.map((x,i)=> i===idx? { ...x, notes: e.target.value }: x))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="progress mt-4">
        {progress && running && (
          <>
            <div className="progress-track">
              <div className="progress-bar" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
            <div className="progress-text">{Math.floor((progress.done / progress.total) * 100)}% · {progress.done}/{progress.total}</div>
          </>
        )}
      </div>

      <div className="stats-grid mt-6">
        <div className="stat-card">
          <div className="stat-label">Likelihood of Success (meets Slack & not killed)</div>
          <div className="stat-value">{results ? fmtPct(results.successPct) : "—"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Expected Delay (when not killed)</div>
          <div className="stat-value">{results ? fmtNum(results.expectedDelayNotKilled) : "—"} <span className="stat-small">days</span></div>
          <div className="stat-label" style={{ marginTop: 4 }}>Includes small delays even if within Slack</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Project canceled chance</div>
          <div className="stat-value">{results ? fmtPct(results.killedPct) : "—"}</div>
        </div>
      </div>

      <div className="stats-grid mt-4">
        <div className="stat-card">
          <div className="stat-label">P50 of Delay (when late & not killed)</div>
          <div className="stat-value">{results ? fmtNum(results.p50Late) : "—"} <span className="stat-small">days</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">P85 of Delay (when late & not killed)</div>
          <div className="stat-value">{results ? fmtNum(results.p85Late) : "—"} <span className="stat-small">days</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">P90 of Delay (when late & not killed)</div>
          <div className="stat-value">{results ? fmtNum(results.p90Late) : "—"} <span className="stat-small">days</span></div>
        </div>
      </div>

      {results && (
        <div className="meta mt-4">
          <div>Runs: {results.runs.toLocaleString()} · Not killed runs: {results.notKilledCount.toLocaleString()} · Late runs: {results.lateCount.toLocaleString()}</div>
        </div>
      )}

      <div className="notes mt-8">
        <p><strong>Notes</strong>: Likelihoods are per-risk independent Bernoulli events. Delays are sampled from a Triangular(min, mode, max) when the risk occurs. Success = not killed & total delay ≤ Slack.</p>
      </div>
    </div>
  );
}
