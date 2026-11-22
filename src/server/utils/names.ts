const ADJECTIVES = [
  "Swift", "Brave", "Calm", "Clever", "Cosmic", "Daring", "Eager", "Fuzzy", "Gentle", "Happy",
  "Jolly", "Keen", "Lucky", "Mellow", "Nimble", "Plucky", "Quick", "Radiant", "Sunny", "Witty",
];
const ANIMALS = [
  "Otter", "Falcon", "Panda", "Lynx", "Heron", "Gecko", "Koala", "Narwhal", "Fox", "Owl",
  "Badger", "Dolphin", "Ibis", "Jaguar", "Lemur", "Moose", "Newt", "Orca", "Puffin", "Raven",
];

/** Friendly anonymous name, unique within `taken`. */
export function friendlyName(taken: ReadonlySet<string>, rng: () => number = Math.random): string {
  for (let i = 0; i < 40; i++) {
    const n = `${ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)]} ${ANIMALS[Math.floor(rng() * ANIMALS.length)]}`;
    if (!taken.has(n)) return n;
  }
  const base = `${ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)]} ${ANIMALS[Math.floor(rng() * ANIMALS.length)]}`;
  let k = 2;
  while (taken.has(`${base} ${k}`)) k++;
  return `${base} ${k}`;
}

/** Strip control characters and collapse whitespace in a user-provided display name. */
export function sanitizeDisplayName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 32);
  return cleaned.length ? cleaned : null;
}
