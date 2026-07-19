# Drive the Overlay Waveform from Audio Amplitude

VoiceReader's Playback Overlay will render a waveform driven by real playback energy rather than a purely decorative animation. The playback renderer derives lightweight normalized amplitude plus a compact 13-level spectral profile from the active audio stream and sends it to the overlay at a bounded rate. The overlay interpolates those targets at display refresh rate with a fast attack and slower release, preserving a continuous Dynamic-Island-like form without sending raw audio bytes or persisting audio-derived metrics.

ADR-0026 refines the same renderer boundary by making its audio-output outcome explicit and session-scoped; amplitude and progress remain presentation metrics rather than terminal-state authority.
