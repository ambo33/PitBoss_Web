export interface RecapStat {
  label: string;
  value: string | number;
}

export interface RecapPlacement {
  place: string;
  name: string;
  amount?: string;
  knockouts?: number;
}

export interface TournamentRecapImageInput {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  stats?: RecapStat[];
  placements?: RecapPlacement[];
  highlight?: {
    label: string;
    value: string;
    detail?: string;
  };
}

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;

function escapeXml(value: string | number | undefined | null): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}...` : value;
}

export function buildTournamentRecapSvg(input: TournamentRecapImageInput): string {
  const stats = (input.stats ?? []).slice(0, 4);
  const placements = (input.placements ?? []).slice(0, 9);
  const hasHighlight = Boolean(input.highlight);
  const placementStartY = hasHighlight ? 310 : 270;
  const rowHeight = placements.length > 6 ? 36 : 44;

  const statsMarkup = stats.map((stat, index) => {
    const x = 72 + index * 258;
    return `
      <rect x="${x}" y="190" width="230" height="74" rx="16" fill="#11131a" stroke="#293141"/>
      <text x="${x + 18}" y="220" fill="#85839f" font-size="18" font-weight="700" letter-spacing="2">${escapeXml(stat.label).toUpperCase()}</text>
      <text x="${x + 18}" y="250" fill="${index === 1 ? '#11c5c1' : '#ffffff'}" font-size="26" font-weight="900">${escapeXml(stat.value)}</text>
    `;
  }).join('');

  const highlightMarkup = input.highlight ? `
    <rect x="72" y="284" width="1056" height="88" rx="18" fill="#092b2d" stroke="#0fa9a7"/>
    <text x="100" y="320" fill="#11c5c1" font-size="18" font-weight="800" letter-spacing="2">${escapeXml(input.highlight.label).toUpperCase()}</text>
    <text x="100" y="352" fill="#ffffff" font-size="30" font-weight="900">${escapeXml(input.highlight.value)}</text>
    <text x="1128" y="350" text-anchor="end" fill="#b7b4c8" font-size="22" font-weight="700">${escapeXml(input.highlight.detail)}</text>
  ` : '';

  const placementsMarkup = placements.map((placement, index) => {
    const y = placementStartY + index * rowHeight;
    const knockouts = Number(placement.knockouts ?? 0);
    return `
      <rect x="72" y="${y}" width="1056" height="${rowHeight - 6}" rx="12" fill="${index % 2 === 0 ? '#12151d' : '#0c0f15'}" stroke="#272d3b"/>
      <text x="98" y="${y + 25}" fill="#11c5c1" font-size="22" font-weight="900">${escapeXml(placement.place)}</text>
      <text x="180" y="${y + 25}" fill="#ffffff" font-size="22" font-weight="850">${escapeXml(truncate(placement.name, 38))}</text>
      ${knockouts > 0 ? `<text x="840" y="${y + 25}" text-anchor="end" fill="#f5b84b" font-size="20" font-weight="850">KOs x${knockouts}</text>` : ''}
      <text x="1100" y="${y + 25}" text-anchor="end" fill="#11c5c1" font-size="22" font-weight="900">${escapeXml(placement.amount ?? '')}</text>
    `;
  }).join('');

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#071a1b"/>
      <stop offset="50%" stop-color="#0b0d13"/>
      <stop offset="100%" stop-color="#11101a"/>
    </linearGradient>
    <radialGradient id="glow" cx="20%" cy="10%" r="80%">
      <stop offset="0%" stop-color="#13c7c2" stop-opacity="0.36"/>
      <stop offset="58%" stop-color="#13c7c2" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="36" y="36" width="1128" height="558" rx="36" fill="#0b0d13" opacity="0.74" stroke="#16494c" stroke-width="2"/>
  <text x="72" y="88" fill="#11c5c1" font-size="18" font-weight="900" letter-spacing="5">${escapeXml(input.eyebrow ?? 'THEPOKERPLANNER')}</text>
  <text x="72" y="138" fill="#ffffff" font-size="46" font-weight="950">${escapeXml(truncate(input.title, 38))}</text>
  ${input.subtitle ? `<text x="72" y="172" fill="#b7b4c8" font-size="23" font-weight="650">${escapeXml(truncate(input.subtitle, 72))}</text>` : ''}
  <text x="1128" y="92" text-anchor="end" fill="#ffffff" font-size="28" font-weight="950">ThePokerPlanner</text>
  <text x="1128" y="122" text-anchor="end" fill="#11c5c1" font-size="15" font-weight="800" letter-spacing="4">RUN BETTER POKER NIGHTS</text>
  ${statsMarkup}
  ${highlightMarkup}
  ${placementsMarkup}
</svg>`;
}

async function svgToPngBlob(svg: string): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not render recap image.'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = IMAGE_WIDTH;
    canvas.height = IMAGE_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not render recap image.');
    context.drawImage(image, 0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not create recap image.'));
      }, 'image/png', 0.95);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function saveTournamentRecapImage(svg: string, fileName: string): Promise<void> {
  const blob = await svgToPngBlob(svg);
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function shareTournamentRecapImage(svg: string, fileName: string, title: string, text: string): Promise<'shared' | 'downloaded'> {
  const blob = await svgToPngBlob(svg);
  const normalizedFileName = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
  const file = new File([blob], normalizedFileName, { type: 'image/png' });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };

  if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
    await nav.share({ title, text, files: [file] });
    return 'shared';
  }

  await saveTournamentRecapImage(svg, normalizedFileName);
  return 'downloaded';
}
