/**
 * The Sphinx's riddles (bead border_marches-bzc.88, CONTENT_MAP_OBJECTS
 * section 3.12): original riddles written for this game, each with four
 * answers of which exactly one is right. A sphinx holds a small pool of
 * them, seeded by the generator (`data.riddles`, indices into
 * {@link RIDDLES}); each hero who comes gets one of its pool (by the hero),
 * so two heroes at one sphinx may hear different riddles.
 */
export interface Riddle {
  readonly id: string;
  readonly text: string;
  readonly answers: readonly [string, string, string, string];
  /** Index of the right answer in `answers`. */
  readonly right: 0 | 1 | 2 | 3;
}

export const RIDDLES: readonly Riddle[] = [
  {
    id: "shadow",
    text: "I follow you all day across the sand, yet at noon I hide under your feet, and at night I am gone. What am I?",
    answers: ["Your camel", "Your shadow", "The wind", "A scorpion"],
    right: 1,
  },
  {
    id: "footprints",
    text: "The more of me you leave behind, the further you have come; the wind takes me as soon as you are gone. What am I?",
    answers: ["Footprints", "Coins", "Water", "Promises"],
    right: 0,
  },
  {
    id: "hourglass",
    text: "I hold a little desert in my belly. Turn me over and I count the time, but I never tell you the hour. What am I?",
    answers: ["A camel", "A drum", "A sundial", "An hourglass"],
    right: 3,
  },
  {
    id: "echo",
    text: "I live in the empty tomb. I speak only after you do, and always with your words. What am I?",
    answers: ["A ghost", "An echo", "A parrot", "A mummy"],
    right: 1,
  },
  {
    id: "map",
    text: "I have deserts without sand, rivers without water and mountains without stone. What am I?",
    answers: ["A dream", "A painting of the sea", "A map", "A cloud"],
    right: 2,
  },
  {
    id: "secret",
    text: "Kept, I am yours alone; shared once, I am no longer what I was. What am I?",
    answers: ["A secret", "A coin", "A bread loaf", "A sword"],
    right: 0,
  },
  {
    id: "candle",
    text: "I grow shorter the longer I work, and I weep as I give you light. What am I?",
    answers: ["A torch", "An old king", "A candle", "The sun"],
    right: 2,
  },
  {
    id: "egg",
    text: "No door, no window, no lock, yet a living thing waits inside me to break out. What am I?",
    answers: ["A tomb", "A prison", "A shell of sand", "An egg"],
    right: 3,
  },
  {
    id: "name",
    text: "It is yours, yet your friends use it far more often than you do. What is it?",
    answers: ["Your name", "Your purse", "Your horse", "Your boots"],
    right: 0,
  },
  {
    id: "fire",
    text: "Feed me and I grow; give me a drink and I die. What am I?",
    answers: ["A cactus", "A fire", "A dragon", "A sand dune"],
    right: 1,
  },
  {
    id: "silence",
    text: "Say my name and I am broken at once. What am I?",
    answers: ["A vow", "Glass", "Silence", "A spell"],
    right: 2,
  },
  {
    id: "stars",
    text: "By day you cannot find us, by night we guide the caravans, and we never fall however long we hang. What are we?",
    answers: ["Lanterns", "Bats", "Kites", "The stars"],
    right: 3,
  },
];

/** The riddle with this index (wraps round the list). */
export function riddleAt(index: number): Riddle {
  const n = RIDDLES.length;
  return RIDDLES[((Math.trunc(index) % n) + n) % n] as Riddle;
}
