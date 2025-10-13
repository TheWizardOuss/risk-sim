import { useEffect, useRef, useState } from "react";
import { DonutGauge, Histogram, CDF, StackedBar, HBars } from './components/Charts';

// ---------- Types ----------
type Risk = {
  name: string;
  likelihood: number | ""; // % 0..100
  min: number | ""; // days
  mode: number | "";
  max: number | "";
  costMin: number | ""; // budget units
  costMode: number | "";
  costMax: number | "";
  kill: 0 | 1 | "";
  notes?: string;
};

type Results = {
  successPct: number; // 0..1
  killedPct: number; // 0..1
  budgetExceededPct: number; // 0..1
  expectedDelayNotKilled: number; // days
  expectedCostNotKilled: number; // budget units
  p50Late: number; // days (only late & not killed)
  p85Late: number;
  p90Late: number;
  p50BudgetOverrun: number; // budget units beyond slack
  p85BudgetOverrun: number;
  p90BudgetOverrun: number;
  runs: number;
  lateCount: number;
  budgetExceededCount: number;
  notKilledCount: number;
  lateBins?: number[]; // histogram counts of late delays (> slack)
  lateMax?: number; // max of late delays (x-axis max)
  budgetBins?: number[];
  budgetMax?: number;
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

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
    const R: {
      p: number;
      a: number;
      m: number;
      b: number;
      kill: number;
      costA: number;
      costM: number;
      costB: number;
    }[] = [];
    for (let i = 0; i < risks.length; i++) {
      const r = risks[i] || {};
      const p = Math.max(0, Math.min(1, (Number(r.likelihood) || 0) / 100));
      const a = Number(r.min) || 0;
      const m = Number(r.mode) || 0;
      const b = Number(r.max) || 0;
      const costA = Number(r.costMin) || 0;
      const costM = Number(r.costMode) || 0;
      const costB = Number(r.costMax) || 0;
      const kill = Number(r.kill) ? 1 : 0;
      const hasDelay = (a !== 0 || m !== 0 || b !== 0);
      const hasCost = (costA !== 0 || costM !== 0 || costB !== 0);
      if (isFinite(p) && p > 0 && (kill === 1 || hasDelay || hasCost)) {
        R.push({ p, a, m, b, kill, costA, costM, costB });
      }
    }

    const N = Math.max(1, Math.min(50000, Math.floor(Number(data.iterations) || 0)));
    const slack = Math.max(0, Number(data.slack) || 0);
    const budgetSlack = Math.max(0, Number(data.budgetSlack) || 0);

    let successCount = 0;
    let killedCount = 0;
    let notKilledCount = 0;
    let sumDelayNotKilled = 0;
    let sumCostNotKilled = 0;
    let budgetExceededCount = 0;
    const lateDelays: number[] = [];
    const budgetOverruns: number[] = [];

    for (let i = 0; i < N; i++) {
      let anyKill = false;
      let totalDelay = 0;
      let totalCost = 0;
      for (let j = 0; j < R.length; j++) {
        const r = R[j];
        if (rng() < r.p) {
          if (r.kill === 1) anyKill = true;
          if (r.b > r.a && r.m >= r.a && r.m <= r.b) {
            totalDelay += sampleTriangular(r.a, r.m, r.b, rng);
          }
          if (r.costB > r.costA && r.costM >= r.costA && r.costM <= r.costB) {
            totalCost += sampleTriangular(r.costA, r.costM, r.costB, rng);
          } else if (r.costA === r.costB && r.costA === r.costM && r.costA !== 0) {
            totalCost += r.costA;
          }
        }
      }
      const overBudget = totalCost > budgetSlack;
      if (overBudget) budgetExceededCount++;
      const success = !anyKill && totalDelay <= slack && !overBudget;
      if (success) successCount++;
      if (anyKill) killedCount++;
      if (!anyKill) {
        notKilledCount++;
        sumDelayNotKilled += totalDelay;
        sumCostNotKilled += totalCost;
        if (totalDelay > slack) lateDelays.push(totalDelay);
        if (overBudget) budgetOverruns.push(totalCost - budgetSlack);
      }
      if (i % 1000 === 0) (self as any).postMessage({ type: "progress", done: i, total: N });
    }

    const successPct = successCount / N;
    const killedPct = killedCount / N;
    const expectedDelayNotKilled = notKilledCount ? sumDelayNotKilled / notKilledCount : 0;
    const expectedCostNotKilled = notKilledCount ? sumCostNotKilled / notKilledCount : 0;
    const budgetExceededPct = budgetExceededCount / N;
    const p50Late = percentile(lateDelays, 0.5);
    const p85Late = percentile(lateDelays, 0.85);
    const p90Late = percentile(lateDelays, 0.9);
    const p50BudgetOverrun = percentile(budgetOverruns, 0.5);
    const p85BudgetOverrun = percentile(budgetOverruns, 0.85);
    const p90BudgetOverrun = percentile(budgetOverruns, 0.9);

    // Build histogram of late delays to avoid sending large arrays
    let lateBins: number[] = [];
    let lateMax = 0;
    if (lateDelays.length > 0) {
      lateMax = Math.max(...lateDelays);
      const BIN_COUNT = 20;
      lateBins = Array(BIN_COUNT).fill(0);
      const width = lateMax > 0 ? lateMax / BIN_COUNT : 1;
      for (let i = 0; i < lateDelays.length; i++) {
        const v = lateDelays[i];
        const b = Math.min(BIN_COUNT - 1, Math.floor(v / Math.max(1e-12, width)));
        lateBins[b]++;
      }
    }

    let budgetBins: number[] = [];
    let budgetMax = 0;
    if (budgetOverruns.length > 0) {
      budgetMax = Math.max(...budgetOverruns);
      const BIN_COUNT = 20;
      budgetBins = Array(BIN_COUNT).fill(0);
      const width = budgetMax > 0 ? budgetMax / BIN_COUNT : 1;
      for (let i = 0; i < budgetOverruns.length; i++) {
        const v = budgetOverruns[i];
        const b = Math.min(BIN_COUNT - 1, Math.floor(v / Math.max(1e-12, width)));
        budgetBins[b]++;
      }
    }

    (self as any).postMessage({
      type: "done",
      results: {
        successPct,
        killedPct,
        budgetExceededPct,
        expectedDelayNotKilled,
        expectedCostNotKilled,
        p50Late,
        p85Late,
        p90Late,
        p50BudgetOverrun,
        p85BudgetOverrun,
        p90BudgetOverrun,
        runs: N,
        lateCount: lateDelays.length,
        budgetExceededCount,
        notKilledCount,
        lateBins,
        lateMax,
        budgetBins,
        budgetMax,
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

  const run = (risks: Risk[], iterations: number, slack: number, budgetSlack: number, seed?: number) => {
    if (!workerRef.current) return;
    setRunning(true);
    setResults(null);
    setProgress({ done: 0, total: Math.min(50000, Math.max(1, Math.floor(iterations))) });
    workerRef.current.postMessage({
      cmd: "run",
      risks,
      iterations,
      slack,
      budgetSlack,
      seed: seed ?? Math.floor(Math.random() * 1e9),
    });
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

const emptyRisk = (): Risk => ({
  name: "",
  likelihood: "",
  min: "",
  mode: "",
  max: "",
  costMin: "",
  costMode: "",
  costMax: "",
  kill: "",
  notes: "",
});

const sampleRisks: Risk[] = [
  { name: "Minor bugs backlog", likelihood: 50, min: 2, mode: 4, max: 7, costMin: 10, costMode: 18, costMax: 32, kill: 0, notes: "Nuisance work slows testing" },
  { name: "Vendor part late", likelihood: 25, min: 10, mode: 20, max: 40, costMin: 25, costMode: 40, costMax: 70, kill: 0, notes: "External dependency" },
  { name: "Critical compliance issue", likelihood: 5, min: 0, mode: 0, max: 0, costMin: 50, costMode: 90, costMax: 140, kill: 1, notes: "If it hits, project is stopped" },
  { name: "Team attrition", likelihood: 15, min: 7, mode: 14, max: 28, costMin: 35, costMode: 45, costMax: 70, kill: 0, notes: "Loss of key engineer" },
  { name: "Scope creep", likelihood: 40, min: 3, mode: 7, max: 14, costMin: 15, costMode: 28, costMax: 50, kill: 0, notes: "Adds unplanned features" },
  { name: "Earthquake", likelihood: 1, min: 0, mode: 0, max: 0, costMin: 80, costMode: 120, costMax: 200, kill: 1, notes: "Disaster" },
  { name: "Covid", likelihood: 5, min: 0, mode: 0, max: 0, costMin: 60, costMode: 100, costMax: 160, kill: 1, notes: "Disaster" },
];

export default function RiskSimulatorApp() {
  const [risks, setRisks] = useState<Risk[]>(() => {
    const base = [...sampleRisks];
    while (base.length < 10) base.push(emptyRisk());
    return base;
  });
  const [iterations, setIterations] = useState(20000);
  const [slack, setSlack] = useState(15);
  const [budgetSlack, setBudgetSlack] = useState(100);
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
        costMin: r.costMin === "" ? 0 : Number(r.costMin),
        costMode: r.costMode === "" ? 0 : Number(r.costMode),
        costMax: r.costMax === "" ? 0 : Number(r.costMax),
        kill: (r.kill === "" ? 0 : Number(r.kill)) as 0 | 1,
      }))
      .filter((r) => (
        (r.likelihood as number) > 0 &&
        (r.kill === 1 ||
          (Number.isFinite(r.min) && Number.isFinite(r.mode) && Number.isFinite(r.max) && (r.min !== 0 || r.mode !== 0 || r.max !== 0)) ||
          (Number.isFinite(r.costMin) && Number.isFinite(r.costMode) && Number.isFinite(r.costMax) && (r.costMin !== 0 || r.costMode !== 0 || r.costMax !== 0)))
      ));

    const iters = Math.max(1, Math.min(50000, Math.floor(iterations)));
    const slackDays = Math.max(0, Number(slack));
    const budgetSlackValue = Math.max(0, Number(budgetSlack));
    const sd = seed.trim() !== "" ? Number(seed) : Math.floor(Math.random() * 1e9);
    run(prepared as any, iters, slackDays, budgetSlackValue, sd);
  };

  const clearRow = (idx: number) => {
    setRisks(prev => prev.map((x, i) => (i === idx ? emptyRisk() : x)));
  };

  const fmtPct = (x?: number | null) => (x == null ? "—" : (x * 100).toFixed(1) + "%");
  const fmtNum = (x?: number | null) => (x == null ? "—" : (Math.round((x as number) * 10) / 10).toString());
  const fmtCurrency = (x?: number | null) => {
    if (x == null) return "—";
    return currencyFormatter.format(Math.round((x as number) * 100) / 100).replace(/\u00A0/g, ' ');
  };

  // Risk impact (static expected contribution approximation for ranking)
  const riskSummaries = risks
    .filter(r => (r.name?.trim() || r.likelihood || r.min || r.mode || r.max || r.costMin || r.costMode || r.costMax || r.kill) !== "")
    .map(r => {
      const p = Math.max(0, Math.min(1, (Number(r.likelihood) || 0) / 100));
      const a = Number(r.min) || 0;
      const m = Number(r.mode) || 0;
      const b = Number(r.max) || 0;
      const costA = Number(r.costMin) || 0;
      const costM = Number(r.costMode) || 0;
      const costB = Number(r.costMax) || 0;
      const kill = Number(r.kill) ? 1 : 0;
      const expectedDelay = kill ? 0 : ((a + m + b) / 3) * p;
      const expectedCost = kill ? 0 : ((costA + costM + costB) / 3) * p;
      const cancelProb = kill ? p : 0;
      return { name: r.name || "(untitled)", expectedDelay, expectedCost, cancelProb };
    })
    .filter(x => x.expectedDelay > 0 || x.expectedCost > 0 || x.cancelProb > 0);

  const delayImpact = riskSummaries
    .filter(x => x.expectedDelay > 0)
    .sort((x, y) => y.expectedDelay - x.expectedDelay)
    .slice(0, 8);

  const costImpact = riskSummaries
    .filter(x => x.expectedCost > 0)
    .sort((x, y) => y.expectedCost - x.expectedCost)
    .slice(0, 8);

  return (
    <div className="container">
      <h1 className="page-title">Project Risk Simulator</h1>
      <p className="subtitle">Up to 50 risks · 50,000 simulations · Client-side only (no backend)</p>

      <div className="grid-3 mb-6">
        <div className="card">
          <label className="label">Slack (days)</label>
          <input type="number" className="input" value={slack}
                 onChange={(e) => setSlack(Number(e.target.value))} min={0} />
        </div>
        <div className="card">
          <label className="label">Budget Slack (EUR)</label>
          <input type="number" className="input" value={budgetSlack}
                 onChange={(e) => setBudgetSlack(Number(e.target.value))} min={0} />
        </div>
        <div className="card">
          <label className="label">Iterations (max 50,000)</label>
          <input type="number" className="input" value={iterations}
                 onChange={(e) => setIterations(Number(e.target.value))} min={100} max={50000} step={100} />
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
              <th className="icon-cell"></th>
              <th title="Row number">#</th>
              <th title="Short name of the risk (e.g., Vendor part late). Free text.">Risk</th>
              <th title="Probability that this risk occurs during the period (0–100).">Likelihood %</th>
              <th title="Best-case delay in days if the risk occurs (triangular minimum). Must be ≤ Most likely ≤ Max.">Min (days)</th>
              <th title="Most likely delay in days if the risk occurs (triangular mode). Must be between Min and Max.">Most likely</th>
              <th title="Worst-case delay in days if the risk occurs (triangular maximum). Must be ≥ Most likely.">Max (days)</th>
              <th title="Best-case budget impact if the risk occurs (triangular minimum). Set 0 if no cost impact.">Cost Min (EUR)</th>
              <th title="Most likely budget impact if the risk occurs (triangular mode).">Cost Most likely (EUR)</th>
              <th title="Worst-case budget impact if the risk occurs (triangular maximum).">Cost Max (EUR)</th>
              <th title="Set to 1 if the risk cancels the project whenever it occurs; 0 otherwise. When 1, delay fields are ignored.">Kill (0/1)</th>
              <th title="Optional notes or clarifications about the risk.">Notes</th>
            </tr>
          </thead>
          <tbody>
            {risks.map((r, idx) => (
              <tr key={idx}>
                <td className="icon-cell">
                  <button className="icon-btn" title={`Clear row ${idx + 1}`} aria-label={`Clear row ${idx + 1}`}
                          onClick={() => clearRow(idx)}>
                    ×
                  </button>
                </td>
                <td>{idx + 1}</td>
                <td>
                  <input className="input input-sm" style={{ width: 260 }} value={r.name}
                         title="Short name of the risk (e.g., Vendor part late)."
                         onChange={(e) => setRisks(prev => prev.map((x, i) => i===idx? { ...x, name: e.target.value }: x))} />
                </td>
                <td>
                  <input type="number" min={0} max={100} className="input input-sm" style={{ width: 110 }} value={r.likelihood as any}
                         title="Probability this risk occurs (0–100)."
                         onChange={(e) => setRisks(prev => prev.map((x,i)=> i===idx? { ...x, likelihood: e.target.value === ''? '' : Number(e.target.value) }: x))} />
                </td>
                <td>
                  <input type="number" min={0} className="input input-sm" style={{ width: 100 }} value={r.min as any}
                         title="Best-case delay if risk occurs (triangular minimum)."
                         onChange={(e) => setRisks(prev => prev.map((x,i)=> i===idx? { ...x, min: e.target.value === ''? '' : Number(e.target.value) }: x))} />
                </td>
                <td>
                  <input type="number" min={0} className="input input-sm" style={{ width: 100 }} value={r.mode as any}
                         title="Most likely delay if risk occurs (triangular mode)."
                         onChange={(e) => setRisks(prev => prev.map((x,i)=> i===idx? { ...x, mode: e.target.value === ''? '' : Number(e.target.value) }: x))} />
                </td>
                <td>
                  <input type="number" min={0} className="input input-sm" style={{ width: 100 }} value={r.max as any}
                         title="Worst-case delay if risk occurs (triangular maximum)."
                         onChange={(e) => setRisks(prev => prev.map((x,i)=> i===idx? { ...x, max: e.target.value === ''? '' : Number(e.target.value) }: x))} />
                </td>
                <td>
                  <input type="number" min={0} className="input input-sm" style={{ width: 110 }} value={r.costMin as any}
                         title="Best-case budget impact if risk occurs (triangular minimum)."
                         onChange={(e) => setRisks(prev => prev.map((x,i)=> i===idx? { ...x, costMin: e.target.value === ''? '' : Number(e.target.value) }: x))} />
                </td>
                <td>
                  <input type="number" min={0} className="input input-sm" style={{ width: 110 }} value={r.costMode as any}
                         title="Most likely budget impact if risk occurs (triangular mode)."
                         onChange={(e) => setRisks(prev => prev.map((x,i)=> i===idx? { ...x, costMode: e.target.value === ''? '' : Number(e.target.value) }: x))} />
                </td>
                <td>
                  <input type="number" min={0} className="input input-sm" style={{ width: 110 }} value={r.costMax as any}
                         title="Worst-case budget impact if risk occurs (triangular maximum)."
                         onChange={(e) => setRisks(prev => prev.map((x,i)=> i===idx? { ...x, costMax: e.target.value === ''? '' : Number(e.target.value) }: x))} />
                </td>
                <td>
                  <input type="number" min={0} max={1} className="input input-sm" style={{ width: 80 }} value={r.kill as any}
                         title="1 = project is canceled if this risk occurs; 0 = not canceling. When 1, delay fields are ignored."
                         onChange={(e) => {
                           const val = e.target.value === '' ? '' : (Number(e.target.value) ? 1 : 0);
                           setRisks(prev => prev.map((x,i)=> i===idx? { ...x, kill: val as any }: x))
                         }} />
                </td>
                <td>
                  <input className="input input-sm" style={{ width: 360 }} value={r.notes || ''}
                         placeholder="Optional notes (assumptions, sources, scope, etc.)"
                         title="Optional notes or clarifications about the risk."
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
        <div className="stat-card">
          <div className="stat-label">Budget overrun probability</div>
          <div className="stat-value">{results ? fmtPct(results.budgetExceededPct) : "—"}</div>
          <div className="stat-label" style={{ marginTop: 4 }}>Share of runs exceeding budget slack</div>
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

      <div className="stats-grid mt-4">
        <div className="stat-card">
          <div className="stat-label">Expected Budget Loss (when not killed)</div>
          <div className="stat-value">{results ? fmtCurrency(results.expectedCostNotKilled) : "—"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">P50 Budget Overrun (when over)</div>
          <div className="stat-value">
            {results && results.budgetExceededCount > 0 ? (
              fmtCurrency(results.p50BudgetOverrun)
            ) : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">P85 Budget Overrun (when over)</div>
          <div className="stat-value">
            {results && results.budgetExceededCount > 0 ? (
              fmtCurrency(results.p85BudgetOverrun)
            ) : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">P90 Budget Overrun (when over)</div>
          <div className="stat-value">
            {results && results.budgetExceededCount > 0 ? (
              fmtCurrency(results.p90BudgetOverrun)
            ) : '—'}
          </div>
        </div>
      </div>

      {results && (
        <div className="meta mt-4">
          <div>Runs: {results.runs.toLocaleString()} · Not killed runs: {results.notKilledCount.toLocaleString()} · Late runs: {results.lateCount.toLocaleString()} · Budget overruns: {results.budgetExceededCount.toLocaleString()}</div>
        </div>
      )}

      <div className="notes mt-8">
        <p><strong>Notes</strong>: Likelihoods are per-risk independent Bernoulli events. Delays and costs (in EUR) are sampled from Triangular(min, mode, max) when the risk occurs. Success = not killed & total delay ≤ Slack & total cost ≤ Budget Slack.</p>
      </div>

      {/* Charts */}
      <div className="charts-grid mt-6">
        <div className="chart-card">
          <div className="chart-title">On-time Delivery Probability</div>
          <DonutGauge value={results?.successPct || 0} label="On time" />
        </div>

        <div className="chart-card">
          <div className="chart-title">Outcomes Breakdown</div>
          {results ? (
            <>
              <StackedBar
                segments={[
                  { value: results.successPct, color: '#16a34a', label: 'On-time' },
                  { value: Math.max(0, 1 - results.killedPct - results.successPct), color: '#2563eb', label: 'Late / Over budget' },
                  { value: results.killedPct, color: '#dc2626', label: 'Killed' },
                ]}
              />
              <div className="legend">
                <span className="legend-item"><span className="legend-swatch" style={{ background: '#16a34a' }} /> On-time</span>
                <span className="legend-item"><span className="legend-swatch" style={{ background: '#2563eb' }} /> Late / Over budget</span>
                <span className="legend-item"><span className="legend-swatch" style={{ background: '#dc2626' }} /> Killed</span>
              </div>
            </>
          ) : <div className="meta">Run a simulation to see the breakdown.</div>}
        </div>

        <div className="chart-card">
          <div className="chart-title">Delay Distribution (late runs)</div>
          {results?.lateBins && results.lateBins.length > 0 && results.lateMax && results.lateMax > 0 ? (
            <Histogram bins={results.lateBins} maxX={results.lateMax} xLabel="Days beyond slack" />
          ) : (
            <div className="meta">No late runs — nothing to show.</div>
          )}
        </div>

        <div className="chart-card">
          <div className="chart-title">Delay CDF (late runs)</div>
          {results?.lateBins && results.lateBins.length > 0 && results.lateMax && results.lateMax > 0 ? (
            <CDF bins={results.lateBins} maxX={results.lateMax} xLabel="Days beyond slack" />
          ) : (
            <div className="meta">No late runs — nothing to show.</div>
          )}
        </div>

        <div className="chart-card">
          <div className="chart-title">Budget Overrun Distribution</div>
          {results?.budgetBins && results.budgetBins.length > 0 && results.budgetMax && results.budgetMax > 0 ? (
            <Histogram bins={results.budgetBins} maxX={results.budgetMax} xLabel="Units beyond budget slack" />
          ) : (
            <div className="meta">No budget overruns — nothing to show.</div>
          )}
        </div>

        <div className="chart-card">
          <div className="chart-title">Budget Overrun CDF</div>
          {results?.budgetBins && results.budgetBins.length > 0 && results.budgetMax && results.budgetMax > 0 ? (
            <CDF bins={results.budgetBins} maxX={results.budgetMax} xLabel="Units beyond budget slack" />
          ) : (
            <div className="meta">No budget overruns — nothing to show.</div>
          )}
        </div>

        <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
          <div className="chart-title">Risk Impact (expected delay contribution)</div>
          {delayImpact.length > 0 ? (
            <HBars items={delayImpact.map(i => ({ name: i.name, value: i.expectedDelay }))} />
          ) : (
            <div className="meta">Add risks to see impact ranking.</div>
          )}
        </div>

        <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
          <div className="chart-title">Risk Impact (expected budget loss)</div>
          {costImpact.length > 0 ? (
            <HBars
              items={costImpact.map(i => ({ name: i.name, value: i.expectedCost }))}
              formatValue={fmtCurrency}
            />
          ) : (
            <div className="meta">Add risks with budget impacts to see ranking.</div>
          )}
        </div>
      </div>
    </div>
  );
}
