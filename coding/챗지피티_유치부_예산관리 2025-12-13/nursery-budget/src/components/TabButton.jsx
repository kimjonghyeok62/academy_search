import React from 'react';

const TabButton = ({ active, onClick, icon: Icon, children }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-5 py-3 rounded-2xl border transition shadow-sm min-h-[44px] ${
      active ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50 border-gray-200"
    }`}
  >
    {Icon && <Icon size={18} />}
    <span className="font-medium">{children}</span>
  </button>
);

export default TabButton;
