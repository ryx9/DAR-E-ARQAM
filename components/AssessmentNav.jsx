import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function AssessmentNav() {
  const { pathname } = useRouter();
  const [isTeacher, setIsTeacher] = useState(false);

  useEffect(() => {
    setIsTeacher(localStorage.getItem('UserRole') === 'teacher');
  }, []);

  const links = isTeacher
    ? {
        '/marks': 'Tests & marks',
        '/reports': 'Review results',
      }
    : {
        '/admin/datesheet-builder': 'Plan exams',
        '/marks': 'Enter marks',
        '/reports': 'Review results',
      };

  return (
    <nav
      aria-label="Assessment workflow"
      className="mb-5 flex flex-wrap gap-2 border-b border-border pb-3"
    >
      {Object.entries(links).map(([href, label]) => (
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
