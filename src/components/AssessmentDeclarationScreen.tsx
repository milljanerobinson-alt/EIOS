import { useEffect, useState } from 'react';
import { ShieldCheck, ArrowRight, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { logAuditAnon } from '../lib/audit';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface DeclarationTemplate {
  id: string;
  assessment_type: string;
  version: number;
  title: string;
  purpose_text: string;
  statements: string[];
  active: boolean;
}

interface Props {
  invitationId: string;
  assessmentType: 'lln' | 'digital';
  candidateName: string;
  token?: string;
  onAccepted: () => void;
}

const SESSION_KEY = (invId: string, type: string) => `declaration_accepted_${invId}_${type}`;

const FALLBACK_TEMPLATES: Record<'lln' | 'digital', Omit<DeclarationTemplate, 'id' | 'created_at'>> = {
  lln: {
    assessment_type: 'lln',
    version: 1,
    title: 'Before You Begin: LLN Assessment Declaration',
    purpose_text:
      'This Language, Literacy and Numeracy (LLN) assessment helps your training provider understand your current skill levels in reading, writing, numeracy and oral communication. The results are used to ensure you receive the right level of support throughout your training — they do not affect your enrolment or result in any pass or fail outcome.',
    statements: [
      'I understand this assessment is used to identify my learning support needs, not to determine my eligibility for training.',
      'I understand that my results will be shared with my trainer and relevant staff at this registered training organisation (RTO) for the purpose of providing appropriate support.',
      'I agree to complete this assessment honestly and to the best of my ability.',
      'I understand I can ask for assistance or reasonable adjustments if I have a disability, injury, or learning difficulty.',
      'I confirm that the information I provide in this assessment is my own work.',
    ],
    active: true,
  },
  digital: {
    assessment_type: 'digital',
    version: 1,
    title: 'Before You Begin: Digital Literacy Assessment Declaration',
    purpose_text:
      'This Digital Literacy assessment helps your training provider understand your current skills and confidence with digital tools and technology. The results are used to tailor your training experience and identify any additional support you may need — they do not affect your enrolment or result in any pass or fail outcome.',
    statements: [
      'I understand this assessment is used to identify my digital skill level and any support I may need, not to determine my eligibility for training.',
      'I understand that my results will be shared with my trainer and relevant staff at this registered training organisation (RTO) for the purpose of providing appropriate support.',
      'I agree to complete this assessment honestly and to the best of my ability.',
      'I understand I can ask for assistance or reasonable adjustments if I have a disability, injury, or learning difficulty.',
      'I confirm that the information I provide in this assessment is my own work.',
    ],
    active: true,
  },
};

export function AssessmentDeclarationScreen({
  invitationId,
  assessmentType,
  candidateName,
  token,
  onAccepted,
}: Props) {
  const [template, setTemplate] = useState<DeclarationTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Anon client — no token header needed; declarations table is open to anon
  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  useEffect(() => {
    // If already accepted this session, skip straight through
    const sessionFlag = sessionStorage.getItem(SESSION_KEY(invitationId, assessmentType));
    if (sessionFlag === 'true') {
      onAccepted();
      return;
    }
    loadTemplate();
  }, [invitationId, assessmentType]);

  async function loadTemplate() {
    try {
      const { data, error: dbError } = await anonClient
        .from('declaration_templates')
        .select('*')
        .eq('assessment_type', assessmentType)
        .eq('active', true)
        .maybeSingle();

      if (dbError || !data) {
        // Fall back to hardcoded template
        setTemplate({ id: 'fallback', ...FALLBACK_TEMPLATES[assessmentType] } as DeclarationTemplate);
      } else {
        // statements stored as JSONB — coerce to string[]
        const parsed = Array.isArray(data.statements)
          ? (data.statements as string[])
          : (JSON.parse(data.statements as unknown as string) as string[]);
        setTemplate({ ...data, statements: parsed });
      }
    } catch {
      setTemplate({ id: 'fallback', ...FALLBACK_TEMPLATES[assessmentType] } as DeclarationTemplate);
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept() {
    if (!accepted || !template || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const { error: insertError } = await anonClient.from('assessment_declarations').insert({
        invitation_id: invitationId,
        assessment_type: assessmentType,
        declaration_version: template.version,
        accepted: true,
        accepted_at: new Date().toISOString(),
        ip_address: null,
        user_agent: navigator.userAgent,
      });

      if (insertError) throw insertError;

      if (token) {
        await logAuditAnon(
          {
            event_type: assessmentType === 'lln' ? 'lln.declaration_accepted' : 'digital.declaration_accepted',
            category: 'assessment',
            description: `${assessmentType === 'lln' ? 'LLN' : 'Digital Literacy'} assessment declaration agreed`,
            source: 'student',
            invitation_id: invitationId,
            event_data: { declaration_version: template.version, assessment_type: assessmentType },
          },
          token,
        );
      }

      sessionStorage.setItem(SESSION_KEY(invitationId, assessmentType), 'true');
      onAccepted();
    } catch (err) {
      setError('Unable to record your declaration. Please try again.');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!template) return null;

  const isLLN = assessmentType === 'lln';
  const accentColor = isLLN ? 'blue' : 'teal';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 w-full max-w-2xl overflow-hidden">

        {/* Header */}
        <div className={`px-8 py-7 ${isLLN ? 'bg-blue-600' : 'bg-teal-600'}`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-white/20 rounded-lg p-2">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="text-sm font-medium text-white/80 uppercase tracking-wider">
              {isLLN ? 'LLN Assessment' : 'Digital Literacy Assessment'}
            </span>
          </div>
          <h1 className="text-xl font-bold text-white leading-snug">{template.title}</h1>
          {candidateName && (
            <p className="text-sm text-white/70 mt-1">Participant: {candidateName}</p>
          )}
        </div>

        <div className="px-8 py-7 space-y-6">

          {/* Why section */}
          <div className={`rounded-xl p-5 border ${isLLN ? 'bg-blue-50 border-blue-100' : 'bg-teal-50 border-teal-100'}`}>
            <h2 className={`text-sm font-semibold uppercase tracking-wide mb-2 ${isLLN ? 'text-blue-700' : 'text-teal-700'}`}>
              Why am I completing this assessment?
            </h2>
            <p className="text-sm text-slate-700 leading-relaxed">{template.purpose_text}</p>
          </div>

          {/* Declaration statements */}
          <div>
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
              Declaration
            </h2>
            <div className="space-y-3">
              {template.statements.map((statement, idx) => (
                <div
                  key={idx}
                  className="flex gap-3 items-start bg-slate-50 rounded-xl px-4 py-3.5 border border-slate-100"
                >
                  <span className={`mt-0.5 shrink-0 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center text-white ${isLLN ? 'bg-blue-500' : 'bg-teal-500'}`}>
                    {idx + 1}
                  </span>
                  <p className="text-sm text-slate-700 leading-relaxed">{statement}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer group select-none">
            <div className="relative mt-0.5 shrink-0">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="sr-only"
              />
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-150 ${
                  accepted
                    ? isLLN
                      ? 'bg-blue-600 border-blue-600'
                      : 'bg-teal-600 border-teal-600'
                    : 'border-slate-300 bg-white group-hover:border-slate-400'
                }`}
              >
                {accepted && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                )}
              </div>
            </div>
            <span className="text-sm font-medium text-slate-800 leading-snug">
              I have read and understood all of the above statements and I agree to the declaration.
            </span>
          </label>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Start button */}
          <button
            onClick={handleAccept}
            disabled={!accepted || submitting}
            className={`w-full font-semibold rounded-xl py-4 px-6 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 text-base shadow-sm ${
              accepted && !submitting
                ? isLLN
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200 cursor-pointer'
                  : 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-200 cursor-pointer'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Recording declaration…
              </>
            ) : (
              <>
                Start {isLLN ? 'LLN' : 'Digital Literacy'} Assessment
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>

          <p className="text-xs text-slate-400 text-center">
            Version {template.version} &middot; Your acceptance is recorded for compliance purposes
          </p>
        </div>
      </div>
    </div>
  );
}
