export type Player = {
  id: string;
  name: string;
};

export const WORD_DECKS = {
  "Around the House": [
    "Toaster",
    "Bookshelf",
    "Umbrella",
    "Candle",
    "Doorbell",
    "Vacuum",
    "Pillow",
    "Flashlight",
    "Mirror",
    "Backpack",
  ],
  Food: [
    "Pancakes",
    "Sushi",
    "Popcorn",
    "Watermelon",
    "Dumplings",
    "Chocolate",
    "Tacos",
    "Lemonade",
    "Pretzel",
    "Cupcake",
  ],
  Animals: [
    "Penguin",
    "Giraffe",
    "Octopus",
    "Hedgehog",
    "Flamingo",
    "Dolphin",
    "Chameleon",
    "Owl",
    "Koala",
    "Crocodile",
  ],
  "Places & Travel": [
    "Airport",
    "Lighthouse",
    "Aquarium",
    "Mountain",
    "Museum",
    "Subway",
    "Campground",
    "Waterfall",
    "Amusement Park",
    "Bookstore",
  ],
  "Movies & Stories": [
    "Wizard",
    "Treasure Map",
    "Time Machine",
    "Superhero",
    "Haunted House",
    "Dragon",
    "Secret Agent",
    "Space Station",
    "Detective",
    "Fairy Tale",
  ],
  "Everyday Things": [
    "Traffic Light",
    "Birthday Cake",
    "Elevator",
    "Snowman",
    "Bicycle",
    "Kite",
    "Sunglasses",
    "Alarm Clock",
    "Roller Coaster",
    "Sailboat",
  ],
} as const;

export type Category = keyof typeof WORD_DECKS;
export type CategoryChoice = Category | "Random";
export type Role = "crew" | "impostor";

export type RoleAssignment = Player & {
  role: Role;
  word: string | null;
  category: Category;
  votedOut?: boolean;
};

export type RoundSetup = {
  secretWord: string;
  category: Category;
  assignments: RoleAssignment[];
};

export const WORD_CATEGORIES = Object.keys(WORD_DECKS) as Category[];

export function shuffle<T>(items: readonly T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

export function createRound(
  players: readonly Player[],
  impostorCount: number,
  categoryChoice: CategoryChoice,
): RoundSetup {
  if (players.length < 3) {
    throw new Error("A round needs at least three players.");
  }
  if (impostorCount < 1 || impostorCount >= players.length) {
    throw new Error("The impostor count must be at least one and less than the player count.");
  }

  const category =
    categoryChoice === "Random"
      ? WORD_CATEGORIES[Math.floor(Math.random() * WORD_CATEGORIES.length)]
      : categoryChoice;
  const deck = WORD_DECKS[category];
  const secretWord = deck[Math.floor(Math.random() * deck.length)];
  const impostorIds = new Set(
    shuffle(players).slice(0, impostorCount).map((player) => player.id),
  );

  return {
    secretWord,
    category,
    assignments: players.map((player) => {
      const role: Role = impostorIds.has(player.id) ? "impostor" : "crew";
      return {
        ...player,
        role,
        category,
        word: role === "crew" ? secretWord : null,
      };
    }),
  };
}

export type VoteOutcome = {
  counts: Record<string, number>;
  leaders: string[];
  eliminatedId: string | null;
};

export function countVotes(votes: Record<string, string>): VoteOutcome {
  const counts: Record<string, number> = {};
  Object.values(votes).forEach((suspectId) => {
    counts[suspectId] = (counts[suspectId] ?? 0) + 1;
  });

  const highestCount = Math.max(0, ...Object.values(counts));
  const leaders =
    highestCount === 0
      ? []
      : Object.keys(counts).filter((playerId) => counts[playerId] === highestCount);

  return {
    counts,
    leaders,
    eliminatedId: leaders.length === 1 ? leaders[0] : null,
  };
}

export function guessMatches(guess: string, secretWord: string): boolean {
  return guess.trim().toLocaleLowerCase() === secretWord.trim().toLocaleLowerCase();
}
