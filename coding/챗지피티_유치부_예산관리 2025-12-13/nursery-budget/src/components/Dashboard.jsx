import React from 'react';
import { BUDGET } from '../constants';
import { formatKRW } from '../utils/format';
import Card from './Card';
import ProgressBar from './ProgressBar';

const Dashboard = ({ totalSpent, categorySummary, onNavigate }) => {
  const totalBudget = BUDGET.total;
  const remain = Math.max(totalBudget - totalSpent, 0);

  return (
    <div className="space-y-6">
      {/* Top Cards: Global Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="총 예산">
          <p className="text-3xl font-bold text-gray-900">{formatKRW(totalBudget)}</p>
        </Card>
        <Card title="현재 지출">
          <p className="text-3xl font-bold text-red-600">{formatKRW(totalSpent)}</p>
        </Card>
        <Card title="잔액">
          <p className="text-3xl font-bold text-blue-600">{formatKRW(remain)}</p>
        </Card>
      </div>

      {/* Category Breakdown */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold">세세목별 집행 현황</h2>
            <a
              href="https://docs.google.com/spreadsheets/d/1METL5eBui0qkLiwJHFYsk5dUuhIU_JG_jG5FxO0SyrA/edit?gid=0#gid=0"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors flex items-center gap-1"
            >
              📊 시트열기
            </a>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("")}
            className="text-sm text-blue-600 hover:underline"
          >
            전체 보기 &rarr;
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categorySummary.map((row) => {
            const percent = Math.min(100, Math.round((row.spent / row.budget) * 100)) || 0;
            const isDanger = percent >= 90;
            return (
              <div
                key={row.category}
                onClick={() => onNavigate(row.category)}
                className="border border-gray-100 bg-gray-50 rounded-xl p-4 flex flex-col gap-3 cursor-pointer hover:bg-gray-100 hover:shadow-md transition-all active:scale-[0.98]"
              >
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold text-gray-800">{row.category}</h3>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${isDanger ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                    {percent}%
                  </span>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                  <div className={`h-full rounded-full ${isDanger ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${percent}%` }}></div>
                </div>

                <div className="flex justify-between items-end text-sm">
                  <div className="text-gray-500">
                    <div>지출: <span className="text-gray-900 font-medium">{formatKRW(row.spent)}</span></div>
                    <div className="text-xs mt-0.5">예산: {formatKRW(row.budget)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">잔액</div>
                    <div className="font-bold text-blue-600">{formatKRW(row.remain)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
