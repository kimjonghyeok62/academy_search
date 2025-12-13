import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatKRW } from '../utils/format';
import Card from './Card';

const ByMonth = ({ monthSeries }) => {
  return (
    <Card title="월별 지출(원)">
      <div className="h-72 overflow-x-auto">
        <div className="min-w-[600px] h-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthSeries} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => formatKRW(Number(v))} labelFormatter={(l) => `${l} 지출`} />
              <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}

export default ByMonth;
