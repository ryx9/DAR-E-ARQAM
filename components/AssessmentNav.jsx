import Link from 'next/link';
import { useRouter } from 'next/router';

export default function AssessmentNav() {
  const { pathname } = useRouter();
  return (
    <nav
      aria-label="Assessment workflow"
      className="mb-5 flex flex-wrap gap-2 border-b border-border pb-3"
    >
      {Object.entries({
        '/admin/datesheet-builder': 'Plan exams',
        '/marks': 'Enter marks',
        '/reports': 'Review results',
      }).map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? 'page' : undefined}
          className={`rounded-lg px-3 py-2 text-sm font-semibold ${pathname === href ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
