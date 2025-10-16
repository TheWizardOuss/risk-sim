import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

type Question = {
  id: string;
  text: string;
};

type Dimension = {
  id: 'leadership' | 'success' | 'project' | 'change';
  title: string;
  description?: string;
  questions: Question[];
};

type AnswerState = Record<string, number>;

const SCORE_RANGE = [1, 2, 3] as const;
const MAX_SCORE = 30;

const dimensions: Dimension[] = [
  {
    id: 'success',
    title: 'Success',
    questions: [
      { id: 'success-1', text: 'Inputs into the change management process are defined (may include a business case, charter, scope, or plan).' },
      { id: 'success-2', text: 'Organizational benefits are fully defined (what the organization gains).' },
      { id: 'success-3', text: 'Project objectives are fully defined (what the project achieves).' },
      { id: 'success-4', text: 'Adoption and usage objectives are fully defined.' },
      { id: 'success-5', text: 'Units of measure for benefits and objectives are established.' },
      { id: 'success-6', text: 'Benefits and objectives are prioritized.' },
      { id: 'success-7', text: 'Benefit and objective ownership is designated.' },
      { id: 'success-8', text: 'People dependency of benefits and objectives is evaluated.' },
      { id: 'success-9', text: 'The definition of success is clear and ready to be communicated.' },
      { id: 'success-10', text: 'The sponsorship coalition is aligned to a common definition of success.' },
    ],
  },
  {
    id: 'leadership',
    title: 'Leadership & Sponsorship',
    questions: [
      { id: 'leadership-1', text: 'The change has a primary sponsor with the necessary authority over the people, processes and systems to authorize and fund the change.' },
      { id: 'leadership-2', text: 'The primary sponsor can clearly explain the nature of the change, the reason for the change and the benefits for the organization.' },
      { id: 'leadership-3', text: 'The organization has a clearly defined vision and strategy.' },
      { id: 'leadership-4', text: 'The change is aligned with the strategy and vision for the organization.' },
      { id: 'leadership-5', text: 'Priorities are set and communicated regarding the change and other competing priorities.' },
      { id: 'leadership-6', text: 'The primary sponsor is resolving issues and making decisions related to the project schedule, scope and resources.' },
      { id: 'leadership-7', text: 'The primary sponsor is actively and visibly participating throughout the lifecycle of the change.' },
      { id: 'leadership-8', text: 'The primary sponsor is encouraging senior leaders to participate in and support the change by building a sponsor coalition.' },
      { id: 'leadership-9', text: 'The primary sponsor is building awareness of the need for the change directly with employees.' },
      { id: 'leadership-10', text: 'The primary sponsor is visibly reinforcing the change by celebrating successes and addressing resistance.' },
    ],
  },
  {
    id: 'project',
    title: 'Project Management',
    questions: [
      { id: 'project-1', text: 'The nature of the change is clearly defined including who is impacted and how.' },
      { id: 'project-2', text: 'The project has specific objectives.' },
      { id: 'project-3', text: 'The project has a clearly defined scope.' },
      { id: 'project-4', text: 'The project has a project manager assigned to manage the project lifecycle.' },
      { id: 'project-5', text: 'Project milestones are identified and a project schedule is complete.' },
      { id: 'project-6', text: 'A work breakdown structure with deliverables is complete.' },
      { id: 'project-7', text: 'Resources for the project are identified and acquired.' },
      { id: 'project-8', text: 'Periodic meetings are scheduled with the project team and key stakeholders to track progress and resolve issues.' },
      { id: 'project-9', text: 'The project manager understands the value of change management in ensuring the change will be adopted and used.' },
      { id: 'project-10', text: 'The Change Management Plan is integrated with the Project Management Plan.' },
    ],
  },
  {
    id: 'change',
    title: 'Change Management',
    questions: [
      { id: 'change-1', text: 'The change is applying a structured change management approach to deliver the benefits to the organization.' },
      { id: 'change-2', text: 'An assessment of the change and its impact on individuals and the organization is complete.' },
      { id: 'change-3', text: 'An assessment of the change risk is complete.' },
      { id: 'change-4', text: 'The change has specific adoption and usage objectives.' },
      { id: 'change-5', text: 'An assessment of the strength of the sponsor coalition is complete.' },
      { id: 'change-6', text: 'A customized and scaled change management strategy with the necessary sponsorship commitment is complete.' },
      { id: 'change-7', text: 'The resources required to execute the change strategy and plans are identified, acquired and prepared.' },
      { id: 'change-8', text: 'Change management plans that will mitigate resistance and achieve adoption and usage are complete and are being implemented.' },
      { id: 'change-9', text: 'The effectiveness of change management is being monitored and adaptive actions are being taken if required to achieve adoption and usage.' },
      { id: 'change-10', text: 'The organization is prepared to own and sustain the change.' },
    ],
  },
];

const createDefaultAnswers = (): AnswerState =>
  dimensions.reduce((acc, dimension) => {
    dimension.questions.forEach((question) => {
      acc[question.id] = 1;
    });
    return acc;
  }, {} as AnswerState);

const formatTotal = (total: number) => `${total} / ${MAX_SCORE}`;

type BucketLevel = 'high' | 'medium' | 'low';

const bucketForScore = (score: number): { level: BucketLevel; message: string } => {
  if (score <= 19) {
    return { level: 'high', message: 'High risk/threat – needs immediate action' };
  }
  if (score <= 24) {
    return { level: 'medium', message: 'Alert/possible risk – needs further investigation' };
  }
  return { level: 'low', message: 'Strength – should be leveraged and maintained' };
};

export function PCTAssessment() {
  const [answers, setAnswers] = useState<AnswerState>(() => createDefaultAnswers());
  const [submitted, setSubmitted] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);
  const resultsRef = useRef<HTMLElement | null>(null);

  const totals = useMemo(() => {
    return dimensions.reduce<Record<Dimension['id'], number>>((acc, dimension) => {
      const total = dimension.questions.reduce((sum, question) => {
        return sum + (answers[question.id] ?? 1);
      }, 0);
      acc[dimension.id] = total;
      return acc;
    }, {} as Record<Dimension['id'], number>);
  }, [answers]);

  const handleScore = (questionId: string, score: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: score }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setSubmitCount(count => count + 1);
  };

  const handleReset = () => {
    setAnswers(createDefaultAnswers());
    setSubmitted(false);
  };

  useEffect(() => {
    if (submitCount > 0 && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [submitCount]);

  const { leadership, success, project, change } = totals;

  return (
    <div className="container">
      <h1 className="page-title">PCT Assessment</h1>
      <p className="subtitle">
        Score the four PCT dimensions to understand how leadership, success, project management, and change management combine
        to support your change effort.
      </p>

      <form className="assessment-form" onSubmit={handleSubmit}>
        {dimensions.map((dimension) => (
          <section key={dimension.id} className="assessment-section card">
            <div className="assessment-section-header">
              <h2>{dimension.title}</h2>
              <div className="assessment-total">Score: {formatTotal(totals[dimension.id])}</div>
            </div>
            <table className="assessment-table">
              <thead>
                <tr>
                  <th>Factor</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {dimension.questions.map((question, index) => (
                  <tr key={question.id}>
                    <td>
                      <span className="question-index">{index + 1}.</span>
                      <span>{question.text}</span>
                    </td>
                    <td>
                      <div className="score-scale" role="radiogroup" aria-label={question.text}>
                        {SCORE_RANGE.map((value) => {
                          const active = answers[question.id] === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              className={`score-pill${active ? ' active' : ''}`}
                              onClick={() => handleScore(question.id, value)}
                              aria-pressed={active}
                            >
                              <span>{value}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="score-labels">
                        <span>Low support (1)</span>
                        <span>High support (3)</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        <div className="assessment-actions">
          <button type="button" className="btn btn-outline" onClick={handleReset}>
            Reset
          </button>
          <button type="submit" className="btn btn-dark">
            View Results
          </button>
        </div>
      </form>

      {submitted && (
        <section className="pct-results card" ref={resultsRef}>
          <div className="pct-results-header">
            <h2>PCT Assessment Results</h2>
          </div>
          <div className="pct-triangle-wrapper">
            <div className="pct-triangle">
              <div className="pct-inner-triangle" />

              <div className="pct-score-node pct-node-top">
                <span className={`pct-score-pill ${bucketForScore(leadership).level}`}>
                  {leadership}
                </span>
                <span className="pct-score-caption">Leadership/Sponsorship</span>
              </div>

              <div className="pct-score-node pct-node-left">
                <span className={`pct-score-pill ${bucketForScore(project).level}`}>
                  {project}
                </span>
                <span className="pct-score-caption">Project Management</span>
              </div>

              <div className="pct-score-node pct-node-right">
                <span className={`pct-score-pill ${bucketForScore(change).level}`}>
                  {change}
                </span>
                <span className="pct-score-caption">Change Management</span>
              </div>

              <div className="pct-score-node pct-node-center">
                <span className={`pct-score-pill ${bucketForScore(success).level}`}>
                  {success}
                </span>
                <span className="pct-score-caption">Success</span>
              </div>
            </div>
          </div>

          <div className="pct-legend">
            <div className="pct-legend-item">
              <span className="pct-legend-swatch high" />
              <span>10-19: High risk/threat – needs immediate action</span>
            </div>
            <div className="pct-legend-item">
              <span className="pct-legend-swatch medium" />
              <span>20-24: Alert/possible risk – needs further investigation</span>
            </div>
            <div className="pct-legend-item">
              <span className="pct-legend-swatch low" />
              <span>25-30: Strength – should be leveraged and maintained</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
