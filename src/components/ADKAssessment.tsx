import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';

type Score = 1 | 2 | 3 | 4 | 5;

type Question = {
  id: string;
  text: string;
};

type ElementId = 'awareness' | 'desire' | 'knowledge' | 'ability' | 'reinforcement';

type Element = {
  id: ElementId;
  label: 'A' | 'D' | 'K' | 'A' | 'R';
  title: string;
  summary: string;
  focus: string;
  questions: Question[];
};

const SCORE_RANGE: Score[] = [1, 2, 3, 4, 5];

const elements: Element[] = [
  {
    id: 'awareness',
    label: 'A',
    title: 'Awareness',
    summary: 'Do people understand why this change is happening?',
    focus: 'Increase awareness by communicating the business reasons for the change and the risks of not changing.',
    questions: [
      {
        id: 'awareness-1',
        text: 'Awareness of the need for change.',
      },
    ],
  },
  {
    id: 'desire',
    label: 'D',
    title: 'Desire',
    summary: 'Are people willing to engage with the change?',
    focus: 'Build desire through sponsorship, addressing individual motivations, and removing competing priorities.',
    questions: [
      {
        id: 'desire-1',
        text: 'Desire to support and participate in the change.',
      },
    ],
  },
  {
    id: 'knowledge',
    label: 'K',
    title: 'Knowledge',
    summary: 'Do people know how to change?',
    focus: 'Provide training, coaching, and resources so individuals know what to do differently.',
    questions: [
      {
        id: 'knowledge-1',
        text: 'Knowledge about how to change.',
      },
    ],
  },
  {
    id: 'ability',
    label: 'A',
    title: 'Ability',
    summary: 'Can people demonstrate the required skills and behaviors?',
    focus: 'Reinforce coaching, practice, and feedback to close gaps in performance.',
    questions: [
      {
        id: 'ability-1',
        text: 'Ability to implement the required skills and behaviors.',
      },
    ],
  },
  {
    id: 'reinforcement',
    label: 'R',
    title: 'Reinforcement',
    summary: 'Will the change be sustained over time?',
    focus: 'Recognize wins, embed accountability, and remove barriers that threaten adoption.',
    questions: [
      {
        id: 'reinforcement-1',
        text: 'Reinforcement to sustain the change.',
      },
    ],
  },
];

const createDefaultAnswers = () => {
  const answers: Record<string, Score> = {};
  elements.forEach((element) => {
    element.questions.forEach((question) => {
      answers[question.id] = 3;
    });
  });
  return answers;
};

const clampScore = (value: number): Score => {
  if (value <= 1) return 1;
  if (value >= 5) return 5;
  return Math.round(value) as Score;
};

const formatScore = (value: number) => {
  return value.toFixed(1).replace(/\.0$/, '');
};

type BarrierLevel = 'critical' | 'warning' | 'positive';

const levelForScore = (score: Score): BarrierLevel => {
  if (score === 1) return 'critical';
  if (score === 2 || score === 3) return 'warning';
  return 'positive';
};

type ElementScoreDetails = {
  element: Element;
  average: number;
  rounded: Score;
  level: BarrierLevel;
};

type SubmittedSnapshot = {
  scores: ElementScoreDetails[];
  barrier: ElementScoreDetails | null;
};

export function ADKAssessment() {
  const [answers, setAnswers] = useState<Record<string, Score>>(() => createDefaultAnswers());
  const [submittedData, setSubmittedData] = useState<SubmittedSnapshot | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const elementScores = useMemo(() => {
    return elements.map((element) => {
      const values = element.questions.map((question) => answers[question.id] ?? 3);
      const total = values.reduce((sum, value) => sum + value, 0);
      const average = values.length > 0 ? total / values.length : 0;
      const rounded = clampScore(average);
      const level = levelForScore(rounded);
      return { element, average, rounded, level };
    });
  }, [answers]);

  const handleScore = (questionId: string, score: Score) => {
    setAnswers((prev) => ({ ...prev, [questionId]: score }));
    if (submittedData) {
      setIsDirty(true);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (elementScores.length === 0) return;
    const scoresSnapshot = elementScores.map((score) => ({ ...score }));
    let barrierCandidate: ElementScoreDetails | null = null;
    for (let i = 0; i < scoresSnapshot.length; i++) {
      const current = scoresSnapshot[i];
      if (!barrierCandidate || current.average < barrierCandidate.average) {
        barrierCandidate = current;
      }
    }
    const barrier =
      barrierCandidate && barrierCandidate.level !== 'positive'
        ? barrierCandidate
        : null;
    setSubmittedData({ scores: scoresSnapshot, barrier });
    setIsDirty(false);
  };

  const handleReset = () => {
    setAnswers(createDefaultAnswers());
    setSubmittedData(null);
    setIsDirty(false);
  };

  return (
    <div className="container">
      <div className="adkar-header">
        <h1 className="page-title">ADKAR Assessment</h1>
        <p className="subtitle">
          Capture a snapshot of Awareness, Desire, Knowledge, Ability, and Reinforcement to pinpoint where adoption is at risk.
        </p>
        <p className="adkar-scale-note">
          Scale: 1 = None · 2 = Some · 3 = Neutral · 4 = Most · 5 = Complete
        </p>
      </div>

      <div className="adkar-layout">
        <form className="card adkar-form" onSubmit={handleSubmit}>
          <table className="assessment-table adkar-table">
            <thead>
              <tr>
                <th>Element</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {elements.map((element) =>
                element.questions.map((question) => {
                  const storedId = question.id;
                  return (
                    <tr key={storedId}>
                      <td>
                        <div className="adkar-question-header">
                          <span className="adkar-letter-badge" aria-hidden="true">
                            {element.label}
                          </span>
                          <div>
                            <div className="adkar-question-title">{question.text}</div>
                            <div className="adkar-question-subtitle">{element.summary}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div
                          className="score-scale"
                          role="radiogroup"
                          aria-label={`${element.title} score`}
                        >
                          {SCORE_RANGE.map((value) => {
                            const active = answers[storedId] === value;
                            return (
                              <button
                                key={value}
                                type="button"
                                className={`score-pill${active ? ' active' : ''}`}
                                onClick={() => handleScore(storedId, value)}
                                aria-pressed={active}
                              >
                                <span>{value}</span>
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          <div className="assessment-actions">
            <button type="button" className="btn btn-outline" onClick={handleReset}>
              Reset
            </button>
            <button type="submit" className="btn btn-dark">
              Evaluate Barrier Point
            </button>
          </div>
        </form>

        <aside className="adkar-summary">
          <div className="card barrier-card">
            <div className="barrier-card-header">
              <h2>Barrier Point</h2>
            </div>
            <div className="barrier-grid">
              {elements.map((element) => {
                const snapshot = submittedData?.scores.find((entry) => entry.element.id === element.id) ?? null;
                const level = snapshot?.level;
                const isActive = Boolean(submittedData?.barrier && submittedData.barrier.element.id === element.id);
                const classNames = [
                  'barrier-letter',
                  level ? `level-${level}` : '',
                  isActive ? 'active' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                const displayScore = snapshot ? formatScore(snapshot.average) : '—';
                const aria = snapshot
                  ? `${element.title} score ${displayScore} out of 5`
                  : `${element.title} score not submitted yet`;
                return (
                  <div key={element.id} className="barrier-cell">
                    <div
                      className={classNames}
                      aria-label={aria}
                    >
                      {element.label}
                    </div>
                    <div className="barrier-score">{displayScore}</div>
                  </div>
                );
              })}
            </div>
            {!submittedData && (
              <p className="barrier-instructions">
                Submit the assessment to reveal the lowest-scoring ADKAR element.
              </p>
            )}
            {submittedData && submittedData.barrier && (
              <>
                <div className="barrier-detail">
                  <div className="barrier-detail-title">
                    Barrier Point: {submittedData.barrier.element.title}
                  </div>
                  <div className="barrier-detail-score">
                    {formatScore(submittedData.barrier.average)} / 5
                  </div>
                </div>
                <p className="barrier-message">{submittedData.barrier.element.focus}</p>
              </>
            )}
            {submittedData && !submittedData.barrier && (
              <p className="barrier-message barrier-message-success">
                All ADKAR elements are scoring 4 or higher. No barrier point detected.
              </p>
            )}
            {submittedData && isDirty && (
              <p className="barrier-instructions dirty">
                Scores changed. Submit again to refresh the barrier point.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
