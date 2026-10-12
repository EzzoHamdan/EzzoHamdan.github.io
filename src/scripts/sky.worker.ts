import { createSky, type SkyMessage } from './sky-renderer';

let sky: ReturnType<typeof createSky> | undefined;

self.onmessage = (event: MessageEvent<SkyMessage>) => {
  const msg = event.data;
  if (msg.type === 'init' && msg.canvas) sky = createSky(msg.canvas);
  sky?.handle(msg);
};
