import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

type Question = {
  id: string;
  label: string;
  minLabel: string;
  maxLabel: string;
};

const SCORE_RANGE = [1, 2, 3, 4, 5];
const MIN_TOTAL = 14;
const MAX_TOTAL = 70;
const MID_TOTAL = 42;

const changeCharacteristics: Question[] = [
  { id: 'scope', label: 'Scope of change', minLabel: 'Workgroup', maxLabel: 'Enterprise' },
  { id: 'people', label: 'Number of people impacted', minLabel: 'Less than 10', maxLabel: 'Over 1,000' },
  { id: 'entry', label: 'Entry point for change management', minLabel: 'Early, at initiation', maxLabel: 'Late, at implementation' },
  { id: 'variation', label: 'Variation in groups that are impacted', minLabel: 'All groups impacted the same way', maxLabel: 'All groups experience the change differently' },
  { id: 'clarity', label: 'Clarity of future state', minLabel: 'Known and clear', maxLabel: 'Unknown and emergent' },
  { id: 'type', label: 'Type of change', minLabel: 'Single aspect, simple change', maxLabel: 'Many aspects, complex change' },
  { id: 'individualImpact', label: 'Degree of change impact on individual', minLabel: 'No impact', maxLabel: '100% impact' },
  { id: 'amount', label: 'Amount of change overall', minLabel: 'Incremental', maxLabel: 'Radical' },
  { id: 'compensation', label: 'Impact on compensation', minLabel: 'No impact to pay and benefits', maxLabel: 'Large impact to pay and benefits' },
  { id: 'restructuring', label: 'Degree of organizational restructuring', minLabel: 'No restructuring', maxLabel: 'Complete restructuring' },
  { id: 'staffing', label: 'Reduction in staffing levels', minLabel: 'No reduction', maxLabel: 'Significant reduction' },
  { id: 'confidentiality', label: 'Degree of confidentiality required', minLabel: 'Open and transparent', maxLabel: 'Closed and confidential' },
  { id: 'timeframe', label: 'Timeframe for change', minLabel: 'Sufficient time to prepare, equip and support people', maxLabel: 'Insufficient time to prepare, equip and support people' },
  { id: 'stakeholder', label: 'Degree of external stakeholder impact', minLabel: 'Minimal external impact', maxLabel: 'Significant external impact' },
];

const organisationalAttributes: Question[] = [
  { id: 'need', label: 'Perceived need for change among impacted people', minLabel: 'People are dissatisfied with current state', maxLabel: 'People are satisfied with current state' },
  { id: 'past', label: 'Management of past changes', minLabel: 'Well-managed, successful changes', maxLabel: 'Poorly managed, failed changes' },
  { id: 'saturation', label: 'Change saturation', minLabel: 'Very few changes, under capacity', maxLabel: 'Everything is changing, over capacity' },
  { id: 'vision', label: 'Shared vision and strategic direction for the organization', minLabel: 'Widely shared, unified vision', maxLabel: 'Many different directions and shifting priorities' },
  { id: 'resources', label: 'Resources and funding availability to implement change', minLabel: 'Adequate resources and funds', maxLabel: 'Inadequate resources and funds' },
  { id: 'culture', label: "Organization's culture and responsiveness to change", minLabel: 'Open and receptive to change', maxLabel: 'Closed and resistant to change' },
  { id: 'reinforcement', label: 'Organizational reinforcement of change', minLabel: 'People are rewarded for taking risks and embracing change', maxLabel: 'People are rewarded for consistency and predictability' },
  { id: 'leadershipMindset', label: 'Leadership mindset', minLabel: 'Success declared when benefits are realized', maxLabel: 'Success declared at go live' },
  { id: 'leadershipStyle', label: 'Leadership style and power distribution', minLabel: 'Centralized', maxLabel: 'Distributed' },
  { id: 'executive', label: 'Executive/senior manager change competency', minLabel: 'Highly effective at sponsoring change', maxLabel: 'Lack skills and knowledge' },
  { id: 'manager', label: 'People manager change competency', minLabel: 'Highly effective at managing change', maxLabel: 'Lack skills and knowledge' },
  { id: 'employee', label: 'Impacted employee change competency', minLabel: 'Highly effective at thriving in change', maxLabel: 'Lack skills and knowledge' },
  { id: 'cmMaturity', label: 'Change management maturity', minLabel: 'Well-established organizational competency', maxLabel: 'Ad hoc or absent' },
  { id: 'pmMaturity', label: 'Project management maturity', minLabel: 'Well-established organizational competency', maxLabel: 'Ad hoc or absent' },
];

type AnswerState = Record<string, number>;

function createDefaultAnswers(questions: Question[]): AnswerState {
  return questions.reduce((acc, q) => {
    acc[q.id] = 3;
    return acc;
  }, {} as AnswerState);
}

const formatTotal = (value: number) => `${value} / ${MAX_TOTAL}`;

export function ChangeAssessment() {
  const [changeAnswers, setChangeAnswers] = useState<AnswerState>(() => createDefaultAnswers(changeCharacteristics));
  const [orgAnswers, setOrgAnswers] = useState<AnswerState>(() => createDefaultAnswers(organisationalAttributes));
  const [submitted, setSubmitted] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);
  const resultsRef = useRef<HTMLElement | null>(null);

  const changeTotal = useMemo(
    () => changeCharacteristics.reduce((sum, q) => sum + (changeAnswers[q.id] || 0), 0),
    [changeAnswers]
  );
  const orgTotal = useMemo(
    () => organisationalAttributes.reduce((sum, q) => sum + (orgAnswers[q.id] || 0), 0),
    [orgAnswers]
  );

  const handleScore = (section: 'change' | 'org', id: string, value: number) => {
    const setter = section === 'change' ? setChangeAnswers : setOrgAnswers;
    setter(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
    setSubmitCount(count => count + 1);
  };

  useEffect(() => {
    if (submitCount > 0 && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [submitCount]);

  const quadrantLabel = useMemo(() => {
    const highChange = changeTotal > MID_TOTAL;
    const highResistance = orgTotal > MID_TOTAL;
    if (highChange && highResistance) return 'High Risk';
    if (highChange || highResistance) return 'Medium Risk';
    return 'Low Risk';
  }, [changeTotal, orgTotal]);

  const xPosition = useMemo(() => {
    const normalized = (changeTotal - MIN_TOTAL) / (MAX_TOTAL - MIN_TOTAL);
    return Math.max(0, Math.min(1, normalized));
  }, [changeTotal]);

  const yPosition = useMemo(() => {
    const normalized = (orgTotal - MIN_TOTAL) / (MAX_TOTAL - MIN_TOTAL);
    return Math.max(0, Math.min(1, normalized));
  }, [orgTotal]);

  return (
    <div className="container">
      <h1 className="page-title">Change Management Risk Assessment</h1>
      <p className="subtitle">Answer the questionnaire to position your change on the risk matrix.</p>

      <form onSubmit={handleSubmit} className="assessment-form">
        <section className="assessment-section card">
          <div className="assessment-section-header">
            <h2>Change Characteristics</h2>
            <div className="assessment-total">Score: {formatTotal(changeTotal)}</div>
          </div>
          <table className="assessment-table">
            <thead>
              <tr>
                <th>Factor</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {changeCharacteristics.map((question, index) => (
                <tr key={question.id}>
                  <td>
                    <span className="question-index">{index + 1}.</span>
                    <span>{question.label}</span>
                  </td>
                  <td>
                    <div className="score-scale" role="radiogroup" aria-label={question.label}>
                      {SCORE_RANGE.map(score => {
                        const active = changeAnswers[question.id] === score;
                        return (
                          <button
                            key={score}
                            type="button"
                            className={`score-pill${active ? ' active' : ''}`}
                            onClick={() => handleScore('change', question.id, score)}
                            aria-pressed={active}
                          >
                            <span>{score}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="score-labels">
                      <span>{question.minLabel}</span>
                      <span>{question.maxLabel}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="assessment-section card">
          <div className="assessment-section-header">
            <h2>Organizational Attributes</h2>
            <div className="assessment-total">Score: {formatTotal(orgTotal)}</div>
          </div>
          <table className="assessment-table">
            <thead>
              <tr>
                <th>Factor</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {organisationalAttributes.map((question, index) => (
                <tr key={question.id}>
                  <td>
                    <span className="question-index">{index + 1}.</span>
                    <span>{question.label}</span>
                  </td>
                  <td>
                    <div className="score-scale" role="radiogroup" aria-label={question.label}>
                      {SCORE_RANGE.map(score => {
                        const active = orgAnswers[question.id] === score;
                        return (
                          <button
                            key={score}
                            type="button"
                            className={`score-pill${active ? ' active' : ''}`}
                            onClick={() => handleScore('org', question.id, score)}
                            aria-pressed={active}
                          >
                            <span>{score}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="score-labels">
                      <span>{question.minLabel}</span>
                      <span>{question.maxLabel}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="assessment-actions">
          <button type="submit" className="btn btn-dark">Calculate Assessment</button>
        </div>
      </form>

      {submitted && (
        <section className="assessment-results card" ref={resultsRef}>
          <h2>Risk Position</h2>
          <p className="meta">Scores: Change Characteristics {changeTotal}, Organizational Attributes {orgTotal}</p>
          <div className="matrix-wrapper">
            <svg width={320} height={320} role="img" aria-label="Risk matrix">
              <rect x={40} y={20} width={240} height={240} fill="#f8fafc" stroke="#cbd5f5" strokeDasharray="6 4" />
              <line x1={160} y1={20} x2={160} y2={260} stroke="#cbd5f5" strokeDasharray="6 4" />
              <line x1={40} y1={140} x2={280} y2={140} stroke="#cbd5f5" strokeDasharray="6 4" />
              <text x={100} y={110} textAnchor="middle" fontSize={12} fill="#475569">Medium Risk</text>
              <text x={220} y={110} textAnchor="middle" fontSize={12} fill="#475569">High Risk</text>
              <text x={100} y={210} textAnchor="middle" fontSize={12} fill="#475569">Low Risk</text>
              <text x={220} y={210} textAnchor="middle" fontSize={12} fill="#475569">Medium Risk</text>

              {/* Axes labels */}
              <text x={160} y={300} textAnchor="middle" fontSize={12} fill="#1e3a8a">Change Characteristics</text>
              <text textAnchor="middle" fontSize={12} fill="#1e3a8a" transform="translate(14 160) rotate(-90)">Organizational Attributes</text>

              <text x={40} y={276} textAnchor="middle" fontSize={10} fill="#475569">14</text>
              <text x={160} y={276} textAnchor="middle" fontSize={10} fill="#475569">42</text>
              <text x={280} y={276} textAnchor="middle" fontSize={10} fill="#475569">70</text>

              <text x={16} y={260} textAnchor="middle" fontSize={10} fill="#475569">14</text>
              <text x={16} y={140} textAnchor="middle" fontSize={10} fill="#475569">42</text>
              <text x={16} y={40} textAnchor="middle" fontSize={10} fill="#475569">70</text>

              <text x={120} y={312} textAnchor="middle" fontSize={10} fill="#475569">Small, Incremental</text>
              <text x={240} y={312} textAnchor="middle" fontSize={10} fill="#475569">Large, Disruptive</text>

              <text textAnchor="middle" fontSize={10} fill="#475569" transform="translate(32 240) rotate(-90)">Change Ready</text>
              <text textAnchor="middle" fontSize={10} fill="#475569" transform="translate(32 80) rotate(-90)">Change Resistant</text>

              {(() => {
                const chartX = 40 + xPosition * 240;
                const chartY = 260 - yPosition * 240;
                return (
                  <>
                    <circle cx={chartX} cy={chartY} r={8} fill="#312e81" />
                    <text x={chartX + 12} y={chartY - 12} fontSize={11} fill="#312e81">CC: {changeTotal}</text>
                    <text x={chartX + 12} y={chartY} fontSize={11} fill="#312e81">OA: {orgTotal}</text>
                  </>
                );
              })()}
            </svg>
          </div>
          <div className="assessment-callout">
            Your change sits in the <strong>{quadrantLabel}</strong> zone. Use the matrix to align the level of support required.
          </div>
        </section>
      )}
    </div>
  );
}
