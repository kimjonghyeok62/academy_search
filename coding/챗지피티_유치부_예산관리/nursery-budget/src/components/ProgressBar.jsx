import React from 'react';

const ProgressBar = ({ value, max }) => {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-xl h-3 overflow-hidden">
      <div className="h-3 bg-black" style={{ width: `${pct}%` }} />
    </div>
  );
};

export default ProgressBar;
