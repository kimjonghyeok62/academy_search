import React, { useState } from 'react';
import { Save } from 'lucide-react';
import { formatKRW, parseAmount } from '../utils/format';
import Card from './Card';

const Reimbursements = ({ expenses, setExpenses, reimbursedSum, pendingSum }) => {
  const [filter, setFilter] = useState("pending"); // pending | paid | all
  const filtered = expenses.filter(e => filter === "all" ? true : filter === "pending" ? !e.reimbursed : !!e.reimbursed);

  function togglePaid(id, value) {
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, reimbursed: value, reimbursedAt: value ? (e.reimbursedAt || new Date().toISOString().slice(0, 10)) : "" } : e));
  }
  function setPaidNow(id) {
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, reimbursed: true, reimbursedAt: new Date().toISOString().slice(0, 10) } : e));
  }
  const total = expenses.reduce((s, e) => s + parseAmount(e.amount), 0);

  return (
    <div className="space-y-6">
      <div className="sticky-cards">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="총 지출"><p className="text-2xl font-bold">{formatKRW(total)}</p></Card>
          <Card title="입금 완료 합계"><p className="text-2xl font-bold">{formatKRW(reimbursedSum)}</p></Card>
          <Card title="미입금 합계"><p className="text-2xl font-bold">{formatKRW(pendingSum)}</p></Card>
        </div>
      </div>

      <Card title="입금 확인 체크리스트" right={
        <div className="flex gap-2">
          <button onClick={() => setFilter("pending")} className={`px-4 py-2 rounded-xl border ${filter === 'pending' ? 'bg-black text-white border-black' : 'bg-white'}`}>미입금</button>
          <button onClick={() => setFilter("paid")} className={`px-4 py-2 rounded-xl border ${filter === 'paid' ? 'bg-black text-white border-black' : 'bg-white'}`}>입금완료</button>
          <button onClick={() => setFilter("all")} className={`px-4 py-2 rounded-xl border ${filter === 'all' ? 'bg-black text-white border-black' : 'bg-white'}`}>전체</button>
        </div>
      }>
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">입금</th>
                <th className="py-2">입금일</th>
                <th className="py-2">날짜</th>
                <th className="py-2">금액</th>
                <th className="py-2">적요</th>
                <th className="py-2">구매자</th>
                <th className="py-2">세세목</th>
                <th className="py-2 text-right">작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="py-2"><input type="checkbox" className="w-5 h-5" checked={!!e.reimbursed} onChange={(ev) => togglePaid(e.id, ev.target.checked)} aria-label="입금 여부" /></td>
                  <td className="py-2"><input type="date" value={e.reimbursedAt || ""} onChange={(ev) => setExpenses(prev => prev.map(x => x.id === e.id ? { ...x, reimbursedAt: ev.target.value, reimbursed: !!ev.target.value } : x))} className="rounded-lg border px-2 py-2 min-h-[40px]" aria-label="입금일" /></td>
                  <td className="py-2">{e.date}</td>
                  <td className="py-2">{formatKRW(parseAmount(e.amount))}</td>
                  <td className="py-2">{e.description}</td>
                  <td className="py-2">{e.purchaser}</td>
                  <td className="py-2">{e.category}</td>
                  <td className="py-2 text-right"><button onClick={() => setPaidNow(e.id)} className="px-3 py-2 rounded-lg border flex items-center gap-1 min-h-[40px]"><Save size={14} /> 오늘 입금 처리</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default Reimbursements;
