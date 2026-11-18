import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function NewTestPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/datesheet-builder');
  }, [router]);

  return null;
}
