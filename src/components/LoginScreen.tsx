import React, { useState } from 'react';
import {
  ShieldCheck,
  Building2,
  Sparkles,
  AlertCircle,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { loginWithGoogle } from '../services/firebaseAuthService';

interface LoginScreenProps {
  onLoginSuccess: () => void;
  shopName: string;
}

export function LoginScreen({ onLoginSuccess, shopName }: LoginScreenProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ message: string; code?: string } | null>(null);

  // Handle Google Sign In
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorInfo(null);
    try {
      const res = await loginWithGoogle();
      if (res.accessToken) {
        try {
          localStorage.setItem('drive_access_token', res.accessToken);
          localStorage.setItem('drive_token_expires_at', String(Date.now() + 3550 * 1000));
        } catch (storageErr) {
          console.warn('Notice saving drive_access_token to localStorage:', storageErr);
        }
      }
      if (res.driveMessage && !res.driveConnected) {
        try {
          sessionStorage.setItem('drive_connect_notice', res.driveMessage);
        } catch {}
      }
      onLoginSuccess();
    } catch (err: any) {
      console.error('Google Sign In failed:', err);

      const msg = err?.message || (typeof err === 'string' ? err : '');
      const rawCode = err?.code || err?.errorCode || '';
      const fullText = `${msg} ${rawCode} ${String(err)}`.toLowerCase();

      const isCancelled = fullText.includes('cancel') || rawCode === '12501' || rawCode === '16';

      const codeMatch = `${msg} ${rawCode}`.match(/\b(12500|12501|12502|10|7|8|4|5|6|13|14|15|16|17)\b/);
      const code = codeMatch ? codeMatch[1] : (rawCode && rawCode !== 'AUTH_ERROR' ? String(rawCode) : undefined);

      if (isCancelled) {
        setErrorInfo({
          message: 'Sign-in was cancelled.',
          code,
        });
      } else {
        setErrorInfo({
          message: 'Sign-in failed. Please try again.',
          code,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-page text-ink flex flex-col justify-center items-center p-4 selection:bg-header/20 selection:text-header">
      <div className="w-full max-w-md bg-card border border-line rounded-3xl p-6 sm:p-8 shadow-card relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

        {/* Header Branding */}
        <div className="text-center mb-7">
          <div className="inline-flex p-3.5 bg-primary rounded-2xl shadow-lg shadow-primary/20 mb-3.5 text-white">
            <Building2 className="w-9 h-9" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-ink uppercase">{shopName || 'MAHARAJA MARBLE'}</h1>
          <p className="text-xs text-ink font-semibold mt-1">
            HAIDAR ALI <span className="text-muted font-mono font-normal">(hmotor786@gmail.com)</span>
          </p>
          <p className="text-[11px] text-muted font-medium mt-0.5">
            Enterprise Cloud Management & Real-Time Sync
          </p>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-badge-green-bg border border-line-strong rounded-full text-[11px] font-semibold text-badge-green-text mt-3">
            <ShieldCheck className="w-3.5 h-3.5" />
            Authorized Google Workspace Access
          </div>
        </div>

        {/* Error Notification */}
        {errorInfo && (
          <div className="mb-5 p-3.5 bg-badge-red-bg border border-badge-red-text/35 rounded-xl text-badge-red-text text-xs flex items-center gap-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 text-badge-red-text" />
            <div className="font-medium text-xs leading-normal">
              {errorInfo.message}
              {errorInfo.code && (
                <span className="text-muted font-mono text-[11px] ml-1.5 font-normal">
                  (code {errorInfo.code})
                </span>
              )}
            </div>
          </div>
        )}

        {/* Primary Google Login Section */}
        <div className="space-y-4 my-2">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-5 bg-card hover:bg-inner text-ink border border-line-strong rounded-2xl font-bold text-sm shadow-card transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer group"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span className="text-ink font-semibold text-sm">
              {isLoading ? 'Signing in...' : 'Sign in with Google'}
            </span>
            <ArrowRight className="w-4 h-4 text-muted group-hover:translate-x-0.5 transition-transform" />
          </button>

          <div className="bg-inner border border-line-strong rounded-xl p-3 text-center">
            <p className="text-[11px] text-muted leading-relaxed">
              Fast, one-click access using your authorized Google Account. No passwords required.
            </p>
          </div>
        </div>

        {/* Role Permissions Information Box */}
        <div className="mt-7 pt-5 border-t border-line">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            Multi-User Roles & Permissions
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-inner p-2.5 rounded-xl border border-line-strong">
              <span className="font-bold text-badge-green-text block mb-0.5">Admin Account</span>
              <p className="text-muted text-[10px] leading-tight">
                Full authority: Sales, inventory editing, customer khata, profit metrics, and user management.
              </p>
            </div>
            <div className="bg-inner p-2.5 rounded-xl border border-line-strong">
              <span className="font-bold text-badge-blue-text block mb-0.5">Stock Viewer</span>
              <p className="text-muted text-[10px] leading-tight">
                Stock-only access: View live quantities, marble categories, and search without financial data.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 text-center">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted font-mono">
            <Lock className="w-3 h-3 text-badge-green-text" />
            Protected by Cloud Firestore Security Rules
          </span>
        </div>
      </div>
    </div>
  );
}
