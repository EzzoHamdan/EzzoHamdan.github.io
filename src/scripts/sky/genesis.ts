/**
 * The beginning, between the hero (stop 0) and the first title (stop 1), as positions along the
 * route in stops. Shared by the sky (sky/journey.ts::drawGenesis) and the page (journey.ts), so
 * the planes keep out of the blast's way.
 * - close: darkness closes in on the center of Amman's sky; the hero is gone by its end
 * - bang: the singularity has waited alone since `close` ended; the blast begins
 * - blast: how long the blast lasts
 * - title: the first title gathers from here, once the flash has faded
 * - born: the new universe has grown to full size
 * All of it lies between the hero's hold and the title's (HOLD = 0.2), so nothing flashes while
 * text is being read.
 */
export const GENESIS = { close: [0.2, 0.5], bang: 0.56, blast: 0.22, title: 0.7, born: 0.88 } as const;
