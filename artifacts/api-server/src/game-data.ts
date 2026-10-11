import type {
  CategoryId,
  GameConfig,
  LanguageCode,
} from "@workspace/api-zod";

const categoryLabels: Record<LanguageCode, Record<CategoryId, string>> = {
  en: {
    vehicles: "Vehicles",
    household: "Household",
    electronics: "Electronics",
    animals: "Animals",
    school: "School",
    food: "Food",
  },
  bn: {
    vehicles: "যানবাহন",
    household: "ঘরবাড়ি",
    electronics: "ইলেকট্রনিক্স",
    animals: "প্রাণী",
    school: "স্কুল",
    food: "খাবার",
  },
  hi: {
    vehicles: "वाहन",
    household: "घर",
    electronics: "इलेक्ट्रॉनिक्स",
    animals: "जानवर",
    school: "स्कूल",
    food: "खाना",
  },
  es: {
    vehicles: "Vehículos",
    household: "Hogar",
    electronics: "Electrónica",
    animals: "Animales",
    school: "Escuela",
    food: "Comida",
  },
  fr: {
    vehicles: "Véhicules",
    household: "Maison",
    electronics: "Électronique",
    animals: "Animaux",
    school: "École",
    food: "Cuisine",
  },
};

export const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "bn", label: "বাংলা" },
  { code: "hi", label: "हिन्दी" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
] satisfies GameConfig["languages"];

export const WORD_DB = {
  en: {
    vehicles: [
      "SPACESHIP",
      "SUBMARINE",
      "HOVERBOARD",
      "MONSTER TRUCK",
      "ELECTRIC SCOOTER",
      "JETPACK",
      "BULLET TRAIN",
    ],
    household: [
      "AIR PURIFIER",
      "SMART MIRROR",
      "ROBOT VACUUM",
      "ESPRESSO MACHINE",
      "DESK LAMP",
      "BEAN BAG",
    ],
    electronics: [
      "VIRTUAL REALITY HEADSET",
      "DRONE",
      "SMARTWATCH",
      "GAMING CONSOLE",
      "MECHANICAL KEYBOARD",
    ],
    animals: [
      "CHAMELEON",
      "PLATYPUS",
      "SNOW LEOPARD",
      "ELECTRIC EEL",
      "PEACOCK",
      "KANGAROO",
    ],
    school: [
      "MICROSCOPE",
      "3D PRINTER",
      "PROTRACTOR",
      "GRAPHING CALCULATOR",
      "TELESCOPE",
    ],
    food: ["SUSHI", "WAFFLE", "TACO", "DIM SUM", "CROISSANT", "PASTA"],
  },
  bn: {
    vehicles: [
      "মহাকাশযান",
      "সাবমেরিন",
      "হভারবোর্ড",
      "ইলেকট্রিক স্কুটার",
      "বুলেট ট্রেন",
      "রকেট",
      "হেলিকপ্টার",
    ],
    household: [
      "এয়ার পিউরিফায়ার",
      "স্মার্ট আয়না",
      "রোবট ভ্যাকিউম",
      "কফি মেকার",
      "রিমোট",
      "স্টাডি ল্যাম্প",
    ],
    electronics: [
      "ভিআর হেডসেট",
      "ড্রোন",
      "স্মার্টওয়াচ",
      "গেমিং কনসোল",
      "ক্যামেরা",
      "প্রোজেক্টর",
    ],
    animals: [
      "গিরগিটি",
      "প্লাটিপাস",
      "তুষার চিতা",
      "ময়ূর",
      "ক্যাঙ্গারু",
      "জলহস্তী",
    ],
    school: ["মাইক্রোস্কোপ", "প্রোট্র্যাক্টর", "টেলিস্কোপ", "গ্লোব", "ক্যালকুলেটর"],
    food: ["ফুচকা", "বিরিয়ানি", "মোমো", "বার্গার", "পাস্তা", "প্যাটিস"],
  },
  hi: {
    vehicles: [
      "अंतरिक्ष यान",
      "पनडुब्बी",
      "हवरबोर्ड",
      "इलेक्ट्रिक स्कूटर",
      "बुलेट ट्रेन",
      "रॉकेट",
    ],
    household: [
      "एयर प्यूरीफायर",
      "स्मार्ट शीशा",
      "रोबोट वैक्यूम",
      "कॉफी मशीन",
      "स्टडी लैंप",
    ],
    electronics: [
      "वीआर हेडसेट",
      "ड्रोन",
      "स्मार्टवॉच",
      "गेमिंग कंसोल",
      "कैमरा",
    ],
    animals: ["गिरगिट", "तेंदुआ", "मोर", "कंगारू", "दरियाई घोड़ा"],
    school: ["सूक्ष्मदर्शी", "दूरबीन", "ग्लोब", "कैलकुलेटर"],
    food: ["समोसा", "बिरयानी", "मोमो", "डोसा", "पास्ता"],
  },
  es: {
    vehicles: ["NAVE ESPACIAL", "SUBMARINO", "MONOPATÍN", "TREN BALA", "COHETE"],
    household: [
      "ASPIRADORA ROBOT",
      "MÁQUINA DE CAFÉ",
      "LÁMPARA DE ESCRITORIO",
      "ESPEJO INTELIGENTE",
    ],
    electronics: [
      "GAFAS DE REALIDAD VIRTUAL",
      "DRON",
      "RELOJ INTELIGENTE",
      "CONSOLA DE JUEGOS",
    ],
    animals: ["CAMALEÓN", "LEOPARDO DE LAS NIEVES", "PAVO REAL", "CANGURO"],
    school: ["MICROSCOPIO", "TELESCOPIO", "CALCULADORA", "GLOBO TERRÁQUEO"],
    food: ["TACOS", "EMPANADAS", "PASTA", "SUSHI"],
  },
  fr: {
    vehicles: [
      "VAISSEAU SPATIAL",
      "SOUS-MARIN",
      "TROTTINETTE",
      "TRAIN À GRANDE VITESSE",
    ],
    household: [
      "ASPIRATEUR ROBOT",
      "MACHINE À CAFÉ",
      "LAMPE DE BUREAU",
      "MIROIR CONNECTÉ",
    ],
    electronics: [
      "CASQUE DE RÉALITÉ VIRTUELLE",
      "DRONE",
      "MONTRE CONNECTÉE",
      "CONSOLE DE JEU",
    ],
    animals: ["CAMÉLÉON", "LÉOPARD DES NEIGES", "PAON", "KANGOUROU"],
    school: ["MICROSCOPE", "TÉLESCOPE", "CALCULATRICE", "GLOBE"],
    food: ["CROISSANT", "PÂTES", "SUSHI", "QUICHE"],
  },
} satisfies Record<LanguageCode, Record<CategoryId, string[]>>;

export const BOT_CLUES: Record<LanguageCode, string[]> = {
  en: [
    "It is related to technology or modern use.",
    "You can find this in daily life.",
    "It requires care or proper handling.",
    "It has a distinct feature.",
  ],
  bn: [
    "এটি দৈনন্দিন জীবনের সাথে সম্পর্কিত।",
    "এটি ব্যবহার করা বেশ সহজ।",
    "এটির বিশেষ একটি বৈশিষ্ট্য আছে।",
    "এটি আমরা মাঝে মাঝেই দেখতে পাই।",
  ],
  hi: [
    "यह दैनिक जीवन से संबंधित है।",
    "इसका उपयोग करना आसान है।",
    "इसकी एक विशेष विशेषता है।",
  ],
  es: [
    "Es algo útil en la vida diaria.",
    "Tiene una característica especial.",
    "Es fácil de reconocer.",
  ],
  fr: [
    "C'est utile dans la vie de tous les jours.",
    "Il a une caractéristique spéciale.",
  ],
};

export function getGameConfig(language: LanguageCode): GameConfig {
  return {
    language,
    languages: LANGUAGE_OPTIONS,
    categories: Object.entries(categoryLabels[language]).map(([id, label]) => ({
      id: id as CategoryId,
      label,
    })),
  };
}

export function getRandomWord(
  language: LanguageCode,
  category: CategoryId,
): string {
  const words = WORD_DB[language][category];
  return words[Math.floor(Math.random() * words.length)];
}

export function getRandomBotClue(language: LanguageCode): string {
  const clues = BOT_CLUES[language];
  return clues[Math.floor(Math.random() * clues.length)];
}
