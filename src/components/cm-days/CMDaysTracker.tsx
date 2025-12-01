'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CMDaysTrackingSummary, CMDaysMonthData } from '@/types';
import { formatNumber, formatYearMonth } from '@/lib/calculations';
import { Calendar, Clock, CheckCircle, AlertTriangle, Save } from 'lucide-react';

interface CMDaysTrackerProps {
  initialData?: CMDaysTrackingSummary;
}

export function CMDaysTracker({ initialData }: CMDaysTrackerProps) {
  const [tracking, setTracking] = useState<CMDaysTrackingSummary | null>(initialData || null);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!initialData) {
      fetchTracking();
    }
  }, [initialData]);

  const fetchTracking = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/cm-days');
      const data = await res.json();
      
      if (data.success) {
        setTracking(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      console.error('Failed to fetch CM days tracking data:', err);
      setError('Failed to fetch CM days tracking data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditClick = (month: CMDaysMonthData) => {
    setEditingMonth(month.yearMonth);
    setEditValue(month.daysUsed.toString());
  };

  const handleSaveClick = async (yearMonth: string) => {
    const daysUsed = parseFloat(editValue) || 0;
    
    try {
      setIsSaving(true);
      const res = await fetch('/api/cm-days', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yearMonth, daysUsed }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setTracking(data.data.tracking);
        setEditingMonth(null);
        setEditValue('');
      } else {
        setError(data.error);
      }
    } catch (err) {
      console.error('Failed to save CM days usage:', err);
      setError('Failed to save CM days usage');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingMonth(null);
    setEditValue('');
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!tracking || !tracking.portfolioStartDate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            CM Days Tracker
          </CardTitle>
          <CardDescription>
            Track corrective maintenance days used since portfolio start
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No contracted sites with onboard dates found.</p>
            <p className="text-sm mt-2">Add contracted sites with onboard dates to start tracking CM days.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show most recent months first
  const sortedMonthlyData = [...tracking.monthlyData].reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          CM Days Tracker
        </CardTitle>
        <CardDescription>
          Track corrective maintenance days used since portfolio start ({new Date(tracking.portfolioStartDate).toLocaleDateString('en-GB')})
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-sm text-blue-600 font-medium">Total Accumulated</div>
            <div className="text-2xl font-bold text-blue-900">{formatNumber(tracking.totalAccumulated, 1)} days</div>
          </div>
          <div className="bg-orange-50 rounded-lg p-4">
            <div className="text-sm text-orange-600 font-medium">Total Used</div>
            <div className="text-2xl font-bold text-orange-900">{formatNumber(tracking.totalUsed, 1)} days</div>
          </div>
          <div className={`rounded-lg p-4 ${tracking.totalRemaining >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className={`text-sm font-medium ${tracking.totalRemaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              Total Remaining
            </div>
            <div className={`text-2xl font-bold ${tracking.totalRemaining >= 0 ? 'text-green-900' : 'text-red-900'}`}>
              {formatNumber(tracking.totalRemaining, 1)} days
            </div>
          </div>
        </div>

        {/* Monthly Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-2 text-xs font-semibold uppercase text-gray-500">Month</th>
                <th className="text-right py-3 px-2 text-xs font-semibold uppercase text-gray-500">Accumulated</th>
                <th className="text-right py-3 px-2 text-xs font-semibold uppercase text-gray-500">Used</th>
                <th className="text-right py-3 px-2 text-xs font-semibold uppercase text-gray-500">Monthly Balance</th>
                <th className="text-right py-3 px-2 text-xs font-semibold uppercase text-gray-500">Cumulative Remaining</th>
                <th className="text-center py-3 px-2 text-xs font-semibold uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedMonthlyData.map((month) => (
                <tr key={month.yearMonth} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-2 font-medium">{formatYearMonth(month.yearMonth)}</td>
                  <td className="py-3 px-2 text-right text-blue-600">{formatNumber(month.daysAccumulated, 1)}</td>
                  <td className="py-3 px-2 text-right">
                    {editingMonth === month.yearMonth ? (
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-20 text-right h-8"
                        autoFocus
                      />
                    ) : (
                      <span className="text-orange-600">{formatNumber(month.daysUsed, 1)}</span>
                    )}
                  </td>
                  <td className={`py-3 px-2 text-right ${month.daysRemaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatNumber(month.daysRemaining, 1)}
                  </td>
                  <td className={`py-3 px-2 text-right font-medium ${month.cumulativeRemaining >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatNumber(month.cumulativeRemaining, 1)}
                  </td>
                  <td className="py-3 px-2 text-center">
                    {editingMonth === month.yearMonth ? (
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSaveClick(month.yearMonth)}
                          disabled={isSaving}
                          className="h-7 px-2"
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleCancelEdit}
                          disabled={isSaving}
                          className="h-7 px-2"
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditClick(month)}
                        className="h-7 px-2"
                      >
                        Edit
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {tracking.monthlyData.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No monthly data available yet.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
