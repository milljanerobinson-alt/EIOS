import { useState, useEffect, useCallback } from 'react';
import { X, Plus, ChevronDown, Search, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import {
  createEngineeringClassificationReview,
  addReviewEvidence,
  type EvidenceType,
  type ReviewPriority,
  type RecordPurpose,
} from '../../lib/reviewService';
import { listOwnershipMetadataByType, type OwnershipMetadata } from '../../lib/ownershipService';

interface ECCCreateReviewModalProps {
  onClose: () => void;
  onCreated: (reviewId: string) => void;
}

const OWNERSHIP_TYPES = [
  { key: 'platform', label: 'Platform' },
  { key: 'project', label: 'Project' },
  { key: 'spc', label: 'Shared Platform Capability' },
  { key: 'external', label: 'External' },
];

const CLASSIFICATION_TYPES = [
  { key: 'feature', label: 'Feature' },
  { key: 'service', label: 'Service' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'workflow', label: 'Workflow' },
  { key: 'documentation', label: 'Documentation' },
  { key: 'architecture', label: 'Architecture' },
  { key: 'integration', label: 'Integration' },
  { key: 'infrastructure', label: 'Infrastructure' },
  { key: 'ai_component', label: 'AI Component' },
  { key: 'data_model', label: 'Data Model' },
  { key: 'standard', label: 'Standard' },
  { key: 'other', label: 'Other' },
];

const SUBJECT_OBJECT_TYPES = [
  'work_order', 'standard', 'feature', 'service', 'dashboard',
  'workflow', 'integration', 'data_model', 'architecture', 'ai_component', 'other',
];

const RECOMMENDATION_OPTIONS = [
  { key: 'assign_platform', label: 'Assign to Platform' },
  { key: 'assign_project', label: 'Assign to Project' },
  { key: 'retain_current_owner', label: 'Retain Current Owner' },
  { key: 'promote_to_spc', label: 'Promote to SPC' },
  { key: 'absorb_into_platform', label: 'Absorb into Platform' },
  { key: 'classify_external', label: 'Classify as External' },
  { key: 'retire', label: 'Retire' },
  { key: 'defer', label: 'Defer' },
  { key: 'reject_recommendation', label: 'Reject Recommendation' },
];

const PRIORITY_OPTIONS: { key: ReviewPriority; label: string }[] = [
  { key: 'low', label: 'Low' },
  { key: 'normal', label: 'Normal' },
  { key: 'high', label: 'High' },
  { key: 'critical', label: 'Critical' },
];

const EVIDENCE_TYPES: { key: EvidenceType; label: string }[] = [
  { key: 'usage', label: 'Usage Evidence' },
  { key: 'duplication', label: 'Duplication Evidence' },
  { key: 'stability', label: 'Stability Evidence' },
  { key: 'coupling', label: 'Coupling Evidence' },
  { key: 'business_case', label: 'Business Case' },
  { key: 'governance', label: 'Governance Evidence' },
  { key: 'manual', label: 'Manual Evidence' },
  { key: 'migration', label: 'Migration Evidence' },
  { key: 'other', label: 'Other' },
];

const RECORD_PURPOSES: { key: RecordPurpose; label: string; description: string }[] = [
  { key: 'production', label: 'Production', description: 'Live governance review with executable migration plans' },
  { key: 'validation', label: 'Validation', description: 'Workflow testing — plans are non-executable against production data' },
  { key: 'test', label: 'Test', description: 'Synthetic test data — safely deletable, never executable' },
];

export function ECCCreateReviewModal({ onClose, onCreated }: ECCCreateReviewModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Review basics
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [recordPurpose, setRecordPurpose] = useState<RecordPurpose>('production');
  const [subjectObjectType, setSubjectObjectType] = useState('work_order');
  const [subjectReference, setSubjectReference] = useState('');
  const [subjectObjectId, setSubjectObjectId] = useState<string | null>(null);
  const [priority, setPriority] = useState<ReviewPriority>('normal');
  const [recommendation, setRecommendation] = useState('assign_platform');
  const [confidenceScore, setConfidenceScore] = useState<number>(70);

  // Governed object selector state
  const [objectSearch, setObjectSearch] = useState('');
  const [searchResults, setSearchResults] = useState<OwnershipMetadata[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedObject, setSelectedObject] = useState<OwnershipMetadata | null>(null);

  // Step 2: ECR specifics
  const [currentOwnership, setCurrentOwnership] = useState('');
  const [proposedOwnership, setProposedOwnership] = useState('platform');
  const [classificationKey, setClassificationKey] = useState('feature');
  const [reusabilityScore, setReusabilityScore] = useState<number>(70);
  const [classificationConfidence, setClassificationConfidence] = useState<number>(70);
  const [promotionEligible, setPromotionEligible] = useState(false);
  const [migrationReview, setMigrationReview] = useState(false);
  const [promotionReview, setPromotionReview] = useState(false);
  const [retirementReview, setRetirementReview] = useState(false);
  const [constitutionalBoundary, setConstitutionalBoundary] = useState(false);

  // Step 3: Initial evidence
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceType, setEvidenceType] = useState<EvidenceType>('manual');
  const [evidenceDescription, setEvidenceDescription] = useState('');

  const isTestRecord = recordPurpose !== 'production';
  const hasResolvedSubject = !!subjectObjectId || isTestRecord;
  const canProceedStep1 = title.trim() && subjectReference.trim() && recommendation && hasResolvedSubject;
  const canProceedStep2 = proposedOwnership && classificationKey;
  const canSubmit = evidenceTitle.trim() && evidenceDescription.trim();

  const searchObjects = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await listOwnershipMetadataByType(subjectObjectType);
      const filtered = results.filter(r =>
        r.object_id.toLowerCase().includes(q.toLowerCase()) ||
        (r.notes || '').toLowerCase().includes(q.toLowerCase())
      );
      setSearchResults(filtered.slice(0, 20));
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [subjectObjectType]);

  useEffect(() => {
    if (objectSearch.trim().length >= 2) {
      const timer = setTimeout(() => searchObjects(objectSearch), 300);
      return () => clearTimeout(timer);
    }
    setSearchResults([]);
  }, [objectSearch, searchObjects]);

  function selectObject(obj: OwnershipMetadata) {
    setSelectedObject(obj);
    setSubjectObjectId(obj.object_id);
    setSubjectReference(obj.object_id);
    setObjectSearch('');
    setSearchResults([]);
  }

  function clearObject() {
    setSelectedObject(null);
    setSubjectObjectId(null);
    setSubjectReference('');
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const review = await createEngineeringClassificationReview({
        title: title.trim(),
        summary: summary.trim(),
        subject_object_type: subjectObjectType,
        subject_object_id: subjectObjectId ?? undefined,
        subject_reference: subjectReference.trim(),
        priority,
        recommendation,
        confidence_score: confidenceScore,
        created_by: 'platform',
        record_purpose: recordPurpose,
        ecr: {
          object_classification_key: classificationKey,
          current_ownership_type_key: currentOwnership || undefined,
          proposed_ownership_type_key: proposedOwnership,
          reusability_score: reusabilityScore,
          promotion_eligible: promotionEligible,
          classification_confidence: classificationConfidence,
          migration_review: migrationReview,
          promotion_review: promotionReview,
          retirement_review: retirementReview,
          constitutional_boundary_case: constitutionalBoundary,
        },
      });

      await addReviewEvidence({
        review_id: review.id,
        evidence_type: evidenceType,
        title: evidenceTitle.trim(),
        description: evidenceDescription.trim(),
        source_type: 'manual',
        added_by: 'platform',
      });

      onCreated(review.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ECR');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Platform Governance · EOCPS-001 §3</p>
            <h2 className="text-sm font-bold text-slate-900 mt-0.5">Create Engineering Classification Review</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-100 shrink-0">
          {([1, 2, 3] as const).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                step === s ? 'bg-slate-900 text-white' :
                step > s ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
              }`}>{s}</div>
              <span className={`text-[11px] font-medium ${step === s ? 'text-slate-700' : 'text-slate-400'}`}>
                {s === 1 ? 'Review Details' : s === 2 ? 'ECR Classification' : 'Initial Evidence'}
              </span>
              {s < 3 && <div className="w-6 h-px bg-slate-200 mx-1" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-5">

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Review Title <span className="text-red-500">*</span></label>
                <input
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                  placeholder="e.g. Engineering Intelligence Layer — Platform Ownership Classification"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Summary</label>
                <textarea
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all resize-none"
                  placeholder="Brief context about why this review is being created"
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                />
              </div>

              {/* Record Purpose */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Record Purpose</label>
                <div className="grid grid-cols-3 gap-2">
                  {RECORD_PURPOSES.map(p => (
                    <button
                      key={p.key}
                      onClick={() => {
                        setRecordPurpose(p.key);
                        if (p.key !== 'production') clearObject();
                      }}
                      className={`text-left p-2.5 rounded-lg border transition-all ${
                        recordPurpose === p.key
                          ? 'border-slate-900 bg-slate-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <p className="text-xs font-semibold text-slate-800">{p.label}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{p.description}</p>
                    </button>
                  ))}
                </div>
                {isTestRecord && (
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    Test/validation records use synthetic subjects and cannot execute production ownership changes.
                  </div>
                )}
              </div>

              {/* Subject Object Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Subject Object Type</label>
                  <div className="relative">
                    <select
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all pr-8"
                      value={subjectObjectType}
                      onChange={e => { setSubjectObjectType(e.target.value); clearObject(); }}
                    >
                      {SUBJECT_OBJECT_TYPES.map(t => (
                        <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Subject Reference <span className="text-red-500">*</span></label>
                  <input
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                    placeholder="e.g. EWO-012, object UUID, etc."
                    value={subjectReference}
                    onChange={e => setSubjectReference(e.target.value)}
                  />
                </div>
              </div>

              {/* Governed Object Selector (production only) */}
              {recordPurpose === 'production' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Subject Engineering Object <span className="text-red-500">*</span>
                  </label>
                  {selectedObject ? (
                    <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-slate-800">
                            {selectedObject.object_id}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {selectedObject.object_type} · {selectedObject.ownership_type ?? 'unclassified'}
                          </p>
                        </div>
                      </div>
                      <button onClick={clearObject} className="text-xs text-slate-400 hover:text-red-500">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                          placeholder="Search existing ownership metadata by ID or notes..."
                          value={objectSearch}
                          onChange={e => setObjectSearch(e.target.value)}
                        />
                        {searching && <Loader2 className="w-3.5 h-3.5 text-slate-300 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />}
                      </div>
                      {searchResults.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-auto">
                          {searchResults.map(obj => (
                            <button
                              key={obj.id}
                              onClick={() => selectObject(obj)}
                              className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                            >
                              <p className="text-xs font-semibold text-slate-800 truncate">{obj.object_id}</p>
                              <p className="text-[10px] text-slate-400">
                                {obj.object_type} · {obj.ownership_type ?? 'unclassified'} · {obj.ownership_status}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                      {objectSearch.trim().length >= 2 && !searching && searchResults.length === 0 && (
                        <div className="mt-1 flex items-start gap-1.5 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                          <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                          No ownership metadata found for this object type. You can still create the ECR, but the migration plan will be blocked until a valid subject object ID is linked.
                        </div>
                      )}
                    </div>
                  )}
                  {!selectedObject && (
                    <p className="text-[10px] text-slate-400 mt-1">
                      Select an existing engineering object from the ownership metadata registry. Without a resolved subject, the migration plan will be blocked.
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Priority</label>
                  <div className="relative">
                    <select
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all pr-8"
                      value={priority}
                      onChange={e => setPriority(e.target.value as ReviewPriority)}
                    >
                      {PRIORITY_OPTIONS.map(o => (
                        <option key={o.key} value={o.key}>{o.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Confidence Score: {confidenceScore}%</label>
                  <input
                    type="range" min={0} max={100} step={5}
                    className="w-full mt-2 accent-slate-900"
                    value={confidenceScore}
                    onChange={e => setConfidenceScore(Number(e.target.value))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Recommendation <span className="text-red-500">*</span></label>
                <div className="relative">
                  <select
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all pr-8"
                    value={recommendation}
                    onChange={e => setRecommendation(e.target.value)}
                  >
                    {RECOMMENDATION_OPTIONS.map(o => (
                      <option key={o.key} value={o.key}>{o.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Current Ownership</label>
                  <div className="relative">
                    <select
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all pr-8"
                      value={currentOwnership}
                      onChange={e => setCurrentOwnership(e.target.value)}
                    >
                      <option value="">Unknown / Unclassified</option>
                      {OWNERSHIP_TYPES.map(o => (
                        <option key={o.key} value={o.key}>{o.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Proposed Ownership <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <select
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all pr-8"
                      value={proposedOwnership}
                      onChange={e => setProposedOwnership(e.target.value)}
                    >
                      {OWNERSHIP_TYPES.map(o => (
                        <option key={o.key} value={o.key}>{o.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Engineering Classification <span className="text-red-500">*</span></label>
                <div className="relative">
                  <select
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all pr-8"
                    value={classificationKey}
                    onChange={e => setClassificationKey(e.target.value)}
                  >
                    {CLASSIFICATION_TYPES.map(c => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Reusability Score: {reusabilityScore}%</label>
                  <input
                    type="range" min={0} max={100} step={5}
                    className="w-full mt-2 accent-slate-900"
                    value={reusabilityScore}
                    onChange={e => setReusabilityScore(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Classification Confidence: {classificationConfidence}%</label>
                  <input
                    type="range" min={0} max={100} step={5}
                    className="w-full mt-2 accent-slate-900"
                    value={classificationConfidence}
                    onChange={e => setClassificationConfidence(Number(e.target.value))}
                  />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">Review Flags</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'promotionEligible', label: 'Promotion Eligible', val: promotionEligible, set: setPromotionEligible },
                    { key: 'migrationReview', label: 'Migration Review', val: migrationReview, set: setMigrationReview },
                    { key: 'promotionReview', label: 'Promotion Review', val: promotionReview, set: setPromotionReview },
                    { key: 'retirementReview', label: 'Retirement Review', val: retirementReview, set: setRetirementReview },
                    { key: 'constitutionalBoundary', label: 'Constitutional Boundary Case', val: constitutionalBoundary, set: setConstitutionalBoundary },
                  ].map(({ key, label, val, set }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50 transition-colors">
                      <input type="checkbox" className="rounded accent-slate-900" checked={val} onChange={e => set(e.target.checked)} />
                      <span className="text-xs text-slate-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  At least one evidence record is required before a review can be opened. This initial evidence
                  will be appended to the review's evidence package. Additional evidence can be added after creation.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Evidence Title <span className="text-red-500">*</span></label>
                <input
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                  placeholder="e.g. Platform-wide usage across 4 work orders"
                  value={evidenceTitle}
                  onChange={e => setEvidenceTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Evidence Type</label>
                <div className="relative">
                  <select
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all pr-8"
                    value={evidenceType}
                    onChange={e => setEvidenceType(e.target.value as EvidenceType)}
                  >
                    {EVIDENCE_TYPES.map(t => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Evidence Description <span className="text-red-500">*</span></label>
                <textarea
                  rows={4}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all resize-none"
                  placeholder="Describe the evidence. What does it demonstrate? Why is it relevant to this classification decision?"
                  value={evidenceDescription}
                  onChange={e => setEvidenceDescription(e.target.value)}
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 shrink-0">
          <div>
            {step > 1 && (
              <button
                onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors">
              Cancel
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => (s + 1) as 2 | 3)}
                disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                {saving ? 'Creating…' : 'Create as Draft'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
