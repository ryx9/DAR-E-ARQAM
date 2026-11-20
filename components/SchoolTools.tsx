import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useSchoolSession } from '../utils/schoolSession';
import { schoolNavigation } from '../utils/schoolNavigation';

export default function SchoolTools({ exclude = [] }: { exclude?: string[] }) {
  const { access } = useSchoolSession();
  const sections = schoolNavigation(access)
    .map(section => ({
      ...section,
      links: section.links.filter(link => !exclude.includes(link.href)),
    }))
    .filter(section => section.links.length);
  return (
    <div className="space-y-5">
      {sections.map(section => (
        <section key={section.title} aria-label={section.title}>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{section.title}</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {section.links.map(({ href, icon: Icon, label }) => (
              <Link
                key={href}
                href={href}
                className="group flex min-w-0 items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:border-blue-500/50 hover:bg-muted"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span className="flex-1">{label}</span>
                <ChevronRight
                  size={15}
                  className="shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
