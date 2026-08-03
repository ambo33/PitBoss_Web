import { useEffect, useState } from 'react';
import { Check, Copy, Link2, QrCode, Share2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Modal from './Modal';

type ShareMode = 'link' | 'qr';

export default function JoinShareDialog({
  open,
  onClose,
  kind,
  name,
  inviteCode,
  joinPath,
}: {
  open: boolean;
  onClose: () => void;
  kind: 'group' | 'league';
  name: string;
  inviteCode: string;
  joinPath: string;
}) {
  const [mode, setMode] = useState<ShareMode>('link');
  const [copied, setCopied] = useState(false);
  const joinLink = typeof window === 'undefined' ? joinPath : `${window.location.origin}${joinPath}`;
  const label = kind === 'group' ? 'Group' : 'League';

  useEffect(() => {
    if (!open) return;
    setMode('link');
    setCopied(false);
  }, [open]);

  async function copyLink() {
    await navigator.clipboard.writeText(joinLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function shareLink() {
    if (!navigator.share) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({
        title: `Join ${name}`,
        text: `Join my ${label.toLowerCase()} on ThePokerPlanner.`,
        url: joinLink,
      });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) throw err;
    }
  }

  return (
    <Modal title={`Share ${label} Invite`} open={open} onClose={onClose} mobilePlacement="center">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-pit-border bg-pit-bg/70 p-1">
          <button
            type="button"
            className={`flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition ${mode === 'link' ? 'bg-pit-teal text-white' : 'text-pit-text hover:bg-white/5 hover:text-white'}`}
            onClick={() => setMode('link')}
          >
            <Link2 size={15} /> Link
          </button>
          <button
            type="button"
            className={`flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition ${mode === 'qr' ? 'bg-pit-teal text-white' : 'text-pit-text hover:bg-white/5 hover:text-white'}`}
            onClick={() => setMode('qr')}
          >
            <QrCode size={15} /> QR code
          </button>
        </div>

        {mode === 'link' ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-pit-border bg-pit-bg p-3">
              <p className="break-all font-mono text-xs leading-5 text-pit-text">{joinLink}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-primary h-11 justify-center gap-2" onClick={copyLink}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <button type="button" className="btn-ghost h-11 justify-center gap-2" onClick={() => void shareLink()}>
                <Share2 size={16} /> Share
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="rounded-2xl bg-white p-4">
              <QRCodeSVG value={joinLink} size={210} level="M" includeMargin={false} />
            </div>
            <p className="text-sm text-pit-text">Scan to join {name}.</p>
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl border border-pit-teal/20 bg-pit-teal/10 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-pit-text">Join code</span>
          <span className="font-mono font-black tracking-[0.16em] text-white">{inviteCode}</span>
        </div>
        <p className="text-xs leading-5 text-pit-muted">
          The link and QR code take players straight to this {label.toLowerCase()}. New players can create an account and return here automatically.
        </p>
      </div>
    </Modal>
  );
}
