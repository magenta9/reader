---
name: VoiceReader
description: A quiet macOS menu bar reader for explicit Reading Target playback.
colors:
  canvas: "#f3f2ef"
  sidebar: "#e7e5e0"
  surface: "#fffefa"
  surface-muted: "#f5f3ee"
  text: "#1d1d1f"
  muted: "#696864"
  faint: "#96938b"
  hairline: "#26241f1a"
  accent: "#2458ef"
  accent-pressed: "#1f4dd0"
  accent-text: "#07101f"
  positive: "#238a52"
  warning: "#c9932b"
  danger: "#b33b2e"
  overlay-pill: "#000000"
  overlay-bar: "#fffffffa"
  overlay-bar-soft: "#ffffff47"
  dark-canvas: "#08090a"
  dark-sidebar: "#141516"
  dark-surface: "#ffffff0d"
  dark-surface-muted: "#ffffff0a"
  dark-surface-raised: "#ffffff13"
  dark-text: "#ffffffe6"
  dark-muted: "#ffffff9e"
  dark-faint: "#ffffff6b"
  dark-hairline: "#ffffff14"
  dark-accent: "#7ea1ff"
  dark-accent-pressed: "#adc1ff"
  dark-positive: "#27c46b"
  dark-warning: "#d5a33a"
typography:
  display:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "32px"
    fontWeight: 760
    lineHeight: 1.08
    letterSpacing: "0"
  headline:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "30px"
    fontWeight: 760
    lineHeight: 1.08
    letterSpacing: "0"
  title:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0"
  body:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "0"
  label:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "13px"
    fontWeight: 680
    lineHeight: 1.5
    letterSpacing: "0"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
  page-x: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.text}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "40px"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    padding: "0 10px"
    height: "40px"
  card-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "22px"
  input-field:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "42px"
  status-chip:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "44px"
  overlay-pill:
    backgroundColor: "{colors.overlay-pill}"
    textColor: "{colors.overlay-bar}"
    rounded: "{rounded.pill}"
    width: "120px"
    height: "32px"
---

# Design System: VoiceReader

## 1. Overview

**Creative North Star: "The Quiet Menu Bar Instrument"**

VoiceReader should look like a compact macOS utility that happens to speak, not like a media app or an AI dashboard. The design system is restrained, dense, and operational: a user opens the Reader Window to complete setup, confirm status, choose a voice, or inspect local history, then returns to the app they were already using.

The main window uses low-chroma macOS layering: a sidebar plane, a content canvas, raised utility surfaces, and small status bands. The Playback Overlay is separate and more decisive: a black pill with amplitude-driven waveform motion that confirms playback without stealing focus.

The system explicitly rejects marketing-site composition, decorative dashboard modules, chat metaphors, gamified voice selection, loud gradients, and any treatment that implies VoiceReader analyzes or summarizes the user's text.

**Key Characteristics:**
- Restrained color with one action accent.
- Native-feeling density and compact Chinese labels.
- Clear setup blockers placed near recovery actions.
- Privacy boundaries expressed in product copy, not decoration.
- Motion only for state feedback, especially playback activity.

## 2. Colors

The palette is a quiet macOS neutral stack with a single blue action color and semantic status colors reserved for readiness, warning, and destructive states.

### Primary
- **Utility Action Blue** (`accent`): Used for primary playback and setup recovery actions, text actions, focus rings, range controls, and informational notes. It should remain rare enough that it always reads as actionable.
- **Pressed Action Blue** (`accent-pressed`): Used only for active or pressed primary-action states.

### Secondary
- **Playback Black** (`overlay-pill`): Used by the transient Playback Overlay and waveform containers. It is not a general dark theme surface.

### Tertiary
- **Ready Green** (`positive`): Used for ready status dots and positive system state.
- **Setup Amber** (`warning`): Used for pending setup, missing voice lists, or shortcut attention.
- **Destructive Red** (`danger`): Used only for confirmed destructive actions and inline errors.

### Neutral
- **Reader Canvas** (`canvas`): The primary window background.
- **Sidebar Plane** (`sidebar`): The navigation rail background; it should remain visually quieter than content.
- **Raised Surface** (`surface`): Main content containers, command panels, settings sections, and history panes.
- **Muted Surface** (`surface-muted`): Nested controls, input backgrounds, chips, shortcut cards, and flat status rows.
- **Primary Ink** (`text`): Body, headings, selected nav, and important status text.
- **Muted Ink** (`muted`): Descriptions, secondary labels, inactive navigation, and metadata.
- **Faint Ink** (`faint`): Decorative timestamps, small marks, and nonessential indicators only.
- **Hairline Separator** (`hairline`): Subtle boundaries around panels and inputs.

### Named Rules
**The One Accent Rule.** Blue is for action, focus, selection, and information only. Never use it as decoration or section theming.

**The Faint-Is-Decorative Rule.** Faint text is never body copy, form labels, or recovery guidance. If a user must read it to proceed, use `muted` or `text`.

**The Overlay-Is-Separate Rule.** The black overlay palette belongs to playback confirmation only. Do not import it into regular Reader Window panels.

## 3. Typography

**Display Font:** System sans stack with SF Pro Text first on macOS and PingFang SC for Chinese fallback.  
**Body Font:** The same system sans stack.  
**Label/Mono Font:** No separate mono family; use tabular numerals for shortcuts, times, durations, and rate values.

**Character:** Typography is compact and native. It should feel like a macOS control surface: clear weights, short line lengths, zero letter spacing, and no display typography outside page titles or command headings.

### Hierarchy
- **Display** (760, `32px`, `1.08`): Page titles in the Reader Window.
- **Headline** (760, `30px`, `1.08`): The Home command heading and other primary task headings.
- **Title** (700, `20px`, `1.15`): Panel headings, settings section titles, and voice/history module titles.
- **Body** (400, `15px`, `1.65`): Descriptive copy, privacy hints, and long history text. Cap prose near 64ch where it is explanatory.
- **Label** (680, `13px`, `1.5`): Form labels, metadata, status copy, setup notes, and compact controls.

### Named Rules
**The Product Sans Rule.** Use one system sans family throughout. Do not introduce display fonts, marketing serif pairings, or decorative mono labels.

**The Zero-Tracking Rule.** Chinese UI labels and mixed English product terms use `letter-spacing: 0`. Do not add uppercase tracked eyebrows.

## 4. Elevation

VoiceReader uses a hybrid of tonal layering and small macOS shadows. Most hierarchy should come from background planes and hairlines. Shadows exist to separate major content from the canvas, not to make every module look like a card.

### Shadow Vocabulary
- **Main Window Low Lift** (`0 6px 8px rgba(24, 22, 18, 0.08)`): Use on the command panel, history panes, and primary settings sections when they need to sit above the canvas.
- **Dark Window Low Lift** (`0 6px 8px rgba(0, 0, 0, 0.32)`): Dark-appearance equivalent for the same raised surfaces.
- **Overlay Float** (`0 10px 26px rgba(0, 0, 0, 0.32), 0 2px 8px rgba(0, 0, 0, 0.2)`): Use only on the non-activating Playback Overlay pill.

### Named Rules
**The One Raised Layer Rule.** A surface may use a shadow or a hairline, but repeated shadowed modules on one screen make the utility feel like a dashboard. Reserve lift for the primary task surface.

## 5. Components

### Buttons
- **Shape:** Full pill for actions (`999px`) with compact heights (`40px` to `44px`).
- **Primary:** Utility Action Blue background with dark text, 24px horizontal padding, and bold weight. Use for Play and the most direct recovery action only.
- **Hover / Focus:** Focus uses a 2px accent outline with a 2px offset. Active state scales to `0.96` over 130ms.
- **Secondary / Ghost / Tertiary:** Secondary actions invert to Primary Ink on Raised Surface. Text actions stay transparent with blue text. Danger actions use Destructive Red only after confirmation or when the destructive intent is explicit.

### Chips
- **Style:** Status chips use Muted Surface with compact label text and an 8px semantic dot.
- **State:** Ready uses Ready Green. Pending uses Setup Amber. The text must also name the state; color alone is never the only signal.

### Cards / Containers
- **Corner Style:** Major containers use gently rounded corners (`16px`); nested controls use `12px`.
- **Background:** Raised Surface for primary panels, Muted Surface for nested controls, and the Sidebar Plane for navigation.
- **Shadow Strategy:** Use Main Window Low Lift only on major panels. Status strips, tabs, and nested cards should be flat or hairline-separated.
- **Border:** Hairline borders are allowed for flat panels such as Voice selection and status strips.
- **Internal Padding:** Use 16px for compact modules, 18px for command panels, and 22px for settings/history surfaces.

### Inputs / Fields
- **Style:** Inputs and selects use Muted Surface, no visible border, 12px radius, 42px height, 14px horizontal padding, and a hairline outline.
- **Focus:** Replace hairline with a 2px accent-tinted outline.
- **Error / Disabled:** Error notes use a red-tinted background and Destructive Red text. Disabled actions reduce opacity and keep the same shape.

### Navigation
- **Style:** The sidebar is a fixed 248px plane with labeled nav buttons. Active items use a translucent white fill in light and dark modes, not a saturated accent fill.
- **Typography:** Nav labels use system sans body sizing with stronger weight only when active.
- **States:** Hover and active states change fill and text color in 130ms. Icons or marks remain secondary and never carry meaning alone.

### Playback Overlay
- **Style:** A compact 120px by 32px black pill with a subtle white inset highlight and white waveform bars.
- **Motion:** The overlay appears with a 170ms opacity/translate/scale transition. Waveform bars respond to audio amplitude. Reduced-motion users get near-instant transitions.
- **Boundary:** The overlay shows playback activity only. It must not display Selected Text, Clipboard Text, raw MiniMax responses, or generated audio details.

## 6. Do's and Don'ts

### Do:
- **Do** keep the Reader Window compact, dense, and task-first.
- **Do** keep playback ambient: the main window may show terse status, but live playback confirmation belongs in the Playback Overlay.
- **Do** place setup blockers beside the action that resolves them.
- **Do** preserve privacy boundaries in visible copy: local history, MiniMax transmission, and non-storage of audio should be plain.
- **Do** use Chinese for user-facing copy while keeping stable English product terms such as Voice, Model, MiniMax, and VoiceReader.
- **Do** respect reduced-motion preferences for the overlay waveform and all state transitions.

### Don't:
- **Don't** make VoiceReader look like a marketing site, an AI writing dashboard, or a media player with decorative playback chrome.
- **Don't** use oversized hero layouts, decorative card grids, gamified voice selection, chat-app metaphors, loud gradients, or visual treatments that imply text content is being analyzed or summarized.
- **Don't** expose Selected Text, Clipboard Text, Reading Targets, raw MiniMax responses, stack traces, or generated audio in status or diagnostic surfaces.
- **Don't** use repeated shadowed cards when a flat band, hairline, or inline status row can carry the information.
- **Don't** use side-stripe borders, gradient text, glassmorphism, uppercase tracked eyebrows, or numbered section scaffolding.
- **Don't** make color the only status indicator; every ready, warning, and error state needs readable text.
