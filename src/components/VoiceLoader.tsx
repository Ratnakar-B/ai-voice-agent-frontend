import { AudioLines } from 'lucide-react';

type VoiceLoaderVariant = 'screen' | 'section' | 'inline';

export function VoiceLoader({
  label = 'Loading...',
  variant = 'section',
  showLabel = true,
}: {
  label?: string;
  variant?: VoiceLoaderVariant;
  showLabel?: boolean;
}) {
  return (
    <div className={`voice-loader voice-loader-${variant}`} role="status" aria-live="polite" aria-label={label}>
      <span className="voice-loader-mark" aria-hidden="true"><AudioLines size={variant === 'inline' ? 14 : 22} /></span>
      {showLabel && <span className="voice-loader-label">{label}</span>}
    </div>
  );
}
