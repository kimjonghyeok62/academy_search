import React, { useState, useEffect } from 'react';
import Card from './Card';
import { parseAmount, monthKey } from '../utils/format';
import { rowsToCsv, csvToRows } from '../utils/csv';
import { canRegisterSW } from '../utils/pwa';

const SelfTests = () => {
  const [result, setResult] = useState([]);
  useEffect(() => {
    const cases = [];
    // 1) parseAmount
    cases.push({ name: "parseAmount 숫자", pass: parseAmount(12345) === 12345 });
    cases.push({ name: "parseAmount 문자열", pass: parseAmount("12,300원") === 12300 });
    // 2) monthKey
    cases.push({ name: "monthKey 기본", pass: monthKey("2025-03-15") === "2025-03" });
    // 3) csv roundtrip
    const rows = [
      { date: "2025-01-01", category: "교육비", description: "교재", amount: 10000, purchaser: "김집사", receiptUrl: "", reimbursed: false, reimbursedAt: "" },
      { date: "2025-02-02", category: "행사비", description: "간식", amount: 25000, purchaser: "박권사", receiptUrl: "", reimbursed: true, reimbursedAt: "2025-02-10" },
    ];
    const csv = rowsToCsv(rows);
    const back = csvToRows(csv);
    cases.push({ name: "CSV roundtrip 행수", pass: back.length === rows.length });
    cases.push({ name: "CSV roundtrip 헤더", pass: Object.keys(back[0]).length === Object.keys(rows[0]).length });
    // 4) PWA canRegisterSW guard (blob/보안 체크)
    const guard = canRegisterSW();
    cases.push({ name: "canRegisterSW 타입", pass: typeof guard === "boolean" });

    setResult(cases);
  }, []);

  const allPass = result.every((t) => t.pass);
  return (
    <Card title="자가 테스트 결과">
      <div className="text-sm mb-2">총 {result.length}개 테스트 — {allPass ? "✅ 모두 통과" : "❌ 일부 실패"}</div>
      <ul className="list-disc pl-5 space-y-1 text-sm">
        {result.map((t, i) => (
          <li key={i}>{t.pass ? "✅" : "❌"} {t.name}</li>
        ))}
      </ul>
      {!allPass && <div className="text-xs text-red-600 mt-2">테스트 실패 항목을 알려주세요. 기대 동작을 확인해 맞춰 드리겠습니다.</div>}
    </Card>
  );
}

export default SelfTests;
