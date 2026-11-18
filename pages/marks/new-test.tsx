import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function NewTestPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/marks');
  }, [router]);

  return null;
}
