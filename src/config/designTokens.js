/**
 * デザインシステム。
 * 気象番組の明るい画面：紺ヘッダー、水色地、緑の地図、白ラベル。
 * 1920の12分割はそのまま使わず、LED単画面へ再構成する。
 */

export const COLOR_TOKENS = {
  "--bg-primary": "#EAF7FF",
  "--bg-secondary": "#F5FBFF",
  "--bg-panel": "#FFFFFF",
  "--bg-panel-alt": "#EDF8FF",
  "--bg-header": "#073B68",
  "--bg-sea": "#DFF4FF",

  "--text-primary": "#092F55",
  "--text-secondary": "#075B9E",
  "--text-muted": "#4A7AA0",
  "--text-inverse": "#FFFFFF",

  "--broadcast": "#073B68",
  "--accent": "#075B9E",
  "--accent-strong": "#07558F",
  "--line": "#7EB8D8",

  "--map-land": "#76C85A",
  "--map-land-selected": "#4BB857",
  "--map-stroke": "#FFFFFF",

  "--weather-sunny": "#FF8A00",
  "--weather-cloudy": "#8CA3B8",
  "--weather-rain": "#087BD7",
  "--weather-snow": "#6EC4FF",
  "--weather-thunder": "#F0C334",

  "--temp-max": "#E62919",
  "--temp-min": "#086DCC",

  "--alert-advisory": "#F0C334",
  "--alert-warning": "#E62919",
  "--alert-critical": "#B10E12",

  "--status-ok": "#4BB857",
  "--status-warn": "#F0C334",
  "--status-error": "#E62919"
};

export const FONT_TOKENS = {
  "--font-main": '"Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif',
  "--font-number": '"Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif'
};

const MIN_FONT_PX = {
  hero: 32,
  large: 16,
  medium: 13,
  small: 11,
  micro: 11
};

export function computeLedTokens(profile) {
  const { width, height } = profile;
  const scale = height / 288;

  const px = (base, min) => `${Math.max(min, Math.round(base * scale))}px`;
  const n = (base, min) => Math.max(min, Math.round(base * scale));

  return {
    "--led-width": `${width}px`,
    "--led-height": `${height}px`,

    "--font-hero": px(48, MIN_FONT_PX.hero),
    "--font-large": px(22, MIN_FONT_PX.large),
    "--font-medium": px(15, MIN_FONT_PX.medium),
    "--font-small": px(12, MIN_FONT_PX.small),
    "--font-micro": px(11, MIN_FONT_PX.micro),

    "--spacing-xs": px(3, 2),
    "--spacing-sm": px(6, 4),
    "--spacing-md": px(10, 6),
    "--spacing-lg": px(16, 10),
    "--spacing-xl": px(22, 14),

    "--icon-hero": px(84, 56),
    "--icon-lg": px(40, 28),
    "--icon-md": px(28, 20),
    "--icon-sm": px(20, 16),

    "--stroke-map": `${Math.max(2, n(2.4, 2))}px`,
    "--stroke-icon": `${Math.max(2, n(2.4, 2))}px`,

    "--radius": px(8, 6),
    "--safe-inset": px(14, 10),
    "--header-height": px(44, 34),
    "--footer-height": px(28, 22),
    "--accent-bar": px(0, 0)
  };
}

export function applyTokens(element, profile) {
  const dynamic = computeLedTokens(profile);
  const all = { ...COLOR_TOKENS, ...FONT_TOKENS, ...dynamic };
  for (const [key, value] of Object.entries(all)) {
    element.style.setProperty(key, value);
  }
  element.style.width = `${profile.width}px`;
  element.style.height = `${profile.height}px`;
  element.dataset.profileId = profile.id;
  element.dataset.pitch = profile.pitch;
  element.dataset.inches = String(profile.inches);
}
