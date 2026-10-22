import playerShotUrl from './laserSmall_004.ogg?url';
import enemyDestroyedUrl from './lowFrequency_explosion_000.ogg?url';
import playerDeathUrl from './lowFrequency_explosion_001.ogg?url';

const sounds = {
  playerShot: playerShotUrl,
  enemyDestroyed: enemyDestroyedUrl,
  playerDeath: playerDeathUrl,
};

export function setupAudio() {
  let context;
  let output;
  const buffers = new Map();

  return {
    // Called from user input so browsers allow playback, including on mobile.
    unlock() {
      try {
        if (!context) {
          context = new AudioContext();
          output = context.createGain();
          output.gain.value = 0.5;
          output.connect(context.destination);
          for (const [name, url] of Object.entries(sounds)) {
            void fetch(url)
              .then((response) => {
                if (!response.ok) throw new Error('Sound unavailable');
                return response.arrayBuffer();
              })
              .then((data) => context.decodeAudioData(data))
              .then((buffer) => buffers.set(name, buffer))
              .catch(() => {}); // Audio failure must not interrupt the game.
          }
        }
        if (context.state === 'suspended' || context.state === 'interrupted') {
          void context.resume().catch(() => {});
        }
      } catch {
        // Keep the game playable when Web Audio is unavailable.
      }
    },
    pause() {
      if (context) void context.suspend().catch(() => {});
    },
    play(name) {
      const buffer = buffers.get(name);
      if (!buffer || context?.state !== 'running') return;
      // Each event gets its own source, allowing rapid shots and overlapping kills.
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(output);
      source.onended = () => source.disconnect();
      source.start();
    },
  };
}
