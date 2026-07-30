import { useEffect, useState, useCallback } from 'react';
import {
  type POTestGuide,
  type POTestGuideStep,
  type POWorkflow,
  type POWorkflowStep,
  generatePOTestGuide,
  getPOTestGuide,
  updatePOTestGuide,
  getPOWorkflows,
  getWorkflowSteps,
} from '../../lib/verificationFrameworkService';
import { ClipboardList, Loader2, Sparkles, Edit3, CheckCircle2, AlertCircle } from 'lucide-react';

interface Props {
  ewoId: string;
  ewoRef: string;
  ewoTitle: string;
  riskLevel?: string;
  changedComponents?: string[];
  regressionImpact?: string[];
}

export function ECCPOTestGuidePanel({
  ewoId,
  ewoRef,
  ewoTitle,
  riskLevel = 'medium',
  changedComponents = [],
  regressionImpact = [],
}: Props) {
  const [guide, setGuide] = useState<POTestGuide | null>(null);
  const [steps, setSteps] = useState<POTestGuideStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { guide: g, steps: s } = await getPOTestGuide(ewoId);
    setGuide(g);
    setSteps(s);
    if (g) {
      setEditTitle(g.title);
      setEditDescription(g.description ?? '');
    }
    setLoading(false);
  }, [ewoId]);

  useEffect(() => { load(); }, [load]);

  async function handleGenerate() {
    setGenerating(true);
    const workflows = await getPOWorkflows(ewoId);
    const stepsMap: Record<string, POWorkflowStep[]> = {};
    await Promise.all(workflows.map(async wf => {
      stepsMap[wf.id] = await getWorkflowSteps(wf.id);
    }));
    await generatePOTestGuide({
      ewoId,
      ewoRef,
      ewoTitle,
      riskLevel,
      changedComponents,
      workflows,
      workflowSteps: stepsMap,
      regressionImpact,
    });
    await load();
    setGenerating(false);
  }

  async function handleSaveEdit() {
    if (!guide) return;
    await updatePOTestGuide(guide.id, { title: editTitle, description: editDescription });
    setEditing(false);
    await load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div id="section-po-test-guide" className="scroll-mt-32" />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-800">Product Owner Testing Guide</h3>
          {guide?.is_edited && (
            <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
              Edited
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {guide && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800"
            >
              <Edit3 className="w-3 h-3" /> Edit
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg"
          >
            {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {guide ? 'Regenerate' : 'Generate Guide'}
          </button>
        </div>
      </div>

      {!guide ? (
        <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
          <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 mb-1">No Product Owner Testing Guide has been generated yet.</p>
          <p className="text-xs text-slate-400">
            Click "Generate Guide" to automatically create a PO testing guide based on the EWO's
            changed components, risk level, and Primary Product Owner Workflow.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Title & description */}
          {editing ? (
            <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                className="w-full text-sm font-semibold border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                rows={2}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveEdit}
                  className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg"
                >
                  Save
                </button>
                <button
                  onClick={() => { setEditing(false); setEditTitle(guide.title); setEditDescription(guide.description ?? ''); }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold text-slate-800">{guide.title}</p>
              {guide.description && <p className="text-xs text-slate-500 mt-0.5">{guide.description}</p>}
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
                  Risk: {guide.risk_level}
                </span>
                <span className="text-[10px] text-slate-400">
                  Generated: {new Date(guide.generated_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          )}

          {/* Prerequisites */}
          {guide.prerequisites && guide.prerequisites.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Prerequisites</p>
              <ul className="space-y-1">
                {(guide.prerequisites as string[]).map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                    <CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0 mt-0.5" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Test Steps */}
          {steps.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Test Steps</p>
              <ol className="space-y-2">
                {steps.map((s, idx) => (
                  <li key={s.id} className="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-lg">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700">{s.step_label}</p>
                      {s.step_description && <p className="text-xs text-slate-500 mt-0.5">{s.step_description}</p>}
                      {s.expected_result && (
                        <p className="text-[11px] text-emerald-600 mt-1">
                          <strong>Expected:</strong> {s.expected_result}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Expected Results */}
          {guide.expected_results && guide.expected_results.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Expected Results</p>
              <ul className="space-y-1">
                {(guide.expected_results as string[]).map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Regression Checks */}
          {guide.regression_checks && guide.regression_checks.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Regression Checks</p>
              <ul className="space-y-1">
                {(guide.regression_checks as string[]).map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                    <AlertCircle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
