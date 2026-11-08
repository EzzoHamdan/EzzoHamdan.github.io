/**
 * The beginning, between the hero (stop 0) and the first title (stop 1), as positions along the
 * route in stops. Shared by the sky (sky/journey.ts::drawGenesis) and the page (journey.ts), so
 * the planes keep out of the blast's way. The hero itself is the void: pitch black.
 * - glow: a small light appears in the void as soon as the page moves, and swells
 * - heroGone: the hero has left by here, so the light is alone before it bursts
 * - bang: the blast begins
 * - blast: how long the blast lasts
 * - title: the first title gathers from here, once the flash has faded
 * - born: the new universe has grown to full size
 * The flash lies between the hero leaving and the title gathering, so it is never behind text.
 */
export const GENESIS = { glow: [0.03, 0.5], heroGone: 0.45, bang: 0.5, blast: 0.3, title: 0.74, born: 0.9 } as const;
