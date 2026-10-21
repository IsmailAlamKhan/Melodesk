/** Centre frequencies of the graphic equalizer (octave spacing). Shared by the UI and the injected engine. */
export const EQ_BAND_HZ = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const EQ_BAND_COUNT = EQ_BAND_HZ.length;
/** Largest boost or cut of any band or the preamp, in dB. */
export const EQ_MAX_DB = 12;
