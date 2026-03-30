import React from 'react';
import { motion } from 'motion/react';
import {
  History,
  TrendingUp,
  Gift,
  Copy,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { Clipboard } from '@capacitor/clipboard';
import { Toast } from '@capacitor/toast';
import { Browser } from '@capacitor/browser';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Transaction } from '../types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface HistoryScreenProps {
  transactions: Transaction[];
}

export const HistoryScreen = ({ transactions }: HistoryScreenProps) => {
  // Split for summary stats
  const earnTxns = transactions.filter((t) => t.type === 'earn');
  const claimTxns = transactions.filter((t) => t.type === 'claim');
  const totalEarned = earnTxns.reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalSpent = claimTxns.reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <motion.div
      key="history"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className="space-y-4"
    >
      {/* ── Summary strip ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100 flex items-center gap-2">
          <TrendingUp size={16} className="text-emerald-600 flex-shrink-0" />
          <div>
            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
              Earned
            </p>
            <p className="text-base font-black text-emerald-700">
              +{totalEarned.toLocaleString()} pts
            </p>
          </div>
        </div>
        <div className="bg-indigo-50 p-3 rounded-2xl border border-indigo-100 flex items-center gap-2">
          <Gift size={16} className="text-indigo-600 flex-shrink-0" />
          <div>
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
              Spent
            </p>
            <p className="text-base font-black text-indigo-700">
              -{totalSpent.toLocaleString()} pts
            </p>
          </div>
        </div>
      </div>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-zinc-400 uppercase tracking-widest">
          <History size={16} />
          Activity History
        </div>
        <span className="text-[10px] font-bold text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full">
          {transactions.length} events
        </span>
      </div>

      {/* ── Transaction list ─────────────────────────────────────────────── */}
      {transactions.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 border border-dashed border-zinc-300 text-center">
          <History size={28} className="text-zinc-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-zinc-500 mb-1">No activity yet</p>
          <p className="text-xs text-zinc-400">Watch ads and claim rewards to build your history.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} />
          ))}
        </div>
      )}

      {/* Spacer — prevent overlap with Banner Ad + Navbar */}
      <div className="h-40" />
    </motion.div>
  );
};

// ─── Transaction Row ───────────────────────────────────────────────────────

const TransactionRow = ({ tx }: { tx: Transaction }) => {
  const isEarn = tx.type === 'earn';
  const amount = Math.abs(Number(tx.amount || 0));

  const handleCopyCode = async () => {
    if (tx.code) {
      await Clipboard.write({ string: tx.code });
      await Toast.show({ text: 'Code copied!', duration: 'short' });
    }
  };

  const handleOpenLink = async () => {
    if (tx.code) {
      try {
        await Browser.open({ url: tx.code });
      } catch {
        window.open(tx.code, '_blank');
      }
    }
  };

  const formattedDate = (() => {
    try {
      const d = new Date(tx.timestamp);
      return `${d.toLocaleDateString()} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return '—';
    }
  })();

  return (
    <div className="bg-white p-4 rounded-2xl border border-zinc-200 flex items-center justify-between shadow-sm">
      {/* Left — icon + info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
            isEarn ? 'bg-emerald-50' : 'bg-indigo-50'
          )}
        >
          {isEarn ? (
            <Zap size={18} className="text-emerald-600 fill-emerald-100" />
          ) : (
            <Gift size={18} className="text-indigo-600" />
          )}
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-zinc-900 truncate">{tx.title}</h4>
          <p className="text-[10px] text-zinc-400">{formattedDate}</p>
        </div>
      </div>

      {/* Right — amount + code/link */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2">
        <span
          className={cn(
            'block text-sm font-black',
            isEarn ? 'text-emerald-600' : 'text-rose-600'
          )}
        >
          {isEarn ? '+' : '-'}{amount.toLocaleString()} pts
        </span>

        {tx.code && (
          tx.rewardType === 'link' ? (
            <button
              onClick={handleOpenLink}
              className="flex items-center gap-1 text-[10px] font-bold bg-indigo-600 px-2 py-0.5 rounded text-white hover:bg-indigo-700 transition-colors"
            >
              Open
              <ExternalLink size={9} />
            </button>
          ) : (
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1 text-[10px] font-mono bg-zinc-100 px-2 py-0.5 rounded text-zinc-600 border border-zinc-200 hover:bg-zinc-200 transition-colors max-w-[100px] truncate"
              title={tx.code}
            >
              {tx.code.length > 8 ? tx.code.slice(0, 8) + '…' : tx.code}
              <Copy size={9} className="flex-shrink-0" />
            </button>
          )
        )}
      </div>
    </div>
  );
};
