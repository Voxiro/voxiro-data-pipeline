/**
 * Hardcoded Lagos location coordinates.
 *
 * Keys are normalised (lowercase, hyphens→spaces, punctuation stripped, spaces collapsed)
 * so they match the output of geocoder.ts's normaliseKey() function.
 *
 * Used as Layer 2 of the geocoding cascade — costs nothing and handles the
 * ~200 Lagos landmarks that appear repeatedly in local news.
 *
 * Coordinate accuracy: ±200m for specific streets, ±500m for broad areas.
 * Good enough for a map pin — not good enough for turn-by-turn navigation.
 */

export const KNOWN_LAGOS_LOCATIONS: Record<string, { lat: number; lng: number }> = {
  // ── Lekki Corridor ──────────────────────────────────────────────────────────
  "lekki lagos":                          { lat: 6.4698, lng: 3.5852 },
  "lekki phase 1 lagos":                  { lat: 6.4281, lng: 3.4219 },
  "lekki phase 2 lagos":                  { lat: 6.45,   lng: 3.48   },
  "lekki epe expressway lagos":           { lat: 6.4698, lng: 3.5852 },
  "ajah lagos":                           { lat: 6.4675, lng: 3.5814 },
  "sangotedo lagos":                      { lat: 6.4344, lng: 3.6237 },
  "chevron drive lagos":                  { lat: 6.4344, lng: 3.5237 },
  "osapa lagos":                          { lat: 6.44,   lng: 3.51   },
  "jakande lagos":                        { lat: 6.4494, lng: 3.5403 },
  "igbo efon lagos":                      { lat: 6.4444, lng: 3.5333 },
  "abraham adesanya lagos":               { lat: 6.4344, lng: 3.5703 },
  "badore lagos":                         { lat: 6.44,   lng: 3.5833 },
  "ilaje lagos":                          { lat: 6.4383, lng: 3.4844 },
  "oniru lagos":                          { lat: 6.4444, lng: 3.4536 },
  "banana island lagos":                  { lat: 6.4681, lng: 3.4397 },
  "elegushi lagos":                       { lat: 6.4381, lng: 3.4822 },
  "admiralty way lagos":                  { lat: 6.4352, lng: 3.4511 },

  // ── Victoria Island / Ikoyi ─────────────────────────────────────────────────
  "victoria island lagos":                { lat: 6.4281, lng: 3.4219 },
  "ikoyi lagos":                          { lat: 6.455,  lng: 3.4366 },
  "onikan lagos":                         { lat: 6.4556, lng: 3.3908 },
  "marina lagos":                         { lat: 6.4556, lng: 3.3908 },
  "balogun market lagos":                 { lat: 6.4553, lng: 3.3894 },
  "tinubu square lagos":                  { lat: 6.4553, lng: 3.3880 },
  "national theatre lagos":               { lat: 6.4786, lng: 3.3561 },

  // ── Lagos Island / Bridges ──────────────────────────────────────────────────
  "lagos island lagos":                   { lat: 6.45,   lng: 3.3833 },
  "eko bridge lagos":                     { lat: 6.4667, lng: 3.3667 },
  "carter bridge lagos":                  { lat: 6.4667, lng: 3.35   },
  "third mainland bridge lagos":          { lat: 6.5,    lng: 3.3833 },

  // ── Apapa / Port ────────────────────────────────────────────────────────────
  "apapa lagos":                          { lat: 6.45,   lng: 3.36   },
  "apapa oshodi expressway lagos":        { lat: 6.5,    lng: 3.3333 },
  "tin can island lagos":                 { lat: 6.4333, lng: 3.3167 },
  "ijora lagos":                          { lat: 6.4667, lng: 3.3667 },
  "ebute metta lagos":                    { lat: 6.4833, lng: 3.3667 },
  "otto wharf lagos":                     { lat: 6.4556, lng: 3.3908 },
  "orile iganmu lagos":                   { lat: 6.4833, lng: 3.3333 },
  "ajegunle lagos":                       { lat: 6.4667, lng: 3.3167 },
  "costain lagos":                        { lat: 6.49,   lng: 3.36   },
  "eric moore lagos":                     { lat: 6.49,   lng: 3.35   },

  // ── Surulere / Yaba ─────────────────────────────────────────────────────────
  "surulere lagos":                       { lat: 6.4969, lng: 3.3481 },
  "yaba lagos":                           { lat: 6.5095, lng: 3.3711 },
  "ojuelegba lagos":                      { lat: 6.5033, lng: 3.3567 },
  "sabo yaba lagos":                      { lat: 6.5089, lng: 3.3683 },
  "akoka lagos":                          { lat: 6.5194, lng: 3.3789 },

  // ── Mainland North ──────────────────────────────────────────────────────────
  "gbagada lagos":                        { lat: 6.55,   lng: 3.3833 },
  "oworonshoki lagos":                    { lat: 6.5667, lng: 3.3833 },
  "bariga lagos":                         { lat: 6.5333, lng: 3.3833 },
  "shomolu lagos":                        { lat: 6.55,   lng: 3.3833 },
  "palmgroove lagos":                     { lat: 6.5667, lng: 3.3667 },
  "anthony lagos":                        { lat: 6.5667, lng: 3.3667 },
  "onipanu lagos":                        { lat: 6.55,   lng: 3.3667 },
  "mushin lagos":                         { lat: 6.5225, lng: 3.3509 },

  // ── Lagos Mainland (general) ────────────────────────────────────────────────
  "lagos mainland lagos":                 { lat: 6.5167, lng: 3.3667 },

  // ── Oshodi / Isolo ──────────────────────────────────────────────────────────
  "oshodi lagos":                         { lat: 6.5561, lng: 3.35   },
  "isolo lagos":                          { lat: 6.5167, lng: 3.3667 },
  "ejigbo lagos":                         { lat: 6.52,   lng: 3.32   },
  "ikotun lagos":                         { lat: 6.5,    lng: 3.2833 },
  "igando lagos":                         { lat: 6.5,    lng: 3.2667 },

  // ── Ikeja / GRA ─────────────────────────────────────────────────────────────
  "ikeja lagos":                          { lat: 6.5958, lng: 3.3358 },
  "allen avenue lagos":                   { lat: 6.5833, lng: 3.3444 },
  "opebi lagos":                          { lat: 6.5872, lng: 3.3503 },
  "agidingbi lagos":                      { lat: 6.5967, lng: 3.3436 },
  "oregun lagos":                         { lat: 6.5978, lng: 3.3622 },
  "computer village lagos":               { lat: 6.5958, lng: 3.3358 },
  "maryland lagos":                       { lat: 6.5667, lng: 3.35   },
  "ojota lagos":                          { lat: 6.5833, lng: 3.3833 },
  "ketu lagos":                           { lat: 6.5833, lng: 3.4    },
  "ikorodu road lagos":                   { lat: 6.55,   lng: 3.3833 },
  "alausa lagos":                         { lat: 6.5978, lng: 3.3489 },

  // ── Ojodu / Berger ──────────────────────────────────────────────────────────
  "ojodu lagos":                          { lat: 6.6333, lng: 3.35   },
  "berger lagos":                         { lat: 6.65,   lng: 3.3667 },
  "lagos ibadan expressway lagos":        { lat: 6.65,   lng: 3.3833 },
  "ojodu berger lagos":                   { lat: 6.6333, lng: 3.35   },

  // ── Agege / Dopemu ──────────────────────────────────────────────────────────
  "agege lagos":                          { lat: 6.6167, lng: 3.3167 },
  "dopemu lagos":                         { lat: 6.58,   lng: 3.32   },
  "ogba lagos":                           { lat: 6.5833, lng: 3.3667 },
  "ifako ijaiye lagos":                   { lat: 6.63,   lng: 3.32   },

  // ── Alimosho / Festac ───────────────────────────────────────────────────────
  "festac town lagos":                    { lat: 6.4667, lng: 3.2833 },
  "festac lagos":                         { lat: 6.4667, lng: 3.2833 },
  "akowonjo lagos":                       { lat: 6.5333, lng: 3.2833 },
  "egbeda lagos":                         { lat: 6.5483, lng: 3.2753 },
  "idimu lagos":                          { lat: 6.5333, lng: 3.2500 },
  "ipaja lagos":                          { lat: 6.5847, lng: 3.2433 },
  "iyana ipaja lagos":                    { lat: 6.5973, lng: 3.2553 },
  "abule egba lagos":                     { lat: 6.6167, lng: 3.2667 },
  "agbado lagos":                         { lat: 6.68,   lng: 3.2667 },
  "satellite town lagos":                 { lat: 6.4333, lng: 3.3    },

  // ── Mile 2 / Ojo ────────────────────────────────────────────────────────────
  "mile 2 lagos":                         { lat: 6.4833, lng: 3.3167 },
  "ojo lagos":                            { lat: 6.4167, lng: 3.2167 },

  // ── Ikorodu ─────────────────────────────────────────────────────────────────
  "ikorodu lagos":                        { lat: 6.6194, lng: 3.5106 },
  "mile 12 lagos":                        { lat: 6.6,    lng: 3.3833 },

  // ── Outskirts ───────────────────────────────────────────────────────────────
  "badagry lagos":                        { lat: 6.4167, lng: 2.8833 },
  "epe lagos":                            { lat: 6.5833, lng: 3.9833 },
  "magodo lagos":                         { lat: 6.6,    lng: 3.3833 },
};
