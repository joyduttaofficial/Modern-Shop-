import React, { useState, useEffect } from "react";
import { 
  auth, 
  db, 
  OperationType, 
  handleFirestoreError,
  onSnapshot,
  doc,
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile 
} from "@/src/lib/supabase";
import { 
  Mail, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  LayoutDashboard, 
  ShieldAlert, 
  CheckCircle2, 
  ArrowRight,
  TrendingUp,
  LineChart,
  Users2,
  CalendarCheck
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Branding states
  const [companyName, setCompanyName] = useState("Modern Shop");
  const [companyTagline, setCompanyTagline] = useState("Automated POS");
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");
  const [companyPoweredBy, setCompanyPoweredBy] = useState("Powered by ModernManager");
  const [showPoweredBy, setShowPoweredBy] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "company"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCompanyName(data.companyName || "Modern Shop");
        setCompanyTagline(data.companyTagline || "Automated POS");
        setCompanyLogoUrl(data.companyLogoUrl || "");
        setCompanyPoweredBy(data.companyPoweredBy || "Powered by ModernManager");
        setShowPoweredBy(data.showPoweredBy ?? true);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "settings/company");
    });
    return () => unsub();
  }, []);

  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setLoading(true);

    const rawInput = email.trim().toLowerCase();
    const cleanEmail = rawInput.includes("@") ? rawInput : `${rawInput}@modernmanager.com`;
    const cleanPassword = password.trim();

    if (!rawInput || !cleanPassword) {
      setErrorMessage("Please fill in all required credentials.");
      setLoading(false);
      return;
    }

    try {
      // Handle Sign In
      if (cleanEmail === "modern@admin.com" && cleanPassword === "Joy@398878j") {
        try {
          await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        } catch (signInErr: any) {
          const errCode = signInErr?.code || signInErr?.message || "";
          if (
            errCode.includes("user-not-found") || 
            errCode.includes("invalid-credential") || 
            errCode.includes("invalid-login-credentials")
          ) {
            // Create the user automatically on their first sign-in attempt with correct password
            try {
              const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
              if (userCredential.user) {
                await updateProfile(userCredential.user, {
                  displayName: "Main Administrator",
                  photoURL: `https://api.dicebear.com/7.x/adventurer/svg?seed=Main%2520Administrator`
                });
              }
            } catch (createErr) {
              throw signInErr; // fall back to original login error if creation fails
            }
          } else {
            throw signInErr;
          }
        }
      } else {
        try {
          await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        } catch (signInErr: any) {
          // If we appended @modernmanager.com and didn't have an @, fall back to @modernmanager.local
          if (!rawInput.includes("@")) {
            const fallbackEmail = `${rawInput}@modernmanager.local`;
            try {
              await signInWithEmailAndPassword(auth, fallbackEmail, cleanPassword);
            } catch (fallbackErr) {
              throw signInErr; // throw original login error if fallback also fails
            }
          } else {
            throw signInErr;
          }
        }
      }
      setSuccessMessage("Success! Access granted.");
    } catch (err: any) {
      const errMsgStr = (err?.code || err?.message || "").toLowerCase();
      const isExpectedAuthError = 
        errMsgStr.includes("user-not-found") || 
        errMsgStr.includes("wrong-password") || 
        errMsgStr.includes("invalid-credential") ||
        errMsgStr.includes("invalid-email") ||
        errMsgStr.includes("weak-password") ||
        errMsgStr.includes("email-already-in-use");

      if (!isExpectedAuthError) {
        console.error("Auth error:", err);
      } else {
        console.warn("Auth event expectation info:", errMsgStr);
      }

      let localizedError = "Authentication failed. Please verify your credentials.";
      
      if (
        errMsgStr.includes("user-not-found") || 
        errMsgStr.includes("wrong-password") || 
        errMsgStr.includes("invalid-credential")
      ) {
        localizedError = "Invalid email address or incorrect password.";
      } else if (errMsgStr.includes("email-already-in-use")) {
        localizedError = "This email is already registered. Try signing in instead.";
      } else if (err?.code === "auth/invalid-email") {
        localizedError = "Please enter a valid email address.";
      } else if (err?.code === "auth/weak-password") {
        localizedError = "Password should be at least 6 characters.";
      } else if (err?.message) {
        localizedError = err.message;
      }
      
      setErrorMessage(localizedError);
    } finally {
      // Keep loading spinner briefly to let success transitions play
      setTimeout(() => {
        setLoading(false);
      }, 350);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row font-sans text-slate-800 antialiased overflow-hidden">
      
      {/* LEFT COLUMN: GORGEOUS FORM SECTION */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 md:px-16 lg:px-24 bg-white relative">
        
        {/* Decorative background ambient light */}
        <div className="absolute top-0 left-0 w-80 h-80 bg-slate-100 rounded-full blur-3xl -z-10 opacity-60" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-indigo-50/40 rounded-full blur-3xl -z-10 opacity-60" />

        <div className="mx-auto w-full max-w-md">
          
          {/* Brand/Logo Header */}
          <div className="flex items-center gap-3 mb-10">
            {companyLogoUrl ? (
              <img 
                src={companyLogoUrl} 
                alt="Logo" 
                className="w-12 h-12 rounded-2xl object-contain border border-slate-100 shadow-md bg-white shrink-0" 
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(companyName)}`;
                }}
              />
            ) : (
              <div className="w-12 h-12 bg-slate-950 rounded-2xl flex items-center justify-center shadow-lg shadow-slate-950/20">
                <LayoutDashboard className="w-6 h-6 text-white" />
              </div>
            )}
            <div>
              <span className="text-xl font-black tracking-tight text-slate-900 block leading-none">{companyName}</span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 block">{companyTagline}</span>
            </div>
          </div>

          {/* Form Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Welcome Back
            </h2>
            <p className="text-slate-500 font-medium text-sm mt-1">
              Sign in with your email or username to access your workspace and ledger registers.
            </p>
          </div>

          {/* Errors and Success messages */}
          <AnimatePresence mode="wait">
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-4 bg-rose-50 text-rose-800 border border-rose-150 rounded-2xl font-semibold text-xs flex items-start gap-2.5 mb-6"
              >
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </motion.div>
            )}

            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-4 bg-teal-50 text-teal-800 border border-teal-150 rounded-2xl font-semibold text-xs flex items-start gap-2.5 mb-6"
              >
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Login/Signup Form */}
          <form onSubmit={handleAuthAction} className="space-y-5">
            
            {/* User ID or Email */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 font-medium">User ID (Username) or Email *</label>
              <div className="relative">
                <span className="absolute left-4 top-3.5 text-slate-400">
                  <Mail className="w-4.5 h-4.5" />
                </span>
                <input
                  type="text"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. johndoe or user@company.com"
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 focus:border-slate-800 focus:bg-white rounded-xl font-medium outline-none transition-all text-sm"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider font-medium">Password *</label>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage("To reset your account password, contact your shop workspace Administrator.");
                  }}
                  className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-4 top-3.5 text-slate-400">
                  <Lock className="w-4.5 h-4.5" />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-11 py-3.5 bg-slate-50 border border-slate-200 focus:border-slate-800 focus:bg-white rounded-xl font-medium outline-none transition-all text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-4 text-slate-400 hover:text-slate-650 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Action Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 mt-2 bg-slate-950 text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-slate-850 focus:outline-none disabled:bg-slate-350 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-slate-950/10 cursor-pointer group"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4.5 w-4.5 border-b-2 border-white" />
                  Processing Security Vault...
                </>
              ) : (
                <>
                  <span>Authenticate Workspace</span>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Assist */}
          <div className="mt-10 pt-6 border-t border-slate-100 text-center">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-2">Workspace Guidelines</span>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed max-w-xs mx-auto">
              Only authorized personnel can access the system. Contact your workspace Administrator if you do not have credential parameters assigned yet.
            </p>
          </div>

        </div>
      </div>

      {/* RIGHT COLUMN: MAJESTIC ACCENT PANEL */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 relative overflow-hidden flex-col justify-between p-16">
        
        {/* Ambient Grid overlay and glowing graphic lights */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-slate-500/10 rounded-full blur-3xl" />

        {/* Small branding badge */}
        <div>
          <span className="px-3.5 py-1.5 bg-white/10 text-white backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10">
            ENTERPRISE SYSTEM v1.3.4
          </span>
        </div>

        {/* Dynamic Highlight Content */}
        <div className="max-w-md relative">
          <h3 className="text-4xl font-black text-white tracking-tight leading-tight mb-4">
            Manage your shop accounts & stock streams in one gorgeous system.
          </h3>
          <p className="text-slate-400 text-sm leading-relaxed font-medium mb-10">
            Automate transactions registers, sales/returns ledger book, precise physical stock books, payroll disbursement, staff rosters, and dynamic menu-level security permissions.
          </p>

          {/* Grid highlights */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-white/5 border border-white/5 rounded-2xl backdrop-blur-sm">
              <TrendingUp className="w-5 h-5 text-indigo-400 mb-2" />
              <h4 className="text-white text-xs font-bold uppercase tracking-wider leading-tight mb-1">Double Entry Ledger</h4>
              <p className="text-[11px] text-slate-500 font-medium leading-normal">Track incomes and expenses synchronously with beautiful interactive graphs.</p>
            </div>

            <div className="p-4 bg-white/5 border border-white/5 rounded-2xl backdrop-blur-sm">
              <Users2 className="w-5 h-5 text-indigo-400 mb-2" />
              <h4 className="text-white text-xs font-bold uppercase tracking-wider leading-tight mb-1">Role Architect</h4>
              <p className="text-[11px] text-slate-500 font-medium leading-normal">Control exactly which menus are visible to sales, procurement or clerks.</p>
            </div>

            <div className="p-4 bg-white/5 border border-white/5 rounded-2xl backdrop-blur-sm">
              <LineChart className="w-5 h-5 text-indigo-400 mb-2" />
              <h4 className="text-white text-xs font-bold uppercase tracking-wider leading-tight mb-1">POS & procurement</h4>
              <p className="text-[11px] text-slate-500 font-medium leading-normal">Save complete customer invoices or record wholesale purchase ledger details.</p>
            </div>

            <div className="p-4 bg-white/5 border border-white/5 rounded-2xl backdrop-blur-sm">
              <CalendarCheck className="w-5 h-5 text-indigo-400 mb-2" />
              <h4 className="text-white text-xs font-bold uppercase tracking-wider leading-tight mb-1">Staff Payroll</h4>
              <p className="text-[11px] text-slate-500 font-medium leading-normal">Monitor attendance status and disburse advance/salary sheets monthly.</p>
            </div>
          </div>
        </div>

        {/* Footer Credit */}
        <div>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none">
            © 2026 {companyName}. {showPoweredBy ? companyPoweredBy : "Licensed Workspace."}
          </p>
        </div>

      </div>

    </div>
  );
}
