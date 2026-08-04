import math

# Koordinaten aus dem Bericht (Lauf 2) + bestehende, verifizierte Basis-Places
P = {
    "athen-alimos": (37.9103, 23.7008),
    "naxos-stadt": (37.1075, 25.3736),
    "kea-vourkari": (37.6650, 24.3100),
    "kea-korissia": (37.6583, 24.3142),
    "kythnos-merikhas": (37.3933, 24.3927),
    "kythnos-loutra": (37.4422, 24.4308),
    "kythnos-kolona": (37.4150, 24.3783),
    "kythnos-fikiada": (37.4100, 24.3750),
    "serifos-livadi": (37.1270, 24.5257),
    "sifnos-kamares": (36.9917, 24.6733),
    "sifnos-vathy": (36.9280, 24.6850),
    "sifnos-faros": (36.9383, 24.7467),
    "paros-parikia": (37.0850, 25.1500),
    "paros-naoussa": (37.1267, 25.2400),
    "paros-piso-livadi": (37.0367, 25.2600),
    "antiparos-town": (37.0400, 25.0800),
    "antiparos-agios-georgios": (36.9680, 25.0280),
    "despotiko-ormos": (36.9633, 25.0217),
    "milos-adamas": (36.7250, 24.4500),
    "milos-pollonia": (36.7633, 24.5267),
    "milos-kleftiko": (36.6633, 24.3317),
    "kimolos-psathi": (36.7850, 24.5800),
    "kimolos-aliki": (36.7767, 24.5600),
    "polyaigos-manolis": (36.7668, 24.6110),
    "polyaigos-mersini": (36.7583, 24.6283),
    "folegandros-karavostasi": (36.6133, 24.9517),
    "sikinos-alopronia": (36.6750, 25.1450),
    "ios-ormos": (36.7217, 25.2750),
    "ios-manganari": (36.6617, 25.3717),
    "syros-ermoupoli": (37.4417, 24.9450),
    "syros-finikas": (37.3917, 24.8817),
    "syros-grammata": (37.4980, 24.8911),
    "delos-rinia-miskanti": (37.4117, 25.2283),
}

# Deliverable C, wie geliefert
LEGS = [
    ("athen-alimos", "kea-vourkari", 38.5),
    ("kea-vourkari", "kythnos-loutra", 21.8),
    ("kea-vourkari", "kythnos-merikhas", 24.5),
    ("kythnos-merikhas", "serifos-livadi", 27.2),
    ("serifos-livadi", "sifnos-kamares", 13.4),
    ("sifnos-kamares", "milos-adamas", 23.6),
    ("milos-adamas", "kimolos-psathi", 13.5),
    ("kimolos-psathi", "polyaigos-manolis", 8.2),
    ("polyaigos-manolis", "folegandros-karavostasi", 18.4),
    ("folegandros-karavostasi", "sikinos-alopronia", 11.5),
    ("sikinos-alopronia", "ios-ormos", 13.8),
    ("ios-ormos", "paros-parikia", 35.8),
    ("paros-parikia", "syros-finikas", 22.4),
    ("syros-finikas", "kea-vourkari", 36.2),
    ("sifnos-vathy", "paros-parikia", 26.5),
    ("paros-parikia", "naxos-stadt", 11.2),
    ("paros-naoussa", "delos-rinia-miskanti", 14.3),
]


def gc(a, b):
    """Großkreisdistanz in Seemeilen — untere Schranke jeder Seestrecke."""
    la1, lo1 = map(math.radians, P[a])
    la2, lo2 = map(math.radians, P[b])
    d = 2 * math.asin(
        math.sqrt(
            math.sin((la2 - la1) / 2) ** 2
            + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
        )
    )
    return d * 180 * 60 / math.pi


print(f"{'von':26s} {'nach':26s} {'Bericht':>8s} {'Luftlin':>8s} {'Faktor':>7s}  Bewertung")
for a, b, rep in LEGS:
    line = gc(a, b)
    f = rep / line
    if f < 1.0:
        v = "UNMOEGLICH (unter Luftlinie)"
    elif f > 1.45:
        v = "stark ueberhoeht"
    elif f > 1.25:
        v = "verdaechtig hoch"
    else:
        v = "plausibel"
    print(f"{a:26s} {b:26s} {rep:8.1f} {line:8.1f} {f:7.2f}  {v}")

print()
print("Abweichung der Bericht-Koordinaten von den bereits kuratierten Werten:")
EXIST = {
    "kea-vourkari": (37.6667, 24.3250),
    "kea-korissia": (37.6617, 24.3147),
    "paros-parikia": (37.0853, 25.1519),
    "paros-naoussa": (37.1236, 25.2375),
    "paros-piso-livadi": (37.0106, 25.2617),
    "sifnos-kamares": (36.9903, 24.6603),
    "sifnos-vathy": (36.9264, 24.6903),
    "sifnos-faros": (36.9394, 24.7458),
    "serifos-livadi": (37.1458, 24.5217),
    "kythnos-merikhas": (37.3897, 24.3953),  # bestehende id: kythnos-merichas
    "kythnos-loutra": (37.4442, 24.4306),
    "kythnos-kolona": (37.4117, 24.3833),
}
for k, (la, lo) in EXIST.items():
    ra, ro = P[k]
    dlat = (ra - la) * 60
    dlon = (ro - lo) * 60 * math.cos(math.radians(la))
    d = math.hypot(dlat, dlon)
    flag = "  <-- relevante Verschiebung" if d > 0.3 else ""
    print(f"{k:26s} {d:5.2f} sm{flag}")
