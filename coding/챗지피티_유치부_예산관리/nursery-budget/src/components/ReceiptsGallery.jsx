import React from 'react';
import { formatKRW, parseAmount } from '../utils/format';
import Card from './Card';

const ReceiptsGallery = ({ expenses, onDelete }) => {
  const withReceipts = expenses.filter((e) => e.receiptUrl);

  // 지출 건수와 영수증 건수 비교 (디버깅/확인용)
  const totalCount = expenses.length;
  const receiptCount = withReceipts.length;

  return (
    <div className="space-y-6">
      <Card title={
        <div className="flex items-center gap-2">
          <span>{`영수증 갤러리 (${receiptCount}건 / 전체 지출 ${totalCount}건)`}</span>
          <a
            href="https://drive.google.com/drive/folders/1q8JWztUpkulaJQWGBXYhaOQ9sWMNh9b7"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors flex items-center gap-1 font-normal"
          >
            📂 드라이브 열기
          </a>
        </div>
      }>
        <div className="mb-4 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg flex items-center justify-between">
          <span>전체 지출: <strong>{totalCount}</strong>건</span>
          <span>영수증 있음: <strong>{receiptCount}</strong>건</span>
          <span className={totalCount === receiptCount ? "text-green-600 font-bold" : "text-orange-500 font-bold"}>
            {totalCount === receiptCount ? "일치" : `미일치 (${totalCount - receiptCount}건 누락)`}
          </span>
        </div>

        {withReceipts.length === 0 ? (
          <p className="text-sm text-gray-500">등록된 영수증이 없습니다. 상단 입력 폼에서 이미지 업로드 또는 URL을 추가해 주세요.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {withReceipts.map((e) => (
              <div key={e.id} className="border rounded-2xl overflow-hidden bg-white">
                <div className="aspect-video bg-gray-100 overflow-hidden relative group">
                  <img
                    src={e.receiptUrl.includes("drive.google.com") && e.receiptUrl.includes("id=")
                      ? `https://drive.google.com/thumbnail?id=${new URL(e.receiptUrl).searchParams.get("id")}&sz=w800`
                      : e.receiptUrl}
                    alt={e.description || "receipt"}
                    className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    onError={(ev) => { if (!ev.target.src.includes("export=view")) ev.target.src = e.receiptUrl; }}
                  />
                </div>
                <div className="p-3 text-sm">
                  <div className="font-medium">{e.description || "영수증"}</div>
                  <div className="text-gray-600 mt-1">{e.date} · {e.category} · {formatKRW(parseAmount(e.amount))} · {e.purchaser || ""}</div>
                  <div className="mt-2 text-right">
                    <button onClick={() => onDelete(e.id)} className="px-3 py-2 rounded-lg border text-red-600 hover:bg-red-50 min-h-[40px]">삭제</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>


    </div>
  );
}

export default ReceiptsGallery;
