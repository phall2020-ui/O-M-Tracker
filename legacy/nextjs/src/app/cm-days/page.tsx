'use client';

import { Header } from '@/components/layout/Header';
import { CMDaysTracker } from '@/components/cm-days/CMDaysTracker';

export default function CMDaysPage() {
  return (
    <div className="flex flex-col h-full">
      <Header 
        title="CM Days Tracker" 
        subtitle="Track corrective maintenance days used since portfolio start"
      />
      
      <div className="flex-1 p-6">
        <div className="max-w-5xl">
          <CMDaysTracker />
        </div>
      </div>
    </div>
  );
}
