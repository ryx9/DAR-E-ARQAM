'use client';

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Briefcase,
  ChevronRight,
  GraduationCap,
  LayoutDashboard,
  MessageCircle,
  Search,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useSchoolSession } from '../utils/schoolSession';
import { schoolNavigation, type SchoolLink } from '../utils/schoolNavigation';
import { findDirectionalTool } from '../utils/toolNavigation.mjs';

/* ── Section visual identity & taglines ─────────────────────────────────── */
const SECTION_META: Record<
  string,
  { Icon: LucideIcon; hue: number; tagline: string; domain: 'academic' | 'operations' }
> = {
  Academics: {
    Icon: BookOpen,
    hue: 217,
    tagline: 'Classes, assessments & curriculum',
    domain: 'academic',
  },
  Students: {
    Icon: GraduationCap,
    hue: 270,
    tagline: 'Records, admissions & inquiries',
    domain: 'academic',
  },
  'Parent communication': {
    Icon: MessageCircle,
    hue: 330,
    tagline: 'Notices, diary & meetings',
    domain: 'academic',
  },
  Fees: {
    Icon: Wallet,
    hue: 158,
    tagline: 'Billing, payments & financial reports',
    domain: 'operations',
  },
  Administration: {
    Icon: LayoutDashboard,
    hue: 250,
    tagline: 'Operations, orders & management',
    domain: 'operations',
  },
  'Staff tools': {
    Icon: Briefcase,
    hue: 32,
    tagline: 'Orders, complaints & salary',
    domain: 'operations',
  },
};

const FALLBACK_META = {
  Icon: LayoutDashboard as LucideIcon,
  hue: 217,
  tagline: '',
  domain: 'operations' as const,
};

interface SchoolToolsProps {
  exclude?: string[];
  onNavigate?: () => void;
}

export default function SchoolTools({ exclude = [], onNavigate }: SchoolToolsProps) {
  const { access } = useSchoolSession();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const toolsContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const focusFirstTool = () => {
    const firstTool =
      toolsContainerRef.current?.querySelector<HTMLAnchorElement>('[data-school-tool-link]');
    if (firstTool) {
      firstTool.focus();
      return true;
    }
    return false;
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      event.nativeEvent.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    if (event.key === 'ArrowDown' && focusFirstTool()) event.preventDefault();
    if (event.key === 'Enter') {
      const first =
        toolsContainerRef.current?.querySelector<HTMLAnchorElement>('[data-school-tool-link]');
      if (first) {
        event.preventDefault();
        first.click();
      }
    }
    if (event.key === 'Escape' && searchQuery) {
      event.preventDefault();
      event.stopPropagation();
      setSearchQuery('');
    }
  };

  const handleToolKeyDown = (event: React.KeyboardEvent<HTMLAnchorElement>) => {
    const links = Array.from(
      toolsContainerRef.current?.querySelectorAll<HTMLAnchorElement>('[data-school-tool-link]') ??
        []
    );
    const index = links.indexOf(event.currentTarget);

    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const next = findDirectionalTool(
        links.map(link => link.getBoundingClientRect()),
        index,
        event.key
      );
      if (next >= 0) links[next].focus();
      else if (event.key === 'ArrowUp') searchInputRef.current?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      links[event.key === 'Home' ? 0 : links.length - 1]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      searchInputRef.current?.focus();
    }
  };

  // 1. Raw filtered sections based on user role and exclusion list
  const sections = useMemo(() => {
    return schoolNavigation(access)
      .map(s => ({
        ...s,
        links: s.links.filter(l => !exclude.includes(l.href)),
      }))
      .filter(s => s.links.length > 0);
  }, [access, exclude]);

  // Total link count across all sections
  const totalCount = useMemo(() => {
    return sections.reduce((acc, s) => acc + s.links.length, 0);
  }, [sections]);

  // 2. Filter sections based on search query
  const searchedSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sections;

    return sections
      .map(section => {
        const matchesSection = section.title.toLowerCase().includes(q);
        const matchingLinks = section.links.filter(
          link => link.label.toLowerCase().includes(q) || link.href.toLowerCase().includes(q)
        );

        if (matchesSection) return section; // show all links if section title matches
        if (matchingLinks.length > 0) return { ...section, links: matchingLinks };
        return null;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  }, [sections, searchQuery]);

  // 3. Filter sections based on active category tab (if not searching)
  const displaySections = useMemo(() => {
    if (searchQuery.trim()) return searchedSections;
    if (selectedCategory === 'all') return sections;
    return sections.filter(s => s.title === selectedCategory);
  }, [sections, searchedSections, selectedCategory, searchQuery]);

  // 4. Intelligently balance sections into two balanced columns when viewing "all"
  const { colLeft, colRight } = useMemo(() => {
    if (displaySections.length <= 1) {
      return { colLeft: displaySections, colRight: [] };
    }

    // Prefer domain-based grouping:
    // Left: Academics, Students, Parent communication
    // Right: Fees, Administration, Staff tools
    const left: typeof sections = [];
    const right: typeof sections = [];

    displaySections.forEach(section => {
      const meta = SECTION_META[section.title] ?? FALLBACK_META;
      if (meta.domain === 'academic') {
        left.push(section);
      } else {
        right.push(section);
      }
    });

    // If one column is completely empty (e.g. filtered view), balance evenly by count
    if (left.length === 0 || right.length === 0) {
      const all = [...displaySections].sort((a, b) => b.links.length - a.links.length);
      const l: typeof sections = [];
      const r: typeof sections = [];
      let lCount = 0;
      let rCount = 0;

      all.forEach(sec => {
        if (lCount <= rCount) {
          l.push(sec);
          lCount += sec.links.length;
        } else {
          r.push(sec);
          rCount += sec.links.length;
        }
      });
      return { colLeft: l, colRight: r };
    }

    return { colLeft: left, colRight: right };
  }, [displaySections]);

  return (
    <div ref={toolsContainerRef} className="space-y-6">
      {/* ── TOP CONTROLS: SEARCH & CATEGORY PILLS ── */}
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('all');
              setSearchQuery('');
            }}
            className={`jelly-soft flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
              selectedCategory === 'all' && !searchQuery
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 dark:bg-blue-600 dark:text-white'
                : 'panel-glass text-muted-foreground hover:bg-white/80 hover:text-foreground dark:hover:bg-white/10'
            }`}
          >
            <span>All Tools</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                selectedCategory === 'all' && !searchQuery
                  ? 'bg-white/25 text-white'
                  : 'bg-black/5 dark:bg-white/10'
              }`}
            >
              {totalCount}
            </span>
          </button>

          {sections.map(section => {
            const isSelected = selectedCategory === section.title && !searchQuery;
            const meta = SECTION_META[section.title] ?? FALLBACK_META;
            const Icon = meta.Icon;
            return (
              <button
                key={section.title}
                type="button"
                onClick={() => {
                  setSelectedCategory(section.title);
                  setSearchQuery('');
                }}
                className={`jelly-soft flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 dark:bg-blue-600 dark:text-white'
                    : 'panel-glass text-muted-foreground hover:bg-white/80 hover:text-foreground dark:hover:bg-white/10'
                }`}
              >
                <Icon size={13} className="shrink-0" />
                <span>{section.title}</span>
              </button>
            );
          })}
        </div>

        {/* Quick Search Input */}
        <div className="relative min-w-[220px] max-w-xs shrink-0">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id="school-tools-search"
            ref={searchInputRef}
            type="text"
            aria-label="Search school tools"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search tools..."
            className="panel-glass h-9 w-full rounded-full pl-8.5 pr-8 text-xs font-medium text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <p className="-mt-3 text-xs text-muted-foreground">
        Use arrow keys to move between tools, Enter to open, and Escape to return to search.
      </p>

      {/* ── SEARCH RESULTS NOTICE (WHEN SEARCHING) ── */}
      {searchQuery.trim() && (
        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
          <span>
            Found{' '}
            <strong className="text-foreground">
              {displaySections.reduce((acc, s) => acc + s.links.length, 0)}
            </strong>{' '}
            tools matching &ldquo;{searchQuery}&rdquo;
          </span>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            Clear search
          </button>
        </div>
      )}

      {/* ── EMPTY STATE ── */}
      {displaySections.length === 0 && (
        <div className="panel-glass flex flex-col items-center justify-center rounded-2xl p-10 text-center">
          <Search size={32} className="mb-2 text-muted-foreground/40" />
          <h4 className="text-sm font-bold text-foreground">No matching tools found</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Try adjusting your search query or select another category.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
            }}
            className="mt-4 rounded-full bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700"
          >
            View all tools
          </button>
        </div>
      )}

      {/* ── TOOL PANELS LAYOUT ── */}
      {displaySections.length > 0 && (
        <>
          {/* If single section (from category filter or single match) */}
          {displaySections.length === 1 ? (
            <div className="max-w-4xl">
              <SectionPanel
                section={displaySections[0]}
                onNavigate={onNavigate}
                onToolKeyDown={handleToolKeyDown}
              />
            </div>
          ) : (
            /* Balanced 2-Column Layout (Independent Stacks = Zero Row-Waiting!) */
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2 lg:gap-6">
              {/* Left Column Stack */}
              <div className="flex flex-col gap-5">
                {colLeft.map(section => (
                  <SectionPanel
                    key={section.title}
                    section={section}
                    onNavigate={onNavigate}
                    onToolKeyDown={handleToolKeyDown}
                  />
                ))}
              </div>

              {/* Right Column Stack */}
              <div className="flex flex-col gap-5">
                {colRight.map(section => (
                  <SectionPanel
                    key={section.title}
                    section={section}
                    onNavigate={onNavigate}
                    onToolKeyDown={handleToolKeyDown}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── SUB-COMPONENT: Frosted Jelly-Glass Section Panel ─────────────────────── */
function SectionPanel({
  section,
  onNavigate,
  onToolKeyDown,
}: {
  section: { title: string; links: SchoolLink[] };
  onNavigate?: () => void;
  onToolKeyDown?: (event: React.KeyboardEvent<HTMLAnchorElement>) => void;
}) {
  const meta = SECTION_META[section.title] ?? FALLBACK_META;
  const SIcon = meta.Icon;
  const sh = meta.hue;

  return (
    <section
      aria-label={section.title}
      style={{ '--sh': sh } as React.CSSProperties}
      className="panel-glass rounded-2xl p-4 sm:p-5"
    >
      {/* ── Header ── */}
      <div className="relative z-10 mb-3.5 flex items-center justify-between border-b border-black/[0.06] pb-3.5 dark:border-white/[0.08]">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--sh)_80%_94%)] text-[hsl(var(--sh)_50%_38%)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.85)] ring-1 ring-[hsl(var(--sh)_60%_50%/0.2)] dark:bg-[hsl(var(--sh)_55%_50%/0.18)] dark:text-[hsl(var(--sh)_80%_72%)] dark:shadow-none dark:ring-white/10">
            <SIcon size={20} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-bold leading-tight text-foreground">
                {section.title}
              </h3>
              <span className="inline-flex items-center rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-bold text-muted-foreground dark:bg-white/[0.08]">
                {section.links.length}
              </span>
            </div>
            {meta.tagline && (
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground line-clamp-1">
                {meta.tagline}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Tool Link Tiles (2 Columns per Panel) ── */}
      <div className="relative z-10 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {section.links.map(({ href, icon: Icon, label, hue }) => (
          <Link
            key={href}
            href={href}
            data-school-tool-link
            onClick={onNavigate}
            onKeyDown={onToolKeyDown}
            style={{ '--h': hue } as React.CSSProperties}
            className="jelly-soft group flex items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 transition-all hover:bg-[hsl(var(--h)_85%_95%/0.7)] focus:bg-[hsl(var(--h)_85%_95%/0.7)] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--h)_60%_50%/0.4)] dark:hover:bg-[hsl(var(--h)_60%_50%/0.14)] dark:focus:bg-[hsl(var(--h)_60%_50%/0.14)]"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--h)_82%_95%)] text-[hsl(var(--h)_50%_40%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-transform duration-200 group-hover:scale-105 group-hover:bg-[hsl(var(--h)_75%_90%)] dark:bg-[hsl(var(--h)_55%_50%/0.12)] dark:text-[hsl(var(--h)_80%_72%)] dark:shadow-none dark:group-hover:bg-[hsl(var(--h)_55%_50%/0.22)]">
                <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="truncate text-[13px] font-semibold text-foreground group-hover:text-[hsl(var(--h)_60%_30%)] dark:group-hover:text-[hsl(var(--h)_85%_80%)]">
                {label}
              </span>
            </div>
            <ChevronRight
              size={13}
              className="shrink-0 text-muted-foreground/30 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground/70"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
