import { Suspense } from 'react';
import GoogleBusinessPage from '@/views/GoogleBusinessPage';

export default function Page() {
  return (
    <Suspense>
      <GoogleBusinessPage />
    </Suspense>
  );
}
