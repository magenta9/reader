# Product

## Register

product

## Users

VoiceReader is for macOS users who work across apps and want selected or clipboard text spoken without switching into a separate reading workflow. They may be reading Chinese, English, Japanese, Korean, Latin-script, or mixed-language text, and they expect the app to stay available from the menu bar while leaving their current app in focus.

The primary job is fast Reading Target playback: explicitly trigger Play, hear the current Selected Text when available, fall back to Clipboard Text when needed, stop immediately with Escape, and review local Reading History later when useful.

## Product Purpose

VoiceReader turns explicit macOS Reading Targets into spoken audio through the user's own MiniMax account. It exists to make text-to-speech feel like a quiet system utility: available globally, visible only when it needs to confirm activity, and clear about what is stored locally.

Success means users can configure MiniMax once, trigger playback from any app, understand why playback is unavailable when setup is incomplete, choose voices and speech settings without friction, and trust Reading History because its privacy boundaries are visible and consistent.

## Brand Personality

VoiceReader should feel quiet, efficient, and trustworthy. The interface should use Chinese for user-facing copy, keep English domain terms stable where the product name or technical concepts require it, and communicate with practical precision rather than warmth for its own sake.

The product should feel like a native macOS tool that respects attention: calm surfaces, compact controls, direct status language, and a Playback Overlay that confirms work without stealing focus.

## Anti-references

VoiceReader should not look like a marketing site, an AI writing dashboard, or a media player with decorative playback chrome. Avoid oversized hero layouts, decorative card grids, gamified voice selection, chat-app metaphors, loud gradients, and visual treatments that imply text content is being analyzed or summarized.

The app should not expose Selected Text, Clipboard Text, Reading Targets, raw MiniMax responses, stack traces, or generated audio in surfaces that are meant only for status or diagnostics. Error and setup states should be specific but safe.

## Design Principles

1. Keep playback ambient. The Reader Window may show terse start or setup status, but playback progress should stay outside the main workflow and preserve the user's current macOS task and focus.
2. Make setup blockers plain. Disabled Play states, API key status, voice availability, shortcut conflicts, and connection failures should be visible in the Reader Window with Chinese labels whose recovery action matches the current blocker.
3. Preserve privacy boundaries. Interfaces should make it clear when text stays local, when text is sent to MiniMax, and what is not stored.
4. Prefer workflow density over decoration. The Reader Window should support repeated use with stable navigation, predictable controls, and compact information hierarchy.
5. Match macOS expectations. Window behavior, menu bar actions, keyboard focus, system appearance, and transient overlay behavior should feel native rather than web-marketing driven.

## Accessibility & Inclusion

Target WCAG AA for the Reader Window and Playback Overlay where applicable. Body text and control labels need AA contrast in light and dark appearances, focus states must be visible, all actionable controls need accessible names, and UI copy should remain readable in Chinese at compact macOS window sizes.

Motion should respect reduced-motion preferences. The Playback Overlay may use waveform motion to communicate audio activity, but transitions should be short, state-driven, and replaceable with near-instant changes for users who reduce motion.
