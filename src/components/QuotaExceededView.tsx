import { useState } from "react";
import { 
  Database, 
  ExternalLink, 
  Copy, 
  Check, 
  Clock, 
  ShieldAlert, 
  HelpCircle,
  AlertTriangle,
  RefreshCw
} from "lucide-react";
import { motion } from "motion/react";

interface QuotaExceededViewProps {
  errorDetails?: any;
  onRetry?: () => void;
}

export default function QuotaExceededView({ errorDetails, onRetry }: QuotaExceededViewProps) {
  const [copied, setCopied] = useState(false);

  const projectId = "studio-1767695098-65e9f";
  const databaseId = "ai-studio-254e2cd5-7d37-444e-878d-72afd87a600f";
  const consoleUrl = `https://console.firebase.google.com/project/${projectId}/firestore/databases/${databaseId}/data?openUpgradeDialog=true`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(consoleUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const errorMessageString = errorDetails 
    ? (typeof errorDetails === "string" ? errorDetails : JSON.stringify(errorDetails, null, 2))
    : "Quota limit exceeded for firestore.googleapis.com";

  const isApiKeyErr = errorMessageString.toLowerCase().includes("api-key") || 
                     errorMessageString.toLowerCase().includes("api key") || 
                     errorMessageString.toLowerCase().includes("api_key") ||
                     errorMessageString.toLowerCase().includes("offline") ||
                     errorMessageString.toLowerCase().includes("unavailable") ||
                     errorMessageString.toLowerCase().includes("network") ||
                     errorMessageString.toLowerCase().includes("credential");

  const badgeText = isApiKeyErr ? "Project API Key or Connection Locked" : "Database Read Limit Reached";
  const mainTitle = isApiKeyErr ? "Firebase API Key / Connection Blocked" : "Firestore Daily Quota Exceeded";

  return (
    <div id="quota-exceeded-container" className="min-h-screen flex items-center justify-center bg-stone-100 dark:bg-black p-4 font-sans selection:bg-amber-500/20 antialiased">
      <motion.div 
         initial={{ opacity: 0, y: 15 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ duration: 0.4 }}
         className="max-w-2xl w-full bg-white dark:bg-[#070707] shadow-xl rounded-2xl border border-stone-200 dark:border-amber-500/25 p-6 md:p-8 space-y-6"
      >
        {/* Header Visual */}
        <div className="flex items-start space-x-4">
          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500 border border-amber-500/20">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              {badgeText}
            </span>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-stone-900 dark:text-white mt-1">
              {mainTitle}
            </h1>
          </div>
        </div>

        {/* Informative explanation */}
        <div className="text-stone-600 dark:text-stone-300 space-y-4 text-sm leading-relaxed border-t border-b border-stone-100 dark:border-amber-500/10 py-6">
          {isApiKeyErr ? (
            <p>
              Your application's Google Cloud / Firebase API key is currently restricted or suspended. 
              This is most commonly triggered when a free trial sandbox database hits its <strong>daily usage limits (such as Firestore's 50,000 read units limit)</strong> 
              or has temporary billing restrictions. When these usage quotas are reached, Cloud services automatically block key access to prevent extra usage or budget overruns.
            </p>
          ) : (
            <p>
              Your application's database instance has hit the <strong>Spark Plan daily read limit (50,000 read units)</strong>.
              As a result, Firestore is rejecting database reads to prevent additional usage or billing checks.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div className="bg-stone-50 dark:bg-stone-900/50 p-4 rounded-xl border border-stone-105 dark:border-amber-500/5 space-y-2">
              <div className="flex items-center space-x-2 text-stone-900 dark:text-white font-medium">
                <Clock className="w-4 h-4 text-amber-500" />
                <span>When will it reset?</span>
              </div>
              <p className="text-stone-500 dark:text-stone-400 text-xs">
                Firestore's free tier quotas reset every 24 hours. The application and its API keys will automatically resume functioning once the quota resets.
              </p>
            </div>

            <div className="bg-stone-50 dark:bg-stone-900/50 p-4 rounded-xl border border-stone-105 dark:border-amber-500/5 space-y-2">
              <div className="flex items-center space-x-2 text-stone-900 dark:text-white font-medium">
                <Database className="w-4 h-4 text-amber-500" />
                <span>How to lift this permanently?</span>
              </div>
              <p className="text-stone-500 dark:text-stone-400 text-xs">
                You can lift this limit permanently by upgrading your project plan to the **Blaze (Pay-as-you-go)** tier or enabling billing in your Firebase console.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <a 
              href={consoleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center space-x-2 bg-stone-950 hover:bg-stone-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-black font-semibold py-3 px-4 rounded-xl transition duration-150 cursor-pointer text-center text-sm shadow-md"
            >
              <span>Upgrade Database Plan</span>
              <ExternalLink className="w-4 h-4" />
            </a>

            <button 
              onClick={copyToClipboard}
              className="flex items-center justify-center space-x-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-900 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 font-medium py-3 px-4 rounded-xl transition duration-150 border border-stone-200 dark:border-stone-800 text-sm"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? "Link Copied!" : "Copy Upgrade URL"}</span>
            </button>
          </div>

          <div className="p-3 bg-amber-500/5 rounded-xl border border-amber-500/10 text-xs text-amber-800 dark:text-amber-300 flex items-start space-x-2">
            <HelpCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
            <span>
              <strong>Note on iFrames:</strong> Since this applet is running inside an iframe, security restrictions may prevent links from opening. If clicking <strong>Upgrade Database Plan</strong> doesn't open a new window, please use <strong>Copy Upgrade URL</strong> and paste it directly into your browser's search bar, or try opening this app in a new tab first.
            </span>
          </div>
        </div>

        {/* Technical Error Stack Accordion */}
        <div className="pt-2">
          <details className="group border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden transition-all duration-300">
            <summary className="flex items-center justify-between p-3 bg-stone-50 dark:bg-stone-900/40 text-xs font-semibold text-stone-500 dark:text-stone-400 cursor-pointer group-open:bg-stone-100 dark:group-open:bg-stone-900/60 transition-colors">
              <span className="flex items-center space-x-2 font-mono">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span>TECHNICAL_ERROR_LOG.JSON</span>
              </span>
              <span className="text-[10px] group-open:rotate-180 transition-transform duration-200">▼</span>
            </summary>
            <div className="p-4 bg-stone-950 text-stone-300 font-mono text-[11px] leading-relaxed border-t border-stone-200 dark:border-stone-800 overflow-x-auto max-h-52">
              <pre>{errorMessageString}</pre>
            </div>
          </details>
        </div>

        {/* Retry/Refresh button */}
        {onRetry && (
          <div className="flex justify-center pt-2">
            <button
              onClick={onRetry}
              className="flex items-center space-x-2 text-xs text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-amber-400 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry database connection</span>
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
