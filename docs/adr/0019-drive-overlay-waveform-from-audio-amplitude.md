# Drive the Overlay Waveform from Audio Amplitude

VoiceReader's Playback Overlay will render a waveform driven by real playback amplitude rather than a purely decorative animation. The playback renderer should derive lightweight normalized amplitude data from the active audio stream and send it to the overlay at a bounded rate; raw audio bytes are not sent to the overlay or persisted for this purpose.
