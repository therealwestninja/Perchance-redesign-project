// render/share_card.js
//
// Canvas-rendered shareable profile card.
//
// Takes a safe view-model (name, title, archetype, level, accent,
// pinned badges, optional avatar) and produces a square PNG image
// suitable for posting or copying. Rendered entirely client-side;
// nothing leaves the browser.
//
// Privacy contract: the fields this module accepts are ONLY the
// public-display fields of the profile (display name, avatar the
// user chose, achievement-derived title, archetype, level, badge
// names). It does NOT accept — and will not render — bio,
// username, age range, custom gender text, or raw counter values.
// The caller is responsible for constructing the view-model from
// those public fields only.

const CARD_SIZE = 1080;                // square, Instagram/X-friendly
const BG = '#151515';                  // dark base matching site aesthetic
const BG_ACCENT_ALPHA = 0.14;          // how strongly the accent tints the bg

/**
 * Produce a Blob for the rendered card. Async because avatar images
 * have to load first.
 *
 * @param {{
 *   displayName: string,
 *   title: string,
 *   archetype: string|null,
 *   level: number,
 *   accent: string,                    hex like '#d8b36a'
 *   avatarUrl: string|null,            data URL or null
 *   pinnedBadges: Array<{ name: string, icon: string }>,
 *   xpLabel: string,
 *   progress01: number,
 * }} vm
 * @returns {Promise<Blob|null>} PNG blob, or null if Canvas isn't available
 */
export async function renderShareCard(vm) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  drawBackground(ctx, vm.accent || '#d8b36a');
  if (vm.avatarUrl) {
    try { await drawAvatar(ctx, vm.avatarUrl); }
    catch { drawAvatarFallback(ctx, vm.displayName || 'Chronicler'); }
  } else {
    drawAvatarFallback(ctx, vm.displayName || 'Chronicler');
  }
  drawIdentity(ctx, vm);
  drawLevelBar(ctx, vm);
  drawBadges(ctx, vm.pinnedBadges || [], vm.accent || '#d8b36a');
  drawFooter(ctx);

  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

/**
 * Build a safe view-model from the live profile state. Accepts the
 * same kind of bundle full_page.js passes into splash.update(), plus
 * an explicit accent hex. EXCLUDES every field not listed in the
 * privacy contract above.
 */
export function toShareViewModel({
  displayName,
  title,
  archetype,
  level,
  accent,
  avatarUrl,
  pinnedBadges,
  xpIntoLevel,
  xpForNextLevel,
  progress01,
}) {
  // Whitelist explicitly — new fields from callers don't land in the
  // card unless we add them here.
  return {
    displayName: String(displayName || 'Chronicler').slice(0, 40),
    title: String(title || 'Newcomer').slice(0, 60),
    archetype: archetype && typeof archetype === 'object' && archetype.label !== 'Newcomer'
      ? String(archetype.label).slice(0, 30)
      : null,
    level: Math.max(1, Math.floor(Number(level) || 1)),
    accent: /^#[0-9a-f]{6}$/i.test(String(accent || '')) ? accent : '#d8b36a',
    avatarUrl: typeof avatarUrl === 'string' && avatarUrl.startsWith('data:') ? avatarUrl : null,
    pinnedBadges: Array.isArray(pinnedBadges)
      ? pinnedBadges.slice(0, 5).map(b => ({
          name: String((b && b.name) || '').slice(0, 40),
          icon: String((b && b.icon) || '◆').slice(0, 4),
        }))
      : [],
    xpLabel: `${Math.floor(Number(xpIntoLevel) || 0)} / ${Math.floor(Number(xpForNextLevel) || 1)} XP`,
    progress01: Math.max(0, Math.min(1, Number(progress01) || 0)),
  };
}

// ---- drawing primitives ----

function drawBackground(ctx, accent) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);
  // Radial accent wash from top
  const grad = ctx.createRadialGradient(CARD_SIZE / 2, 180, 40, CARD_SIZE / 2, 180, 900);
  grad.addColorStop(0, withAlpha(accent, BG_ACCENT_ALPHA));
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);
  // Thin accent border
  ctx.strokeStyle = withAlpha(accent, 0.6);
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, CARD_SIZE - 40, CARD_SIZE - 40);
}

async function drawAvatar(ctx, url) {
  const img = await loadImage(url);
  const size = 240;
  const cx = CARD_SIZE / 2;
  const cy = 230;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
  ctx.restore();
  // Ring
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 + 2, 0, Math.PI * 2);
  ctx.stroke();
}

function drawAvatarFallback(ctx, name) {
  const size = 240;
  const cx = CARD_SIZE / 2;
  const cy = 230;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = 'bold 100px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initialOf(name), cx, cy + 8);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.stroke();
}

function drawIdentity(ctx, vm) {
  const cx = CARD_SIZE / 2;
  // Name
  ctx.fillStyle = '#f0ebe0';
  ctx.font = 'bold 56px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(truncate(vm.displayName, 24), cx, 400);
  // Title
  ctx.fillStyle = vm.accent;
  ctx.font = 'italic 30px system-ui, -apple-system, sans-serif';
  ctx.fillText(`— ${truncate(vm.title, 30)} —`, cx, 476);
  // Archetype pill (if present)
  if (vm.archetype) {
    const label = vm.archetype.toUpperCase();
    ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
    const metrics = ctx.measureText(label);
    const padX = 18, padY = 10;
    const pillW = metrics.width + padX * 2;
    const pillH = 36;
    const pillX = cx - pillW / 2;
    const pillY = 528;
    roundRect(ctx, pillX, pillY, pillW, pillH, 18);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();
    ctx.strokeStyle = vm.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = vm.accent;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, pillY + pillH / 2 + 1);
  }
}

function drawLevelBar(ctx, vm) {
  const cx = CARD_SIZE / 2;
  const barY = 620;
  const barW = 640, barH = 14;
  const barX = cx - barW / 2;
  // Level label
  ctx.fillStyle = vm.accent;
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`Lv ${vm.level}`, cx, 588);
  // Bar bg
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fill();
  // Bar fill
  if (vm.progress01 > 0) {
    const fillW = Math.max(barH, barW * vm.progress01);
    ctx.fillStyle = vm.accent;
    roundRect(ctx, barX, barY, fillW, barH, barH / 2);
    ctx.fill();
  }
  // XP label
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '18px system-ui, -apple-system, sans-serif';
  ctx.fillText(vm.xpLabel, cx, barY + barH + 12);
}

function drawBadges(ctx, badges, accent) {
  if (!badges.length) return;
  const cx = CARD_SIZE / 2;
  const y = 740;
  const count = Math.min(5, badges.length);
  const gap = 20;
  const iconSize = 70;
  const totalW = count * iconSize + (count - 1) * gap;
  let x = cx - totalW / 2;
  for (let i = 0; i < count; i++) {
    const b = badges[i];
    // Ring
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.arc(x + iconSize / 2, y + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(accent, 0.6);
    ctx.lineWidth = 2;
    ctx.stroke();
    // Icon glyph
    ctx.fillStyle = accent;
    ctx.font = '38px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.icon || '◆', x + iconSize / 2, y + iconSize / 2 + 2);
    x += iconSize + gap;
  }
}

function drawFooter(ctx) {
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.font = '16px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Perchance AI Character Chat', CARD_SIZE / 2, CARD_SIZE - 60);
}

// ---- helpers ----

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y,     x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x,     y + h, rr);
  ctx.arcTo(x,     y + h, x,     y,     rr);
  ctx.arcTo(x,     y,     x + w, y,     rr);
  ctx.closePath();
}

function withAlpha(hex, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return `rgba(216,179,106,${alpha})`;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function truncate(s, max) {
  const str = String(s || '');
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function initialOf(name) {
  const s = String(name || '').trim();
  if (!s) return '?';
  return s.charAt(0).toUpperCase();
}
