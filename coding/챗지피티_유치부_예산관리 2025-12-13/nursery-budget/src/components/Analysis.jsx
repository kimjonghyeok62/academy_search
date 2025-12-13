import React, { useMemo } from 'react';
import { ComposedChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { formatKRW, parseAmount } from '../utils/format';
import { CATEGORY_ORDER } from '../constants';
import Card from './Card';
import { ExternalLink } from 'lucide-react';

const COLORS = [
  '#ef4444', // red-500
  '#f97316', // orange-500
  '#eab308', // yellow-500
  '#22c55e', // green-500
  '#3b82f6', // blue-500
  '#a855f7', // purple-500
  '#ec4899', // pink-500
];

const Analysis = ({ expenses }) => {
  const chartData = useMemo(() => {
    // 01~12월 초기화
    const data = Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, "0");
      const item = { month: m, total: 0 };
      CATEGORY_ORDER.forEach(cat => item[cat] = 0);
      return item;
    });

    expenses.forEach(e => {
      if (!e.date) return;
      const mStr = e.date.substring(5, 7); // "YYYY-MM-DD" -> "MM"
      const mIdx = parseInt(mStr, 10) - 1;
      if (mIdx >= 0 && mIdx < 12) {
        const amt = parseAmount(e.amount);
        data[mIdx].total += amt;
        if (e.category && CATEGORY_ORDER.includes(e.category)) {
          data[mIdx][e.category] += amt;
        }
      }
    });

    return data;
  }, [expenses]);

  const forecastData = useMemo(() => {
    // Current date (system time)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12

    // Generate [0, 1, 2] offsets
    const targets = [0, 1, 2].map(offset => {
      let y = currentYear;
      let m = currentMonth + offset;
      if (m > 12) {
        y += Math.floor((m - 1) / 12);
        m = ((m - 1) % 12) + 1;
      }
      return { year: y, month: m, key: `${y}-${String(m).padStart(2, '0')}` };
    });

    return targets.map(({ year, month, key }) => {
      const monthlyExpenses = expenses.filter(e => e.date && e.date.startsWith(key));

      // Group by Category
      const grouped = {};
      monthlyExpenses.forEach(e => {
        if (!e.category) return;
        if (!grouped[e.category]) grouped[e.category] = [];
        grouped[e.category].push(e);
      });

      // Sort items by date inside each category
      Object.keys(grouped).forEach(k => {
        grouped[k].sort((a, b) => a.date.localeCompare(b.date));
      });

      return { year, month, items: grouped };
    });
  }, [expenses]);

  return (
    <Card title="예산 집행 분석">
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-100">
        <span className="font-semibold text-blue-700">💡 Insight:</span>
        <span>
          작년 이맘때는 어땠을까요?
        </span>
        <a
          href="https://docs.google.com/spreadsheets/d/19EjZmqsUpcGCqU6h67tWNY9TYrJygisDFSeY9Bs3RVk/edit?gid=0#gid=0"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 underline font-medium ml-1"
        >
          2025년도 예산집행현황 보기 <ExternalLink size={14} />
        </a>
      </div>

      <div className="h-96 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 20, right: 10, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="month" tickFormatter={(v) => `${v}월`} tick={{ fontSize: 12 }} />
            <YAxis
              domain={[0, 400000]}
              tickFormatter={(v) => v >= 10000 ? `${v / 10000}만` : v}
              allowDataOverflow={true}
              tick={{ fontSize: 11 }}
              width={40}
            />
            <Tooltip
              formatter={(v) => formatKRW(v)}
              labelFormatter={(l) => `${l}월 지출`}
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            />
            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />

            {/* Detailed Bars (Stacked) - Semi-transparent */}
            {CATEGORY_ORDER.map((cat, idx) => (
              <Bar
                key={cat}
                dataKey={cat}
                stackId="a"
                fill={COLORS[idx % COLORS.length]}
                fillOpacity={0.6}
                name={cat}
                radius={[0, 0, 0, 0]}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-bold text-gray-800 mb-4">📅 향후 3개월 지출 상세 (예정/집행)</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {forecastData.map(({ year, month, items }) => (
            <div key={`${year}-${month}`} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                <h4 className="font-bold text-lg text-gray-800">{year}년 {month}월</h4>
                <span className="text-xs font-medium px-2 py-1 bg-gray-100 rounded-lg text-gray-500">
                  {Object.values(items).flat().length}건
                </span>
              </div>

              {Object.keys(items).length === 0 || Object.values(items).flat().length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  예정된 지출이 없거나<br />아직 등록되지 않았습니다.
                </div>
              ) : (
                <div className="space-y-4">
                  {CATEGORY_ORDER.filter(cat => items[cat] && items[cat].length > 0).map(cat => (
                    <div key={cat}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[CATEGORY_ORDER.indexOf(cat) % COLORS.length] }}></span>
                        <span className="text-sm font-semibold text-gray-700">{cat}</span>
                      </div>
                      <ul className="space-y-2 pl-4 border-l-2 border-gray-100">
                        {items[cat].map((item) => (
                          <li key={item.id} className="text-sm">
                            <div className="flex justify-between items-start">
                              <span className="text-gray-600 line-clamp-1 flex-1 pr-2" title={item.description}>{item.description}</span>
                              <span className="font-medium whitespace-nowrap">{parseAmount(item.amount).toLocaleString()}</span>
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">{item.date.substring(5)}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};

export default Analysis;
