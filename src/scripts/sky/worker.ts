import { createSky, type SkyMessage } from './renderer';
import { createJourney, type JourneyMessage } from './journey';
import { setClockOffset } from './astro';

type Renderer = { handle(msg: never): void };
let sky: Renderer | undefined;

// The page picks the renderer once, at init: the dome, or the galaxy journey
self.onmessage = (event: MessageEvent<SkyMessage | JourneyMessage>) => {
  const msg = event.data;
  if (msg.type === 'init' && msg.canvas) {
    // The page's clock, which may be previewing another hour (astro.ts::now)
    setClockOffset(msg.clockOffset);
    const emit = (e: unknown) => self.postMessage(e);
    sky = 'mode' in msg && msg.mode === 'journey' ? createJourney(msg.canvas, emit) : createSky(msg.canvas, emit);
  }
  sky?.handle(msg as never);
};
