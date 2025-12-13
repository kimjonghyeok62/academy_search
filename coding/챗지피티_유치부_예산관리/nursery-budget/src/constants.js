export const LOCAL_KEY = "nursery-expenses-2026";
export const CLOUD_META = "nursery-cloud-meta"; // Firebase 설정 저장
export const GS_META = "nursery-gscript-meta"; // Apps Script 설정 저장

export const BUDGET = {
  year: 2026,
  total: 6297000,
  items: [
    { key: "예배비", budget: 570000 },
    { key: "교육비", budget: 2200000 },
    { key: "교사교육비", budget: 356000 },
    { key: "행사비", budget: 1701000 },
    { key: "성경학교 및 수련회", budget: 940000 },
    { key: "운영행정비", budget: 530000 },
  ],
};

export const CATEGORY_ORDER = BUDGET.items.map((i) => i.key);
