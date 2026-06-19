# PRD: Chrome Extension Voice Reader MVP

Historical note: This PRD describes the original Chrome extension direction. VoiceReader's current product direction is the macOS Electron app described in `docs/prd/macos-voicereader-mvp.md`; future implementation should follow that PRD together with ADR-0010 and ADR-0014.

Intended triage label: `ready-for-agent`

## Problem Statement

The user wants a personal Chrome extension that can read the current web page aloud without copying text into a separate application. The extension should read the current Rendered Text, prefer the user's Selected Text when present, otherwise extract Article Text, and send the resulting Reading Target to MiniMax TTS for speech playback.

The user wants this experience to be fast, stateless, keyboard-friendly, and compatible with pages that have already been changed by other extensions such as translation tools. The user does not want the product to store Reading Targets, generated audio, playback progress, or history.

## Solution

Build a Manifest V3 Chrome extension named Reader. Reader requests persistent page access, injects a lightweight content script, and only extracts text after an explicit user trigger from the popup or keyboard shortcut.

Reader has two user-facing extension pages:

- An options page where the user enters a MiniMax API key and verifies the connection.
- A popup control panel where the user chooses the model, language-scoped Voice, and Speech Rate, then starts or stops playback.

Reader uses MiniMax streaming TTS to stream mp3 audio. The service worker coordinates browser commands, tab access, and extension messages. The offscreen document owns MiniMax HTTP streaming, audio buffering, playback, cancellation, and Speech Rate.

Reader is stateless with respect to content. It persists only user configuration, language-scoped Preferred Voice choices, non-content connection status, and non-content playback preferences.

## User Stories

1. As a Chrome user, I want to press a shortcut to read the current page, so that I can listen without opening another app.
2. As a Chrome user, I want Reader to read my Selected Text first, so that I can listen to a specific passage.
3. As a Chrome user, I want Reader to read Article Text when nothing is selected, so that I can listen to the main page content.
4. As a Chrome user, I want Reader to use the current Rendered Text, so that text changed by translation extensions can be read.
5. As a Chrome user, I want Reader to avoid reading navigation, ads, and unrelated page chrome, so that playback focuses on the article.
6. As a Chrome user, I want Reader to start a new Playback Session when I trigger reading again, so that only one audio stream plays at a time.
7. As a Chrome user, I want a separate stop shortcut, so that I can immediately stop playback.
8. As a Chrome user, I want the popup to start playback, so that I can control reading without remembering shortcuts.
9. As a Chrome user, I want the popup to stop playback, so that I have a visible control path.
10. As a Chrome user, I want playback to continue after the popup closes, so that clicking away does not stop audio.
11. As a Chrome user, I want Reader to be stateless, so that sensitive page content is not retained.
12. As a Chrome user, I want Reader not to save audio files, so that generated speech does not accumulate locally.
13. As a Chrome user, I want Reader not to save Reading History, so that prior page content is not exposed later.
14. As a Chrome user, I want Reader not to restore prior playback progress, so that each trigger reads the current page state.
15. As a Chrome user, I want to configure my own MiniMax API key, so that Reader uses my own MiniMax subscription.
16. As a Chrome user, I want to verify my MiniMax API key, so that I know speech generation can work before using the popup.
17. As a Chrome user, I want the popup controls disabled until the MiniMax connection is verified, so that invalid setup is obvious.
18. As a Chrome user, I want MiniMax connection verification to load voices, so that Voice choices reflect my account and MiniMax's current voice list.
19. As a Chrome user, I want Reader to show clear API key validation errors, so that I can fix MiniMax setup.
20. As a Chrome user, I want to choose a MiniMax model, so that I can trade off speed and quality.
21. As a Chrome user, I want Reader to default to a low-latency model, so that reading starts quickly.
22. As a Chrome user, I want Reader to dynamically load voices from MiniMax, so that system voices and my available voices are current.
23. As a Chrome user, I want Reader to fall back to bundled common Voice IDs or custom Voice ID entry if voice loading fails, so that playback is not blocked by voice discovery.
24. As a Chrome user, I want Reader to detect each Reading Segment's language, so that mixed-language content can use appropriate Voices.
25. As a Chrome user, I want the Voice selector to show the current Detected Language, so that I know which language preference I am changing.
26. As a Chrome user, I want the Voice selector to list only voices for the current Detected Language, so that I do not accidentally select a mismatched Voice.
27. As a Chrome user, I want the first available Voice for a language to become that language's Default Voice, so that Reader works without per-language setup.
28. As a Chrome user, I want my selected Voice to become that language's Preferred Voice, so that future Reading Segments in that language use it.
29. As a Chrome user, I want Preferred Voice choices saved per language, so that Chinese and English preferences do not overwrite each other.
30. As a Chrome user, I want Reader to use lightweight local language detection, so that language choice works without another service.
31. As a Chrome user, I want Reader to support Chinese, English, Japanese, Korean, and broad Latin-script detection, so that common pages are handled.
32. As a Chrome user, I want unknown languages to fall back safely, so that playback can still proceed.
33. As a Chrome user, I want Speech Rate controls, so that I can listen faster or slower.
34. As a Chrome user, I want Speech Rate to be applied during browser playback, so that changing speed does not regenerate audio.
35. As a Chrome user, I want my Speech Rate choice saved as a default, so that I do not configure it each time.
36. As a Chrome user, I want long Reading Targets split into Reading Segments, so that playback can start before the full article is generated.
37. As a Chrome user, I want later Reading Segments buffered while the current one plays, so that long articles have short gaps between segments.
38. As a Chrome user, I want stop and replacement actions to cancel MiniMax streaming quickly, so that I am not charged or delayed for unwanted audio.
39. As a Chrome user, I want clear errors when no readable text is found, so that I know the page cannot be read.
40. As a Chrome user, I want clear errors when MiniMax generation fails, so that I know whether the problem is network, quota, key, model, or Voice related.
41. As a Chrome user, I want Reader not to automatically fall back to system TTS, so that voice quality and behavior do not change unexpectedly.
42. As a Chrome user, I want Reader to work on normal HTML pages, so that common articles, blogs, documentation, and news pages can be read.
43. As a Chrome user, I want Reader to make a best effort on dynamic pages, so that the current visible DOM can still be read when possible.
44. As a Chrome user, I accept that Reader will not support Chrome internal pages, browser PDF viewer content, cross-origin iframe text, or complex editors as first-class targets, so that MVP scope stays focused.
45. As a Chrome user, I want Reader not to highlight the current paragraph in the page, so that it does not modify page layout.
46. As a Chrome user, I want Reader to use persistent page access, so that popup and keyboard-triggered reading can work smoothly across sites.
47. As a Chrome user, I want Reader to extract text only after I trigger it, so that persistent access does not mean automatic content collection.
48. As a developer, I want a typed message protocol between extension contexts, so that content extraction, playback control, and status updates remain reliable.
49. As a developer, I want extension behavior tested at user-visible seams, so that tests protect the product behavior rather than internal implementation.
50. As a developer, I want MiniMax integrations isolated behind testable adapters, so that API behavior can be simulated without real TTS calls in normal tests.

## Implementation Decisions

- Build Reader as a Chrome Manifest V3 extension using TypeScript, browser-native ES modules, and DOM UI.
- Use a single global domain context with the existing Reader glossary.
- Use an options page only for MiniMax API key entry and connection verification.
- Define successful connection verification as a successful MiniMax Get Voice API call with `voice_type: "all"`.
- Store the user-provided MiniMax API key locally in extension storage.
- Use the popup as the playback control panel, not as the playback process.
- Do not implement a side panel in the MVP.
- The popup shows model, current Detected Language, language-filtered Voice choices, Speech Rate, start, and stop controls.
- Use MiniMax's dynamic voice list as the primary Voice source.
- Group MiniMax voices by inferred language from available voice metadata and local rules.
- Use the first available Voice for a language as that language's Default Voice.
- Persist Preferred Voice by language when the user chooses a Voice for the current Detected Language.
- Use a bundled common Voice list and custom Voice ID entry as a fallback if MiniMax voice loading fails.
- Use an internal model list rather than dynamic model discovery.
- Default the model to `speech-2.8-turbo`.
- Do not implement Voice Effect controls in the MVP.
- Apply Speech Rate in browser playback rather than regenerating audio at a new speed.
- Use two keyboard commands: one to read the current Reading Target and one to stop reading.
- Starting a new Playback Session replaces the current Playback Session.
- Keep only one Playback Session active at a time.
- Request persistent page access instead of relying only on temporary active-tab permission.
- Inject a lightweight content script for supported pages.
- The content script must only extract text after a user-triggered command from the extension.
- Selected Text has priority over Article Text.
- Use Mozilla Readability as the primary Article Text extraction path.
- Fall back to simplified visible text extraction if Readability fails or produces insufficient text.
- Do not read hidden text, scripts, styles, or form input values as Article Text.
- Do not highlight or otherwise mutate the page during playback.
- Split Reading Targets into Reading Segments based on paragraph boundaries, merging short paragraphs and splitting long paragraphs.
- Detect language per Reading Segment using lightweight local rules for Chinese, English, Japanese, Korean, Latin-script fallback, and unknown fallback.
- Select Voice per Reading Segment using Preferred Voice for the Detected Language, then Default Voice for the Detected Language, then a safe fallback.
- Use MiniMax HTTP streaming TTS for browser-verifiable speech generation, because browser WebSocket clients cannot attach the Bearer authorization header required by MiniMax's WebSocket API.
- Use mp3 as the first supported output format.
- Run MiniMax HTTP streaming and audio playback in the offscreen document.
- Use the service worker only for command handling, tab coordination, message routing, and offscreen document lifecycle.
- Buffer enough audio to start quickly, then prefetch/generate later Reading Segments while the current segment plays.
- Stop and replacement actions must cancel active MiniMax streaming generation and clear queued audio.
- Do not persist Selected Text, Article Text, Reading Segments, generated audio, playback progress, or Reading History.
- Persist only API key, model default, Speech Rate default, language-scoped Preferred Voice values, voice-list cache metadata if needed, and non-content validation status.
- Do not automatically fall back to browser/system TTS when MiniMax fails.
- Display clear errors for extraction failure, connection failure, MiniMax generation failure, playback failure, missing text, unavailable Voice, and invalid model.
- Support ordinary HTML web pages as the primary target.
- Treat dynamic pages as best effort based on the current DOM.
- Exclude first-class support for Chrome internal pages, Chrome Web Store pages, browser PDF viewer content, cross-origin iframe text, and complex editor surfaces.

## Testing Decisions

- Tests should focus on external behavior: what text is selected, what messages are sent, what storage changes, what playback state is reported, and what UI states users see.
- Unit test the Reading Target selection seam: Selected Text is preferred; Article Text is used when no selection exists; empty results produce a user-visible error.
- Unit test the Article Text extraction seam using static DOM fixtures for article pages, pages with navigation noise, and pages with insufficient readable content.
- Unit test Reading Segment creation with short paragraphs, long paragraphs, mixed punctuation, Chinese text, English text, and empty text.
- Unit test Detected Language classification for Chinese, English/Latin, Japanese, Korean, mixed segments, and unknown text.
- Unit test Voice selection behavior for Preferred Voice, Default Voice, missing language group, failed voice loading, and custom Voice ID fallback.
- Unit test settings persistence for API key, model default, Speech Rate default, and language-scoped Preferred Voice values.
- Unit test that content-bearing values are not written to persistent storage.
- Unit test MiniMax request construction and stream parsing without calling the real MiniMax API.
- Integration test the options page with a mocked successful Get Voice response and a mocked failed response.
- Integration test the popup disabled state before connection verification and enabled state after verification.
- Integration test popup model, Voice, and Speech Rate selection persistence.
- Integration test command handling: read command starts a new Playback Session; stop command stops the active session; a second read command replaces the active session.
- Integration test offscreen playback state transitions with mocked MiniMax streaming and mocked audio queue.
- Browser-level smoke test a built extension on a local HTML article page to verify popup start, shortcut start, stop, and no page highlighting.
- Browser-level smoke test a selected-text case to verify Selected Text takes precedence over Article Text.
- Browser-level smoke test a mixed Chinese/English fixture to verify per-segment language and Voice selection.
- Manual verification should include a real MiniMax key, one short page, one long page, one selected-text case, one mixed-language page, and one extraction-failure page.
- The current repo has no prior tests; new seams should be introduced at the highest practical level around extension context messaging, content extraction, and playback coordination.

## Out of Scope

- Built-in translation.
- Translation API integration.
- Reading History.
- Persisted audio.
- Persisted Reading Targets.
- Persisted playback progress.
- Side panel UI.
- Page-level highlighting.
- Voice Effect controls.
- Automatic fallback to browser/system TTS.
- Account system, shared backend, proxy service, quota management, or billing.
- Public multi-user deployment concerns beyond the local user-provided API key model.
- Full support for PDFs, Chrome internal pages, cross-origin iframe text, Google Docs-style editors, and other non-standard document surfaces.
- Sentence-level or word-level voice switching inside a Reading Segment.
- Strict gapless audio playback.
- Full language identification across all MiniMax-supported languages.

## Further Notes

- Reader is intentionally a personal-use extension for the MVP.
- MiniMax Get Voice is used both as connection verification and as the source of available voices.
- MiniMax HTTP streaming TTS is the selected generation path for the browser extension.
- The MVP optimizes for fast start, clear cancellation, privacy, and a small UI surface.
- The product language is defined in the Reader glossary, especially Rendered Text, Article Text, Selected Text, Reading Target, Reading Segment, Detected Language, Playback Session, Speech Rate, Voice, Default Voice, and Preferred Voice.
