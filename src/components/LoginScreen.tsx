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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Handle Google Sign In
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage(null);
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
      console.error('Google Sign In caught in LoginScreen:', err);
      console.log('Full Google Sign-In error object:', err);
      try {
        console.log('Full Google Sign-In error properties:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
      } catch {}

      // Collect all properties from the raw error (including non-enumerable properties)
      const propNames = err && typeof err === 'object' ? Object.getOwnPropertyNames(err) : [];
      const rawProps: Record<string, any> = {};
      for (const key of propNames) {
        if (key !== 'stack') {
          rawProps[key] = err[key];
        }
      }
      if (typeof err === 'object' && err !== null) {
        for (const [k, v] of Object.entries(err)) {
          if (k !== 'stack' && !(k in rawProps)) {
            rawProps[k] = v;
          }
        }
      }

      const msg = err?.message || (typeof err === 'string' ? err : 'Unknown error');
      const rawCode = err?.code || err?.errorCode || rawProps.code || rawProps.errorCode || '';

      // Reference table of Google Sign-In / Play Services status codes
      const STATUS_NAMES: Record<string, string> = {
        '0': 'SUCCESS',
        '4': 'SIGN_IN_REQUIRED',
        '5': 'INVALID_ACCOUNT',
        '6': 'RESOLUTION_REQUIRED',
        '7': 'NETWORK_ERROR',
        '8': 'INTERNAL_ERROR',
        '10': 'DEVELOPER_ERROR (Check SHA-1 fingerprint & OAuth client ID in Firebase Console)',
        '13': 'ERROR',
        '14': 'INTERRUPTED',
        '15': 'TIMEOUT',
        '16': 'CANCELED',
        '17': 'API_NOT_CONNECTED',
        '12500': 'SIGN_IN_FAILED (Google Play Services internal failure)',
        '12501': 'SIGN_IN_CANCELLED (User dismissed account picker)',
        '12502': 'SIGN_IN_CURRENTLY_IN_PROGRESS',
      };

      // Check for native Google Sign-In status code numbers (e.g. 10 DEVELOPER_ERROR, 12500 SIGN_IN_FAILED, 12501 SIGN_IN_CANCELLED, 7, 8, etc.)
      const fullSearch = `${msg} ${rawCode} ${JSON.stringify(rawProps)}`;
      const statusMatch = fullSearch.match(/(?:status(?:code)?[:=\s]+|\b(?:code|error|status)[:=\s]+|ApiException:\s*|\b)\b(12500|12501|12502|12503|10|7|8|4|5|6|13|14|15|16|17)\b/i);
      const statusCode = statusMatch ? statusMatch[1] : undefined;

      const code = rawCode || (statusCode ? `STATUS_${statusCode}` : 'AUTH_ERROR');

      // Extra data fields (anything beyond basic message/code)
      const extraFields: Record<string, any> = {};
      for (const [k, v] of Object.entries(rawProps)) {
        if (k !== 'message' && k !== 'code' && v !== undefined && v !== null) {
          extraFields[k] = v;
        }
      }

      let errorText = `Sign-in failed: ${code} - ${msg}`;
      if (statusCode) {
        const desc = STATUS_NAMES[statusCode] || 'Unknown status';
        errorText += `\n\n• Native Status Code: ${statusCode} (${desc})`;
      }
      if (Object.keys(extraFields).length > 0) {
        errorText += `\n\n• Extra Data:\n${JSON.stringify(extraFields, null, 2)}`;
      }
      errorText += `\n\n• Full Raw Error:\n${JSON.stringify(rawProps, null, 2)}`;

      // Do NOT hide behind "cancelled" text - display full raw error directly as requested
      setErrorMessage(errorText);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 selection:bg-emerald-500/30 selection:text-emerald-300">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/80 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header Branding */}
        <div className="text-center mb-7">
          <div className="inline-flex p-3.5 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-2xl shadow-lg shadow-emerald-500/20 mb-3.5 text-white">
            <Building2 className="w-9 h-9" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white uppercase">{shopName || 'MAHARAJA MARBLE'}</h1>
          <p className="text-xs text-slate-300 font-semibold mt-1">
            HAIDAR ALI <span className="text-slate-400 font-mono font-normal">(hmotor786@gmail.com)</span>
          </p>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            Enterprise Cloud Management & Real-Time Sync
          </p>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-950/80 border border-emerald-500/30 rounded-full text-[11px] font-semibold text-emerald-400 mt-3">
            <ShieldCheck className="w-3.5 h-3.5" />
            Authorized Google Workspace Access
          </div>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="mb-5 p-3.5 bg-rose-950/80 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-start gap-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="leading-relaxed break-words font-mono text-[11px] whitespace-pre-wrap">{errorMessage}</div>
          </div>
        )}

        {/* Primary Google Login Section */}
        <div className="space-y-4 my-2">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-5 bg-white hover:bg-slate-100 text-slate-900 rounded-2xl font-bold text-sm shadow-xl shadow-black/40 transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer group"
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
            <span className="text-slate-900 font-semibold text-sm">
              {isLoading ? 'Signing in...' : 'Sign in with Google'}
            </span>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </button>

          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 text-center">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Fast, one-click access using your authorized Google Account. No passwords required.
            </p>
          </div>
        </div>

        {/* Role Permissions Information Box */}
        <div className="mt-7 pt-5 border-t border-slate-800/80">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            Multi-User Roles & Permissions
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
              <span className="font-bold text-emerald-400 block mb-0.5">Admin Account</span>
              <p className="text-slate-400 text-[10px] leading-tight">
                Full authority: Sales, inventory editing, customer khata, profit metrics, and user management.
              </p>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
              <span className="font-bold text-cyan-400 block mb-0.5">Stock Viewer</span>
              <p className="text-slate-400 text-[10px] leading-tight">
                Stock-only access: View live quantities, marble categories, and search without financial data.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 text-center space-y-1">
          <div>
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-mono">
              <Lock className="w-3 h-3 text-emerald-500/80" />
              Protected by Cloud Firestore Security Rules
            </span>
          </div>
          <p className="text-[11px] text-slate-500 font-mono">
            Build #{import.meta.env.VITE_BUILD_NUMBER || 'dev'}
          </p>
        </div>
      </div>
    </div>
  );
}
