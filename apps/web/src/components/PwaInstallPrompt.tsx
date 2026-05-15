import { useEffect, useMemo, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

const DISMISSED_KEY = 'pokerplanner-pwa-install-dismissed';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIosSafari() {
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === 'true');
  const ios = useMemo(() => isIosSafari(), []);

  useEffect(() => {
    if (dismissed || isStandalone()) return;

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    }

    function onAppInstalled() {
      setVisible(false);
      setDismissed(true);
      localStorage.setItem(DISMISSED_KEY, 'true');
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    const iosTimer = ios ? window.setTimeout(() => setVisible(true), 1200) : undefined;

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      if (iosTimer) window.clearTimeout(iosTimer);
    };
  }, [dismissed, ios]);

  if (!visible || dismissed || isStandalone()) return null;
  if (!installEvent && !ios) return null;

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') {
      dismiss();
      return;
    }
    setInstallEvent(null);
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-3 bottom-[6.5rem] z-40 mx-auto max-w-md rounded-xl border border-pit-teal/30 bg-pit-card p-3 shadow-2xl md:bottom-5 md:left-auto md:right-24 md:mx-0">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-pit-teal/25 bg-pit-teal/15 text-pit-teal">
          {ios ? <Share size={18} /> : <Download size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Install PokerPlanner</p>
              <p className="mt-1 text-xs leading-5 text-pit-text">
                {ios
                  ? 'Tap Share, then Add to Home Screen to launch it like an app.'
                  : 'Save it to your home screen for faster tournament nights.'}
              </p>
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-pit-muted transition-colors hover:bg-white/5 hover:text-white"
              onClick={dismiss}
              aria-label="Dismiss install prompt"
            >
              <X size={16} />
            </button>
          </div>
          {!ios && (
            <button type="button" className="btn-primary mt-3 w-full justify-center py-2 text-sm" onClick={install}>
              <Download size={14} />
              Install app
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
