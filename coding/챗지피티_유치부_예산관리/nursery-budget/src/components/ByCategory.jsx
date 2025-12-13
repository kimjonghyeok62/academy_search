import React from 'react';
import { formatKRW, parseAmount } from '../utils/format';
import Card from './Card';
import { Pencil, Trash2 } from 'lucide-react';

const ByCategory = ({ categorySummary, expenses, onDelete, onEdit, filterCat, setFilterCat }) => {
  const filtered = filterCat ? expenses.filter((e) => e.category === filterCat) : expenses;

  return (
    <div className="space-y-6">
      <Card title="세세목별 집행 현황">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="py-2 px-3 text-left">세세목</th>
                <th className="py-2 px-3 text-right">예산액</th>
                <th className="py-2 px-3 text-right">집행액</th>
                <th className="py-2 px-3 text-right">잔액</th>
                <th className="py-2 px-3 text-right">집행률</th>
              </tr>
            </thead>
            <tbody>
              {categorySummary.map((row) => (
                <tr key={row.category} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setFilterCat(row.category)}>
                  <td className="py-3 px-3 font-medium">{row.category}</td>
                  <td className="py-3 px-3 text-right text-gray-500">{formatKRW(row.budget)}</td>
                  <td className="py-3 px-3 text-right text-blue-600 font-bold">{formatKRW(row.spent)}</td>
                  <td className="py-3 px-3 text-right">{formatKRW(row.remaining)}</td>
                  <td className="py-3 px-3 text-right text-gray-400">{row.ratio.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title={`${filterCat ? filterCat + ' 지출 상세' : '전체 지출 상세'} (${filtered.length}건)`}
        right={filterCat && <button onClick={() => setFilterCat("")} className="text-sm text-gray-500 underline">전체 보기</button>}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-gray-600">
                <th className="py-2 px-3 text-left w-24">날짜</th>
                {!filterCat && <th className="py-2 px-3 text-left w-20">세세목</th>}
                <th className="py-2 px-3 text-left">적요</th>
                <th className="py-2 px-3 text-right w-24">금액</th>
                <th className="py-2 px-3 text-center w-20">구매자</th>
                <th className="py-2 px-3 text-center w-16">영수증</th>
                <th className="py-2 px-3 text-center w-20">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-gray-400">내역이 없습니다.</td></tr>
              ) : (
                filtered.map((e) => (
                  <tr key={e.id} className="border-b hover:bg-gray-50 group">
                    <td className="py-3 px-3 text-gray-500">{e.date ? e.date.substring(0, 10) : ""}</td>
                    {!filterCat && <td className="py-3 px-3 text-gray-700">{e.category}</td>}
                    <td className="py-3 px-3">{e.description}</td>
                    <td className="py-3 px-3 text-right font-bold text-gray-800">{formatKRW(e.amount)}</td>
                    <td className="py-3 px-3 text-center text-gray-600">{e.purchaser}</td>
                    <td className="py-3 px-3 text-center">
                      {e.receiptUrl && e.receiptUrl.length > 5 ? (
                        <a href={e.receiptUrl} target="_blank" rel="noreferrer" className="text-blue-500 underline text-xs">보기</a>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={(ent) => { ent.stopPropagation(); onEdit(e); }} className="p-1.5 rounded bg-blue-50 text-blue-500 hover:bg-blue-100 transition-colors" title="수정">
                          <Pencil size={14} />
                        </button>
                        <button onClick={(ent) => { ent.stopPropagation(); onDelete(e.id); }} className="p-1.5 rounded bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="삭제">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default ByCategory;