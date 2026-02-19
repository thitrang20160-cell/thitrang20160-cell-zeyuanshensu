import React from 'react';

interface Props {
  level: 'Low' | 'Medium' | 'High';
  score: number;
}

export const RiskBadge: React.FC<Props> = ({ level, score }) => {
  const colors = {
    Low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    Medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    High: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  };

  const labels = {
    Low: '低风险',
    Medium: '中风险',
    High: '高危预警',
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${colors[level]}`}>
      <span className="relative flex h-2 w-2">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${level === 'High' ? 'bg-rose-400' : level === 'Medium' ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
        <span className={`relative inline-flex rounded-full h-2 w-2 ${level === 'High' ? 'bg-rose-500' : level === 'Medium' ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
      </span>
      <span className="text-xs font-bold uppercase tracking-wider">{labels[level]} ({Math.round(score)}%)</span>
    </div>
  );
};