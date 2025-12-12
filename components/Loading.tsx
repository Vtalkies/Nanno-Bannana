import React from 'react';

export const Loading: React.FC<{ message?: string }> = ({ message = "Processing..." }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-4">
      <div className="relative w-16 h-16">
        <div className="absolute top-0 left-0 w-full h-full border-4 border-amber-400/30 rounded-full"></div>
        <div className="absolute top-0 left-0 w-full h-full border-4 border-amber-400 rounded-full animate-spin border-t-transparent"></div>
      </div>
      <p className="text-amber-400 font-mono animate-pulse">{message}</p>
    </div>
  );
};