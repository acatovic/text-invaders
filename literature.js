import sources from './literature/sources.json';

// Vite bundles the local text files, so playing never depends on Gutenberg
// being online and a new game can change the page immediately.
const samples = import.meta.glob('./literature/samples/*.txt', {
  query: '?raw',
  import: 'default',
  eager: true,
});
export const readings = sources.map((source) => {
  const text = samples[`./literature/samples/${source.id}.txt`].trim();
  const paragraphs = text.split(/\n\s*\n/);

  return { ...source, url: `https://www.gutenberg.org/ebooks/${source.gutenbergId}`, paragraphs };
});

export function chooseReading(previousId, random = Math.random) {
  const pool = readings.filter((reading) => reading.id !== previousId);
  const reading = pool[Math.floor(random() * pool.length)];
  // Vary the opening of the page as well as the work itself.
  const start = Math.floor(random() * reading.paragraphs.length);
  return { ...reading, paragraphs: [...reading.paragraphs.slice(start), ...reading.paragraphs.slice(0, start)] };
}

export function chooseQuote(reading, previousQuote, random = Math.random) {
  const pool = reading.quotes.filter((quote) => quote !== previousQuote);
  return pool[Math.floor(random() * pool.length)] ?? reading.quotes[0];
}
