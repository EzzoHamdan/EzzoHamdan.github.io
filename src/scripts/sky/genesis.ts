/**
 * The beginning, between the hero (stop 0) and the first title (stop 1), as positions along the
 * route in stops. Shared by the sky (sky/journey.ts::drawGenesis, drawDust) and the page
 * (journey.ts), so the planes keep out of the blast's way. The hero itself is the void: pitch
 * black. The first leg is about 2.8 screens of scroll (journey.ts::WEIGHT), so 0.1 here is a
 * little over a quarter of a screen.
 * - hero: the hero leaves between these, so the light is alone before it bursts
 * - glow: a small light appears in the void as soon as the page moves, and swells
 * - bang: the blast begins
 * - blast: how long the blast lasts
 * - born: the new universe has grown to full size
 * - dust: the camera flies through the young universe's gas (sky/nebula.ts), which takes over from
 *   the blast's afterglow in its colors and cools as it goes; it has the stage to itself
 *   (owner's request, 2026-11-13)
 * - cosmos: the galaxies appear between these, as the gas thins: none shows in the gas or the blast
 * - title: the first title gathers between these, over as much scroll as any other title
 * - caption: the caption reads "The beginning" (13.8 billion years ago) from the first to the
 *   second, as the blast ends, then "Cosmic dawn, the first stars" (13.7 billion years ago: the
 *   first stars lit some 100 to 200 million years after the Big Bang) over the gas, until the third
 * The flash lies between the hero leaving and the title gathering, so it is never behind text.
 */
export const GENESIS = {
  hero: [0.031, 0.157],
  glow: [0.012, 0.175],
  bang: 0.175,
  blast: 0.1036,
  born: 0.357,
  dust: [0.221, 0.661],
  cosmos: [0.554, 0.696],
  title: [0.696, 0.964],
  caption: [0.07, 0.28, 0.69],
} as const;
