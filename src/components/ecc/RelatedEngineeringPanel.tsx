import { useEffect, useState } from 'react';
import {
  Lightbulb, Target, Search, ClipboardList, ClipboardEdit,
  CheckCircle2, FileText, Archive, BookOpen, Scale, BookMarked,
  ChevronRight, Link2, GitBranch, ArrowUpRight, ArrowDownRight,
  type LucideIcon,
} from 'lucide-react';
import {
  type RelatedObject,
  type EngineeringObjectType,
  OBJECT_TYPE_LABELS,
  OBJECT_TYPE_ICONS,
  RELATIONSHIP_LABELS,
  getLifecycleStyle,
  getRelatedObjects,
} from '../../lib/engineeringNavigationService';

const ICON_MAP: Record<string, LucideIcon> = {
  Lightbulb, Target, Search, ClipboardList, ClipboardEdit,
  CheckCircle2, FileText, Archive, BookOpen, Scale, BookMarked,
};

function ObjectIcon({ type, className }: { type: EngineeringObjectType; className?: string }) {
  const iconName = OBJECT_TYPE_ICONS[type];
  const Icon = ICON_MAP[iconName] || FileText;
  return <Icon className={className} />;
}

interface RelatedEngineeringPanelProps {
  objectRef: string;
  onNavigate?: (url: string) => void;
  className?: string;
}

interface SectionProps {
  title: string;
  icon: LucideIcon;
  items: RelatedObject[];
  onNavigate?: (url: string) => void;
  accent: string;
}

function RelatedSection({ title, icon: Icon, items, onNavigate, accent }: SectionProps) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 px-1 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <Icon className={`w-3 h-3 ${accent}`} />
        {title}
        <span className="ml-auto text-slate-300 font-normal normal-case tracking-normal">{items.length}</span>
      </div>
      <div className="space-y-0.5">
        {items.map((item, idx) => {
          const style = getLifecycleStyle(item.lifecycle_state);
          return (
            <a
              key={`${item.object_ref}-${idx}`}
              href={item.canonical_url}
              onClick={(e) => {
                e.preventDefault();
                if (onNavigate) onNavigate(item.canonical_url);
                else window.location.hash = item.canonical_url;
              }}
              className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <ObjectIcon type={item.object_type} className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-slate-700 truncate group-hover:text-slate-900">
                  {item.object_ref}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {item.title.length > 50 ? item.title.slice(0, 50) + '…' : item.title}
                </div>
              </div>
              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium ${style.bg} ${style.text}`}>
                {style.label}
              </span>
              <ChevronRight className="w-3 h-3 text-slate-300 shrink-0 group-hover:text-slate-500" />
            </a>
          );
        })}
      </div>
    </div>
  );
}

export function RelatedEngineeringPanel({ objectRef, onNavigate, className = '' }: RelatedEngineeringPanelProps) {
  const [data, setData] = useState<{ parents: RelatedObject[]; children: RelatedObject[]; related: RelatedObject[] }>({
    parents: [], children: [], related: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getRelatedObjects(objectRef).then(result => {
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [objectRef]);

  const total = data.parents.length + data.children.length + data.related.length;

  return (
    <div className={`rounded-lg border border-slate-200 bg-white overflow-hidden ${className}`}>
      <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Related Engineering</h3>
          {total > 0 && (
            <span className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-200 text-slate-600">
              {total} link{total !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
      <div className="p-2">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-xs text-slate-400 animate-pulse">
            <GitBranch className="w-4 h-4 mr-1.5" />
            Loading relationships…
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-xs text-slate-400">
            <Link2 className="w-5 h-5 mb-1.5 text-slate-300" />
            No relationships recorded
          </div>
        ) : (
          <div className="space-y-3">
            <RelatedSection title="Parents" icon={ArrowUpRight} items={data.parents} onNavigate={onNavigate} accent="text-blue-500" />
            <RelatedSection title="Children" icon={ArrowDownRight} items={data.children} onNavigate={onNavigate} accent="text-emerald-500" />
            <RelatedSection title="Related" icon={Link2} items={data.related} onNavigate={onNavigate} accent="text-slate-500" />
          </div>
        )}
      </div>
    </div>
  );
}
