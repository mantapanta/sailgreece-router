"""Nachrechnung der Distanztabelle aus Deep-Research Lauf 1 (Saronisch/Argolis).

Die Großkreisdistanz ist die untere Schranke jeder Seestrecke. Eine gemeldete
Distanz darunter ist geometrisch unmöglich, ein Faktor deutlich über 1.45 ist für
dieses Revier verdächtig.
"""

import math

# Koordinaten aus dem Bericht; bereits kuratierte Plätze mit BESTANDS-Koordinate.
P = {
    # Bestand
    "athen-alimos": (37.9103, 23.7008),
    "kea-vourkari": (37.6667, 24.3250),
    "kythnos-merichas": (37.3897, 24.3953),
    "serifos-livadi": (37.1458, 24.5217),
    "sifnos-kamares": (36.9903, 24.6603),
    "paros-parikia": (37.0853, 25.1519),
    "naxos-stadt": (37.1075, 25.3736),
    # Lauf 1
    "aegina-stadt": (37.7466, 23.4265),
    "aegina-perdika": (37.6912, 23.4528),
    "aegina-marathonas": (37.7245, 23.4452),
    "aegina-agia-marina": (37.7450, 23.5324),
    "aegina-klima": (37.6780, 23.4610),
    "poros-stadt": (37.4995, 23.4532),
    "poros-vathy-russian-bay": (37.4862, 23.4320),
    "poros-neorio": (37.4920, 23.4395),
    "poros-monastery-bay": (37.4850, 23.4780),
    "hydra-hafen": (37.3508, 23.4665),
    "hydra-mandraki": (37.3560, 23.4810),
    "hydra-molos": (37.3390, 23.4250),
    "hydra-ayios-nikolaos": (37.3090, 23.4110),
    "attika-zea": (37.9372, 23.6465),
    "attika-sounion": (37.6515, 24.0242),
    "attika-lavrion": (37.7125, 24.0560),
    "spetses-baltiza": (37.2618, 23.1650),
    "spetses-dapia": (37.2682, 23.1563),
    "spetses-zogeria": (37.2783, 23.1017),
    "dokos-skintos": (37.3320, 23.3280),
    "angistri-skala": (37.7083, 23.3605),
    "angistri-alonia": (37.6980, 23.3420),
    "salamina-palichori": (37.9620, 23.4980),
    "salamina-peristeri": (37.8910, 23.4620),
    "methana-hafen": (37.5790, 23.3910),
    "methana-vathy": (37.5780, 23.3360),
    "epidavros-palaia": (37.6375, 23.1590),
    "korfos-hafen": (37.7630, 23.1250),
    "ermioni-nord": (37.3867, 23.2500),
    "ermioni-sued": (37.3820, 23.2480),
    "ermioni-kapari": (37.3680, 23.2550),
    "porto-heli-hafen": (37.3250, 23.1480),
    "porto-heli-ververonda": (37.3380, 23.1210),
}

# Deliverable C wie geliefert ("attika-alimos" ist athen-alimos).
LEGS = [
    ("athen-alimos", "aegina-stadt", 16.5),
    ("athen-alimos", "poros-stadt", 28.5),
    ("athen-alimos", "attika-sounion", 23.5),
    ("athen-alimos", "attika-lavrion", 31.0),
    ("athen-alimos", "kea-vourkari", 38.0),
    ("athen-alimos", "kythnos-merichas", 46.0),
    ("aegina-stadt", "poros-stadt", 17.0),
    ("aegina-stadt", "epidavros-palaia", 14.0),
    ("aegina-stadt", "methana-hafen", 8.5),
    ("poros-stadt", "hydra-hafen", 12.5),
    ("poros-stadt", "kythnos-merichas", 35.0),
    ("hydra-hafen", "ermioni-nord", 11.5),
    ("hydra-hafen", "spetses-baltiza", 16.0),
    ("spetses-baltiza", "porto-heli-hafen", 9.0),
    ("epidavros-palaia", "korfos-hafen", 10.5),
    ("kea-vourkari", "kythnos-merichas", 20.0),
    ("kythnos-merichas", "serifos-livadi", 24.0),
    ("serifos-livadi", "sifnos-kamares", 12.5),
    ("sifnos-kamares", "paros-parikia", 31.0),
    ("paros-parikia", "naxos-stadt", 11.0),
    ("athen-alimos", "salamina-palichori", 11.0),
    ("athen-alimos", "angistri-skala", 19.5),
]

# Werte, die Lauf 2 für dieselbe Strecke gemeldet hat.
LAUF2 = {
    ("athen-alimos", "kea-vourkari"): 38.5,
    ("kea-vourkari", "kythnos-merichas"): 24.5,
    ("kythnos-merichas", "serifos-livadi"): 27.2,
    ("serifos-livadi", "sifnos-kamares"): 13.4,
    ("paros-parikia", "naxos-stadt"): 11.2,
}


def gc(a, b):
    la1, lo1 = map(math.radians, P[a])
    la2, lo2 = map(math.radians, P[b])
    d = 2 * math.asin(
        math.sqrt(
            math.sin((la2 - la1) / 2) ** 2
            + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
        )
    )
    return d * 180 * 60 / math.pi


print(f"{'von':24s} {'nach':24s} {'Ber.':>6s} {'Luft':>6s} {'Fkt':>5s} {'L2':>5s}  Bewertung")
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
    l2 = LAUF2.get((a, b))
    l2s = f"{l2:5.1f}" if l2 else "    -"
    if l2 and abs(l2 - rep) > 0.5:
        v += f" | weicht von Lauf 2 ab ({l2} sm)"
    print(f"{a:24s} {b:24s} {rep:6.1f} {line:6.1f} {f:5.2f} {l2s}  {v}")

print()
print("Abweichung der Bericht-Koordinaten von den kuratierten Werten:")
EXIST = {
    "aegina-stadt": (37.7469, 23.4264),
    "poros-stadt": (37.4997, 23.4547),
    "hydra-hafen": (37.3494, 23.4661),
}
for k, (la, lo) in EXIST.items():
    ra, ro = P[k]
    d = math.hypot((ra - la) * 60, (ro - lo) * 60 * math.cos(math.radians(la)))
    flag = "  <-- relevante Verschiebung" if d > 0.3 else ""
    print(f"{k:24s} {d:5.2f} sm{flag}")
