import React from 'react';

const Card = ({ title, children, right }) => {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
      {(title || right) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h3 className="font-semibold">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
};

export default Card;
