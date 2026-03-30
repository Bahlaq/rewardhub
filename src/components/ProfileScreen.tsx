import React from 'react';
import { motion } from 'motion/react';
import {
  User,
  ShieldCheck,
  X,
  Trash2,
  ChevronRight,
  Terminal,
  Zap,
  TrendingUp,
} from 'lucide-react';
import { UserProfile } from '../types';
import { APP_VERSION } from '../constants';

interface ProfileScreenProps {
  /** Live user profile from Firestore — points must come directly from this object */
  user: UserProfile;
  /** Total claims made by the user */
  claimsCount: number;
  onSignOut: () => void;
  onDeleteAccount: () => void;
  onOpenPrivacy: () => void;
  onOpenDebug: () => void;
}

export const ProfileScreen = ({
  user,
  claimsCount,
  onSignOut,
  onDeleteAccount,
  onOpenPrivacy,
  onOpenDebug,
}: ProfileScreenProps) => {
  // CRITICAL: always use Firestore-backed user.points, never a derived value
  const safePoints = Math.max(0, Number(user.points ?? 0));
  const safeTotalEarned = Math.max(0, Number(user.totalEarned ?? 0));

  const boostLevel = Math.max(1, Number(user.boostLevel ?? 1));
  const currentLevelAdCounter = Math.max(0, Number(user.currentLevelAdCounter ?? 0));

  const today = new Date().toDateString();
  const isNewDay = user.lastBoostDate !== today;
  const effectiveCounter = isNewDay ? 0 : currentLevelAdCounter;
  const effectiveLevel = isNewDay ? 1 : boostLevel;

  return (
    <motion.div
      key="profile"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className="space-y-6"
    >
      {/* ── Avatar + Identity ────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-sm text-center">
        <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <User size={40} className="text-indigo-600" />
        </div>

        <h2 className="text-xl font-bold text-zinc-900 truncate px-4">{user.email}</h2>
        <p className="text-[11px] text-zinc-400 font-medium mt-1">
          {user.uid.startsWith('local_guest_') || (user as any).isAnonymous
            ? 'Guest Account'
            : 'Google Account'}{' '}
          • v{APP_VERSION}
        </p>

        {/* ── Stats grid ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 mt-8">
          {/* Points — always from Firestore user.points */}
          <div className="bg-gradient-to-br from-indigo-50 to-violet-50 p-4 rounded-2xl border border-indigo-100">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Zap size={12} className="text-indigo-500 fill-indigo-500" />
              <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">
                Points
              </span>
            </div>
            <span className="text-2xl font-black text-indigo-700">
              {safePoints.toLocaleString()}
            </span>
          </div>

          {/* Claims */}
          <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
            <span className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1">
              Claims
            </span>
            <span className="text-2xl font-black text-zinc-900">{claimsCount}</span>
          </div>
        </div>

        {/* Total earned */}
        <div className="mt-3 bg-emerald-50 p-3 rounded-2xl border border-emerald-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-600" />
            <span className="text-xs font-bold text-emerald-700">Total Earned</span>
          </div>
          <span className="text-sm font-black text-emerald-700">
            {safeTotalEarned.toLocaleString()} pts
          </span>
        </div>

        {/* ── Boost status ─────────────────────────────────────────────── */}
        <div className="mt-3 bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
              Daily Boost Level
            </span>
            <span className="text-sm font-bold text-indigo-600">
              Level {effectiveLevel}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, (effectiveCounter / effectiveLevel) * 100)}%`,
              }}
            />
          </div>

          <p className="text-[10px] text-zinc-400 mt-2">
            {effectiveCounter}/{effectiveLevel} ads watched this round •{' '}
            {effectiveLevel} ads needed for +100 pts
          </p>
          <p className="text-[10px] text-zinc-400">Resets daily. Level increases after each claim.</p>
        </div>

        {/* ── Action list ──────────────────────────────────────────────── */}
        <div className="mt-6 pt-6 border-t border-zinc-100 space-y-3">

          {/* Debug */}
          <ActionRow
            icon={<Terminal size={18} className="text-zinc-600" />}
            label="System Debugger"
            sub="View logs and error details"
            onClick={onOpenDebug}
          />

          {/* Privacy */}
          <ActionRow
            icon={<ShieldCheck size={18} className="text-zinc-600" />}
            label="Privacy Policy"
            sub="How we handle your data"
            onClick={onOpenPrivacy}
          />

          {/* Sign Out */}
          <ActionRow
            icon={<X size={18} className="text-rose-600" />}
            label="Sign Out"
            sub="Log out of your account"
            onClick={onSignOut}
            danger
          />

          {/* Delete */}
          <ActionRow
            icon={<Trash2 size={18} className="text-zinc-400 group-hover:text-rose-600 transition-colors" />}
            label="Delete Account"
            sub="Permanently remove all data"
            onClick={onDeleteAccount}
            deleteDanger
          />
        </div>
      </div>
    </motion.div>
  );
};

// ─── Helper row component ──────────────────────────────────────────────────

interface ActionRowProps {
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
  danger?: boolean;
  deleteDanger?: boolean;
}

const ActionRow = ({ icon, label, sub, onClick, danger, deleteDanger }: ActionRowProps) => (
  <button
    onClick={onClick}
    className={[
      'w-full flex items-center justify-between p-4 rounded-2xl border transition-colors group',
      danger
        ? 'bg-rose-50 border-rose-100 hover:bg-rose-100'
        : deleteDanger
        ? 'bg-zinc-50 border-zinc-100 hover:bg-rose-50 hover:border-rose-100'
        : 'bg-zinc-50 border-zinc-100 hover:bg-zinc-100',
    ].join(' ')}
  >
    <div className="flex items-center gap-3">
      <div
        className={[
          'w-8 h-8 rounded-lg flex items-center justify-center border shadow-sm',
          danger
            ? 'bg-white border-rose-200'
            : deleteDanger
            ? 'bg-white border-zinc-200 group-hover:border-rose-200'
            : 'bg-white border-zinc-200',
        ].join(' ')}
      >
        {icon}
      </div>
      <div className="text-left">
        <h4
          className={[
            'text-sm font-bold',
            danger
              ? 'text-rose-900'
              : deleteDanger
              ? 'text-zinc-500 group-hover:text-rose-900'
              : 'text-zinc-900',
          ].join(' ')}
        >
          {label}
        </h4>
        <p
          className={[
            'text-[10px] font-medium',
            danger
              ? 'text-rose-400'
              : deleteDanger
              ? 'text-zinc-400 group-hover:text-rose-400'
              : 'text-zinc-400',
          ].join(' ')}
        >
          {sub}
        </p>
      </div>
    </div>
    <ChevronRight
      size={18}
      className={[
        'transition-colors',
        danger
          ? 'text-rose-300 group-hover:text-rose-500'
          : deleteDanger
          ? 'text-zinc-300 group-hover:text-rose-500'
          : 'text-zinc-300 group-hover:text-zinc-500',
      ].join(' ')}
    />
  </button>
);
