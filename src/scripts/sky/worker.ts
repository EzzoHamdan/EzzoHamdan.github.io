import { createSky, type SkyMessage } from './renderer';
import { createJourney, type JourneyMessage } from './journey';

type Renderer = { handle(msg: never): void };
let sky: Renderer | undefined;

// The page picks the renderer once, at init: the dome, or the galaxy journey
self.onmessage = (event: MessageEvent<SkyMessage | JourneyMessage>) => {
  const msg = event.data;
  if (msg.type === 'init' && msg.canvas) {
    const emit = (e: unknown) => self.postMessage(e);
    sky = 'mode' in msg && msg.mode === 'journey' ? createJourney(msg.canvas, emit) : createSky(msg.canvas, emit);
  }
  sky?.handle(msg as never);
};
