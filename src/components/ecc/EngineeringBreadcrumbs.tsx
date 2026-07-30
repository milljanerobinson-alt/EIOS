import { useEffect, useState } from 'react';
import {
  ChevronRight, Home, Lightbulb, Target, Search, ClipboardList,
  ClipboardEdit, CheckCircle2, FileText, Archive, BookOpen,
  Scale, BookMarked,
} from 'lucide-react';
import {
  type BreadcrumbItem,
  type EngineeringObjectType,
  OBJECT_TYPE_LABELS,
  OBJECT_TYPE_ICONS,
  getLifecycleStyle,
  getBreadcrumbs,
} from '../../lib/engineeringNavigationService';

const ICON_MAP: Record<string, typeof Home> = {
  Lightbulb, Target, Search, ClipboardList, ClipboardEdit,
  CheckCircle2, FileText, Archive, BookOpen, Scale, BookMarked,
};

function IconForType({ type, className }: { type: EngineeringObjectType; className?: string }) {
  const iconName = OBJECT_TYPE_ICONS[type];
  const Icon = ICON_MAP[iconName] || FileText;
  return <Icon className={className} />;
}

interface EngineeringBreadcrumbsProps {
  objectRef: string;
  onNavigate?: (url: string) => void;
  className?: string;
}

export function EngineeringBreadcrumbs({ objectRef, onNavigate, className = '' }: EngineeringBreadcrumbsProps) {
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getBreadcrumbs(objectRef).then(chain => {
      if (!cancelled) {
        setBreadcrumbs(chain);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [objectRef]);

  function handleClick(url: string, e: React.MouseEvent) {
    e.preventDefault();
    if (onNavigate) {
      onNavigate(url);
    } else {
      window.location.hash = url;
    }
  }

  if (loading) {
    return (
      <div className={`flex items-center gap-1 text-xs text-slate-400 animate-pulse ${className}`}>
        <Home className="w-3.5 h-3.5" />
        <span>Loading lineage…</span>
      </div>
    );
  }

  if (breadcrumbs.length === 0) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-slate-500 ${className}`}>
        <Home className="w-3.5 h-3.5" />
        <span>Engineering</span>
      </div>
    );
  }

  return (
    <nav className={`flex items-center gap-0.5 flex-wrap text-xs ${className}`} aria-label="Engineering lineage">
      <a
        href="#/engineering/mission-control"
        onClick={(e) => handleClick('#/engineering/mission-control', e)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
      >
        <Home className="w-3.5 h-3.5" />
        <span>Engineering</span>
      </a>
      {breadcrumbs.map((crumb, idx) => {
        const isLast = idx === breadcrumbs.length - 1;
        const style = getLifecycleStyle(crumb.lifecycle_state);
        return (
          <div key={`${crumb.object_ref}-${idx}`} className="flex items-center gap-0.5">
            <ChevronRight className="w-3 h-3 text-slate-300" />
            {isLast ? (
              <span className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded font-medium ${style.bg} ${style.text}`}>
                <IconForType type={crumb.object_type} className="w-3.5 h-3.5" />
                <span>{crumb.title.length > 40 ? crumb.title.slice(0, 40) + '…' : crumb.title}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
              </span>
            ) : (
              <a
                href={crumb.canonical_url}
                onClick={(e) => handleClick(crumb.canonical_url, e)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                title={OBJECT_TYPE_LABELS[crumb.object_type]}
              >
                <IconForType type={crumb.object_type} className="w-3.5 h-3.5" />
                <span>{crumb.object_ref}</span>
              </a>
            )}
          </div>
        );
      })}
    </nav>
  );
}
