/* ==========================================================
   FICHE DE PERSONNAGE — système de niveaux (1 à 10)

   Ce script se charge UNE SEULE FOIS, sitewide, via "Gérer les codes
   JavaScript" (position "Partout") — exactement comme boutique.js,
   bestiaire.js et monnaie-script.js. Il injecte lui-même son propre
   style (voir FICHE_CSS plus bas, même principe que monnaie-script.js)
   et va chercher tout seul, sur CHAQUE page, tous les blocs
   <div class="fiche-progression"> qu'il trouve (voir initFiche() en
   bas de fichier) pour les remplir avec les données Firebase.

   IMPORTANT (testé en direct sur le forum) : Forumactif ÉCHAPPE
   toujours le contenu des champs de profil personnalisés à
   l'affichage — même en "Zone de texte", il n'existe aucune option
   pour qu'un champ de profil interprète du HTML (le "Type
   d'affichage" ne propose que Texte / Icône / Icône + Texte). Coller
   le squelette du widget dans campo18 ne marche donc JAMAIS, quel que
   soit le champ. Du coup, pour campo18, on ne colle RIEN : le script
   construit lui-même le widget en JS directement dans le conteneur du
   champ dès qu'on est sur une page de profil (/u123...) — voir
   ficheInjecterDansProfil() plus bas. Le champ campo18 peut rester
   vide, son contenu texte n'a aucune importance.

   Pour un sujet de forum posté par le staff, en revanche, coller le
   squelette <div class="fiche-progression">...</div> (sans <link> ni
   <script>, voir fiche-contenu.html) fonctionne normalement, à
   condition que le message soit posté en mode HTML (case "Activer le
   HTML pour ce message") — le corps d'un message n'est pas échappé de
   la même façon qu'un champ de profil.

   Trois façons dont la fiche peut apparaître :
   1. Automatiquement dans campo18, sur le profil du joueur — rien à
      coller, voir plus haut.
   2. Dans le PREMIER MESSAGE d'un sujet de forum posté par le STAFF
      pour un joueur (ex. catégorie "Fiches de personnage", un sujet
      par joueur) : comme c'est le staff qui poste (donc l'auteur du
      message), on précise le joueur concerné à la main via l'attribut
      data-joueur="..." sur .fiche-progression — sinon la fiche
      s'identifierait au staff plutôt qu'au joueur. Le message doit
      quand même être posté en mode HTML (case "Activer le HTML pour
      ce message") pour que le <div> soit interprété comme un élément
      et non affiché en texte brut — mais comme il n'y a plus de
      <script>/<link> à l'intérieur, il n'y a plus rien d'exécutable à
      injecter depuis le message lui-même.
   3. Cas plus rare : sujet posté PAR LE JOUEUR LUI-MÊME (sans
      data-joueur) — la fiche est alors identifiée via l'auteur du
      premier message.
   Ne jamais laisser un membre normal poster en mode HTML (risque de
   sécurité, voir la note dans fiche-contenu.html) : même sans
   <script>/<link>, du HTML/CSS arbitraire reste un risque si n'importe
   qui peut l'activer sur ses propres messages.
   Le script détecte tout seul lequel des trois cas s'applique, voir
   ficheIdentifierPersonnage() plus bas.
   ========================================================== */

/* ------------------------------------------------------------------
   CONFIGURATION — à remplir une fois la base créée.
   Va sur https://console.firebase.google.com, crée un projet gratuit,
   ajoute une "Realtime Database" (mode test pour commencer), et colle
   ici l'URL affichée (ex: "https://mon-projet-default-rtdb.firebaseio.com").
   ------------------------------------------------------------------ */
const FICHE_FIREBASE_URL = "https://pathofdawn-fiches-default-rtdb.europe-west1.firebasedatabase.app";

/* Coût (en éclats) de CHAQUE palier, c'est-à-dire le prix pour passer
   du niveau juste en dessous à ce niveau-là (niveau 1 = gratuit, tout
   le monde commence là). */
const FICHE_COUTS_NIVEAU = {
  2: 50, 3: 100, 4: 150, 5: 200, 6: 250,
  7: 300, 8: 350, 9: 400, 10: 450
};
const FICHE_NIVEAU_MAX = 10;

/* Stats de départ (niveau 1, sans aucun équipement) et gain par niveau
   gagné. Pour l'instant ceci ne compte PAS l'équipement acheté à la
   boutique — voir la note en tête de fichier si ça évolue plus tard. */
const FICHE_PV_BASE_DEFAUT = 220;
const FICHE_DPS_BASE_DEFAUT = 110;
const FICHE_BONUS_PV_PAR_NIVEAU = 20;
const FICHE_BONUS_DPS_PAR_NIVEAU = 10;

/* ------------------------------------------------------------------
   ARCHÉTYPE, RACE & COMPÉTENCES
   ------------------------------------------------------------------
   Choix d'archétype (Guerrier/Mage) : une icône cliquable sur la
   fiche, verrouillée définitivement dès le premier clic (sauf via le
   bouton de réinitialisation, qui efface aussi les compétences, sans
   remboursement — voir plus bas). L'archétype choisi détermine quelle
   CATÉGORIE de compétence est "principale" (progression jusqu'au
   niveau 6) et laquelle est "secondaire" (plafonnée au niveau 3) :
   Guerrier -> physique en principal, pouvoir en secondaire (et
   inversement pour Mage.

   La RACE, elle, n'est PAS choisie par le joueur : c'est toi qui la
   rentres à la main dans Firebase à la création de la fiche (comme
   pvBase/dpsBase aujourd'hui). Elle ne sert qu'à limiter l'accès à
   certaines compétences "Exclusif <race>" — cette vérification a lieu
   côté Boutique des compétences (au moment d'ACQUÉRIR une compétence),
   pas ici : cette fiche ne fait qu'afficher/faire évoluer ce que le
   joueur possède déjà, elle ne revérifie pas la race à chaque niveau.

   Cette fiche ne VEND plus de compétences (niveau 0 -> 1) : ça, c'est
   le rôle du poste "Boutique des compétences", un sujet séparé (voir
   competences-boutique-contenu.html / competences-boutique-script.js).
   Ici, on n'affiche que les compétences déjà possédées, avec un
   bouton pour les faire évoluer (niveau 2 à 6, dans la limite du
   plafond ci-dessus). Ajouter une compétence au jeu plus tard = juste
   ajouter un bloc de plus dans le tableau COMPETENCES ci-dessous (et
   son pendant dans competences-boutique-script.js) : aucune autre
   logique à toucher. */
const COMPETENCE_NIVEAU_MAX = 6;
const COMPETENCE_PLAFOND_SECONDAIRE = 3;
const COMPETENCE_BONUS_DPS_PAR_NIVEAU = 10;
const COUTS_COMPETENCE = { 1: 20, 2: 50, 3: 100, 4: 150, 5: 250, 6: 350 };
const FICHE_RESET_SPECIALITE_COUT = 150;

const COMPETENCES = [
  {
    id: 'force-decuplee', nom: 'Force décuplée', categorie: 'physique',
    niveaux: [
      "Vous êtes tout juste plus fort que la moyenne, cela n'a rien d'une grande performance.",
      "Les charges pénibles pour vos semblables sont un simple détail pour vous, vous faites un excellent porteur.",
      "Vous pouvez aisément porter votre propre poids à bout de bras et les planches ne vous résistent pas.",
      "La pierre et l'acier plient sous votre force, rien ne peut arrêter vos coups.",
      "Vous pouvez aisément soulever plusieurs fois votre poids, vos coups peuvent éparpiller un adversaire.",
      "Aucun mur ne saurait arrêter votre inéluctable avancée."
    ]
  },
  {
    id: 'vitesse-decuplee', nom: 'Vitesse décuplée', categorie: 'physique',
    niveaux: [
      "Vous avez un bon jeu de jambe, mais il en faudrait plus pour vous faire remarquer.",
      "Votre rapidité impressionne et la majorité des gens sont incapables de vous suivre.",
      "Vous courez plus vite qu'un limier, la plupart de vos mouvements sont impossibles à prévoir.",
      "Même un cheval ne serait pas en mesure de vous rattraper.",
      "Vous êtes si rapide que personne ne peut parer vos coups, chaque impact résonne dans le corps de vos adversaires.",
      "Votre vitesse est telle que vous êtes capable de vous rendre invisible durant une courte période avant de frapper."
    ]
  },
  {
    id: 'escrime', nom: 'Escrime', categorie: 'physique',
    niveaux: [
      "Vous faites vos premiers pas à l'épée, et au moins, vous tenez l'arme dans le bon sens.",
      "Les premiers entraînements sont rudes, mais vous avez le coup, vos mouvements sont justes.",
      "Vous avez suffisamment de pratique pour tenir en respect un adversaire entraîné.",
      "Votre adresse est reconnue et vous êtes considéré comme un vétéran, rares sont les fous qui oseraient vous défier.",
      "Vous êtes un adversaire redoutable en combat, vos compétences vous permettent de devenir maître d'arme.",
      "L'escrime n'a plus aucun secret pour vous, votre arme est le prolongement de votre bras et votre agilité à la lame est redoutée. Vous êtes capable d'affronter plusieurs adversaires sans faillir, l'on raconte que vous avez même déjà paré un tir d'arbalète avec votre arme."
    ]
  },
  {
    id: 'archerie', nom: 'Archerie', categorie: 'physique',
    niveaux: [
      "Si vous avez compris comment tenir un arc, il reste encore à apprendre comment encocher.",
      "L'entraînement est rude, mais vous commencez à comprendre le truc, de jour en jour vous vous améliorez.",
      "La plupart de vos tirs touchent au but, vous êtes un bon archer, sans pour autant atteindre l'excellence.",
      "Il est rare que l'une de vos flèches ne touche pas sa cible, vous avez l'œil du faucon.",
      "Vous ne ratez plus aucun tir, vous avez à présent les connaissances pour transmettre votre savoir.",
      "L'art de l'arc n'a plus aucun secret pour vous, toucher votre cible est devenu aussi naturel que de respirer. Votre adresse est telle que vous êtes capable de toucher une flèche en vol pour la dévier."
    ]
  },
  {
    id: 'agilite-decuplee', nom: 'Agilité Décuplée', categorie: 'physique',
    niveaux: [
      "Vous êtes plutôt doué lorsqu'il s'agit de grimper.",
      "Vous pouvez aisément sauter au-dessus d'un obstacle ou franchir un mur de plus de 2m de haut.",
      "La plupart des obstacles ne représentent aucune difficulté pour vous.",
      "Votre agilité digne d'un félin vous permet de grimper où vous voulez et de chuter de plusieurs mètres.",
      "Vous êtes si vif que vous pouvez esquiver les coups facilement.",
      "Escalade, saut d'obstacle, chute ou encore esquive, plus rien n'a de secret pour vous. Vous êtes capable de semer n'importe qui en empruntant tout un tas de chemins possibles. Dans certaines conditions, vous êtes même susceptible de prédire les coups."
    ]
  },
  {
    id: 'sens-decuples', nom: 'Sens Décuplés', categorie: 'physique',
    niveaux: [
      "Tout fonctionne correctement chez vous, mais rien de surhumain, soyez-en sûr.",
      "Vos sens sont affûtés, la différence par rapport aux gens normaux commence à se voir.",
      "Vous êtes apte à suivre une piste à l'odeur ou au bruit à plusieurs mètres de distance (une trentaine).",
      "Votre regard remarque des détails que personne ne voit, votre odorat et votre ouïe sont sans pareil.",
      "Vous êtes un véritable limier, vos sens vous permettent de détecter quelque chose à plus de 200 mètres.",
      "Vos sens vous donnent clairement un avantage dans n'importe quelle situation. Vous pouvez suivre une piste sur plusieurs kilomètres grâce à votre odorat et votre ouïe peut entendre les battements d'aile d'une mouche en pleine fête au village, quant à votre vue, elle égale sans mal celle d'un faucon."
    ]
  },
  {
    id: 'pyromancie', nom: 'Pyromancie', categorie: 'pouvoir',
    niveaux: [
      "Si claquer des doigts vous permet de faire des flammes, vous n'illuminez pas plus qu'une bougie.",
      "Vos flammes éclairent tout aussi bien qu'un flambeau, vous pouvez enflammer du tissu ou de la toile.",
      "Vous pouvez créer des flammes dans un rayon de cinq mètres autour de vous, enflammant divers matériaux.",
      "D'un simple claquement de doigts, vous pouvez créer des geysers de flammes.",
      "La chaleur de vos flammes fait fondre l'acier et la pierre, rien ne semble pouvoir vous résister.",
      "Vous ne faites qu'un avec votre élément et pouvez devenir une flamme vivante, votre simple présence sous votre forme infernale fait s'évaporer l'eau et cloquer la peau."
    ]
  },
  {
    id: 'geomancie', nom: 'Géomancie', categorie: 'pouvoir',
    niveaux: [
      "D'un simple geste, vous pouvez faire voltiger des petits cailloux, tout juste de quoi effrayer un écureuil.",
      "Les gravillons n'ont plus de secrets pour vous, vous pouvez projeter des pierres plus volumineuses (10kg).",
      "La roche répond encore plus facilement à votre appel, les pierres que vous maniez atteignent 30kg.",
      "La terre tremble sous votre appel et fait ployer les ennemis.",
      "Votre pouvoir fend la terre et vos adversaires peuvent disparaître dans les brèches.",
      "Vous ne faites qu'un avec votre élément, votre peau se recouvre d'une couche de roche. Vous frappez avec la force de la terre et vous avez la résistance d'une montagne."
    ]
  },
  {
    id: 'runes-tonnerre', nom: 'Runes Tonnerre', categorie: 'pouvoir', raceExclusive: 'nain',
    niveaux: [
      "Vous êtes capable de graver votre propre rune sur votre arme.",
      "Plus vous vous battez, plus votre rune crépite et vos gestes deviennent précis.",
      "La rune de votre arme brille si intensément qu'elle peut parfois aveugler vos adversaires.",
      "Au combat, votre arme se pare d'éclairs qui touchent occasionnellement vos adversaires.",
      "Votre arme peut lancer des éclairs sur les cibles proches de vous.",
      "Chaque fois que votre arme touche un adversaire, un coup de tonnerre résonne et toute la puissance d'un orage s'abat sur votre ennemi."
    ]
  },
  {
    id: 'nature-elfique', nom: 'Nature Elfique', categorie: 'pouvoir', raceExclusive: 'elfe',
    niveaux: [
      "La nature répond à votre voix de princesse et les oiseaux chanteront pour vous.",
      "Votre voix porte au plus profond des bois, les branches et les feuilles s'écartent sur votre passage.",
      "D'un mot, les ronces jaillissent du sol et enserrent les jambes de vos adversaires.",
      "Les arbres se plient à votre volonté et leurs branches peuvent devenir des armes.",
      "Sous votre ordre, un simple buisson pourrait dépiauter un homme d'arme.",
      "D'un simple revers de la main, les racines jaillissent du sol et démembrent vos assaillants. Les ronces, le lierre et les branches travaillent de concert pour mettre en pièces tout ce qui se dresse sur votre chemin."
    ]
  },
  {
    id: 'image-miroir', nom: 'Image Miroir', categorie: 'pouvoir',
    niveaux: [
      "Vous pouvez projeter un double de vous à courte distance (3m), celui-ci peut uniquement voir et entendre.",
      "La distance de projection atteint les 10m.",
      "La distance de projection passe à 20m, votre double peut verbalement interagir avec autrui.",
      "La distance de projection passe à 50m, votre double peut physiquement interagir avec son environnement.",
      "Vous pouvez projeter votre double à plusieurs centaines de mètres de vous, il est aussi capable d'utiliser ses sorts.",
      "Vous pouvez projeter votre double dans n'importe quel lieu que vous avez déjà visité. Il maîtrise tout ce que vous maîtrisez et peut accomplir toutes sortes de choses à votre place. (L'utilisation d'un double met votre personnage en état de transe : il ne peut rien faire tant que la projection est active.)"
    ]
  },
  {
    id: 'magie-du-vide', nom: 'Magie du Vide', categorie: 'pouvoir',
    niveaux: [
      "Vous êtes tout juste capable de créer un orbe sombre.",
      "Vous êtes capable de créer plusieurs orbes simultanément et d'attaquer mentalement votre adversaire.",
      "Vous pouvez utiliser vos orbes pour attaquer physiquement vos adversaires.",
      "Vous êtes apte à créer diverses formes faites d'obscurité, leur utilité est aussi bien défensive qu'offensive.",
      "Vous pouvez créer des silhouettes faites d'ombre, celles-ci peuvent attaquer vos cibles, comme vous défendre.",
      "Vous ne faites plus qu'un avec le vide et devenez son avatar. Votre silhouette se drape d'un voile sombre vous rendant méconnaissable. Votre simple présence affecte toutes les sources de lumière (naturelles ou non)."
    ]
  },
  {
    id: 'magie-de-la-lumiere', nom: 'Magie de la Lumière', categorie: 'pouvoir',
    niveaux: [
      "La lumière répond faiblement à votre appel, vos mains se mettent à scintiller.",
      "Vos mains scintillent suffisamment pour chasser l'obscurité.",
      "Vous êtes apte à créer des orbes lumineux qui peuvent attaquer vos adversaires.",
      "Vous êtes capable de créer un bouclier de lumière autour de vous.",
      "Votre seule présence chasse les ténèbres, vous pouvez créer des boucliers sur vos alliés.",
      "Vous ne faites qu'un avec la lumière et devenez son avatar. Votre silhouette entière brille comme une étoile, si bien qu'il est impossible de vous regarder. Vous pouvez canaliser la lumière sous forme de rayon pour abattre vos adversaires."
    ]
  }
];

/* ------------------------------------------------------------------
   ÉQUIPEMENT — catalogue en LECTURE SEULE pour l'affichage.
   ------------------------------------------------------------------
   La Boutique (boutique-contenu.html / boutique-script.js) reste la
   seule source qui VEND ces objets — les attributs data-item-id /
   data-slot / data-bonus-stat / data-bonus-valeur y sont directement
   posés sur chaque carte. Ici, on a juste besoin de savoir, pour un
   id donné, QUOI afficher sur la fiche du joueur qui le porte : son
   nom et son bonus. Si tu ajoutes un objet dans la boutique, ajoute
   la même ligne ici (même id, même nom, même bonus) pour que la fiche
   sache l'afficher — sinon elle affichera juste l'id brut. */
const ITEMS_EQUIPEMENT = {
  'casque-cuir':        { nom: 'Casque en Cuir',        bonusStat: 'pv',  bonusValeur: 5 },
  'casque-mailles':      { nom: 'Casque en Mailles',     bonusStat: 'pv',  bonusValeur: 10 },
  'casque-plaque':       { nom: 'Casque en Plaque',      bonusStat: 'pv',  bonusValeur: 30 },
  'epaulettes-cuir':     { nom: 'Épaulières en Cuir',    bonusStat: 'pv',  bonusValeur: 5 },
  'epaulettes-mailles':  { nom: 'Épaulières en Mailles', bonusStat: 'pv',  bonusValeur: 10 },
  'epaulettes-plaque':   { nom: 'Épaulières en Plaque',  bonusStat: 'pv',  bonusValeur: 20 },
  'torse-cuir':          { nom: 'Torse en Cuir',         bonusStat: 'pv',  bonusValeur: 25 },
  'torse-maille':        { nom: 'Torse en Maille',       bonusStat: 'pv',  bonusValeur: 60 },
  'torse-plaque':        { nom: 'Torse en Plaque',       bonusStat: 'pv',  bonusValeur: 150 },
  'pantalon-cuir':       { nom: 'Pantalon en Cuir',      bonusStat: 'pv',  bonusValeur: 15 },
  'pantalon-mailles':    { nom: 'Pantalon en Mailles',   bonusStat: 'pv',  bonusValeur: 25 },
  'pantalon-plaque':     { nom: 'Pantalon en Plaque',    bonusStat: 'pv',  bonusValeur: 35 },
  'bottes-cuir':         { nom: 'Bottes en Cuir',        bonusStat: 'pv',  bonusValeur: 10 },
  'bottes-maille':       { nom: 'Bottes en Maille',      bonusStat: 'pv',  bonusValeur: 20 },
  'bottes-plaque':       { nom: 'Bottes en Plaque',      bonusStat: 'pv',  bonusValeur: 30 },
  'epee-1main':          { nom: 'Épée à une main',       bonusStat: 'dps', bonusValeur: 20 },
  'epee-2mains':         { nom: 'Épée à deux mains',     bonusStat: 'dps', bonusValeur: 30, deuxMains: true },
  'hache-1main':         { nom: 'Hache à une main',      bonusStat: 'dps', bonusValeur: 15 },
  'hache-2mains':        { nom: 'Hache à deux mains',    bonusStat: 'dps', bonusValeur: 35, deuxMains: true }
};
const FICHE_SLOTS_EQUIPEMENT = ['casque', 'epaulettes', 'torse', 'pantalon', 'bottes', 'arme1', 'arme2'];
const FICHE_NOMS_SLOTS = {
  casque: 'Casque', epaulettes: 'Épaulières', torse: 'Torse', pantalon: 'Pantalon',
  bottes: 'Bottes', arme1: 'Arme', arme2: 'Arme secondaire'
};

/* Images du badge de niveau (voir ITEMS_EQUIPEMENT plus haut pour la
   même logique côté équipement) : 10 fichiers "niveau-1.png" à
   "niveau-10.png", à héberger sur le même dépôt GitHub que le reste
   (thunder-hawk/bestiaire) via jsDelivr, comme fiche-script.js
   lui-même. Remplace juste la partie "LIEN_DIRECT_VERS_DOSSIER" une
   fois les images poussées. */
const FICHE_ICONES_BASE_URL = "https://cdn.jsdelivr.net/gh/thunder-hawk/bestiaire@main/icones-niveau";

/* Injecté nous-mêmes en JS au chargement (voir ficheInjecterStyle()
   plus bas) plutôt que via un <link> séparé — comme ça, l'endroit où
   tu colles le widget (campo18, message de sujet...) n'a besoin
   d'AUCUNE balise <link>/<script>, juste le <div class="fiche-progression">.
   Même famille visuelle bois/or que la boutique et la monnaie. */
const FICHE_CSS = `
/* ==========================================================
   FICHE DE PERSONNAGE — pathofdawn.forumactif.com
   Système de niveaux (1 à 10) intégré dans le champ personnalisé
   "campo18" (Stats) du profil. Même famille visuelle que la
   boutique (bois/or/rouge sombre) pour rester cohérent.
   ========================================================== */
:root {
  --fp-bg-bois: #1c140f;
  --fp-bg-bois-clair: #241a13;
  --fp-bg-etal: #2a1f18;
  --fp-text-main: #d3c4a9;
  --fp-text-muted: #8c7d6b;
  --fp-accent-gold: #c2a057;
  --fp-accent-red: #8f2d2d;
  --fp-accent-red-clair: #b23c3c;
  --fp-border-color: #3d2b1f;
  --fp-stat-pv: #8aab74;
  --fp-stat-dps: #b1524f;
  --fp-stat-pouvoir: #7a93c2;
  --fp-font-title: 'Cinzel', serif;
  --fp-font-body: 'Crimson Text', serif;
}

.fiche-progression,
.fiche-progression * {
  box-sizing: border-box !important;
  margin: 0;
  padding: 0;
  float: none !important;
}
.fiche-progression br { display: none !important; }

.fiche-progression {
  display: block !important;
  width: 100% !important;
  max-width: 680px !important;
  margin: 20px auto !important;
  background: linear-gradient(180deg, var(--fp-bg-bois) 0%, #150f0b 100%);
  color: var(--fp-text-main);
  font-family: var(--fp-font-body);
  line-height: 1.5;
  font-size: 1rem;
  padding: 20px;
  border: 1px solid var(--fp-border-color);
  border-radius: 4px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.9), inset 0 0 60px rgba(0,0,0,0.6);
  position: relative;
}

/* ---------- En-tête : badge de niveau + solde ---------- */
.fp-header {
  display: flex !important;
  align-items: center;
  gap: 16px;
  padding-bottom: 16px;
  margin-bottom: 16px !important;
  border-bottom: 1px solid var(--fp-border-color);
}

.fp-niveau-info { flex: 1 1 auto; min-width: 0; }
.fp-niveau-label {
  font-family: var(--fp-font-title);
  color: var(--fp-accent-gold);
  font-size: 1.15rem;
  letter-spacing: 0.5px;
}
.fp-solde {
  font-size: 0.9rem;
  color: var(--fp-text-muted);
  margin-top: 4px !important;
}
.fp-solde-val { color: var(--fp-accent-gold); font-weight: 600; }
.fp-archetype-actuelle,
.fp-race-actuelle { color: var(--fp-accent-gold); font-weight: 600; }

/* ---------- Badge de niveau ----------
   Une illustration de bouclier par niveau (1 à 10, voir
   FICHE_ICONES_BASE_URL), avec une lueur qui s'intensifie autour au
   fur et à mesure (pilotée par des variables CSS selon data-niveau),
   plutôt qu'un simple cercle généré en CSS. */
.fp-badge {
  --badge-lueur: rgba(0,0,0,0);
  --badge-lueur-taille: 0px;
  flex: 0 0 64px;
  width: 64px;
  height: 64px;
  display: flex !important;
  align-items: center;
  justify-content: center;
  position: relative;
}
.fp-badge-img {
  height: 100%;
  width: auto;
  max-width: 100%;
  display: block !important;
  object-fit: contain;
  filter: drop-shadow(0 0 var(--badge-lueur-taille) var(--badge-lueur));
  transition: filter 0.4s ease;
}

/* Paliers visuels : l'illustration elle-même fait déjà le plus gros du
   travail (bois brut -> blindage doré), on ajoute juste une lueur qui
   grandit avec le niveau, jusqu'à une pulsation douce au niveau 10. */
.fp-badge[data-niveau="1"] { --badge-lueur: rgba(0,0,0,0); --badge-lueur-taille: 0px; }
.fp-badge[data-niveau="2"] { --badge-lueur: rgba(194,160,87,0.25); --badge-lueur-taille: 4px; }
.fp-badge[data-niveau="3"] { --badge-lueur: rgba(194,160,87,0.35); --badge-lueur-taille: 6px; }
.fp-badge[data-niveau="4"] { --badge-lueur: rgba(200,200,200,0.35); --badge-lueur-taille: 7px; }
.fp-badge[data-niveau="5"] { --badge-lueur: rgba(210,210,210,0.4); --badge-lueur-taille: 9px; }
.fp-badge[data-niveau="6"] { --badge-lueur: rgba(194,160,87,0.5); --badge-lueur-taille: 10px; }
.fp-badge[data-niveau="7"] { --badge-lueur: rgba(194,160,87,0.6); --badge-lueur-taille: 13px; }
.fp-badge[data-niveau="8"] { --badge-lueur: rgba(212,180,101,0.7); --badge-lueur-taille: 16px; }
.fp-badge[data-niveau="9"] { --badge-lueur: rgba(178,60,60,0.6); --badge-lueur-taille: 18px; }
.fp-badge[data-niveau="10"] { --badge-lueur: rgba(178,60,60,0.8); --badge-lueur-taille: 22px; }
.fp-badge[data-niveau="10"] .fp-badge-img { animation: fpBadgePulse 2.4s ease-in-out infinite; }
@keyframes fpBadgePulse {
  0%, 100% { filter: drop-shadow(0 0 18px rgba(178,60,60,0.6)); }
  50%      { filter: drop-shadow(0 0 30px rgba(212,180,101,0.9)); }
}

/* Petit éclat au moment même où un niveau vient d'être gagné. */
.fp-badge-img.fp-levelup {
  animation: fpBadgeFlash 0.9s ease-out;
}
@keyframes fpBadgeFlash {
  0%   { filter: drop-shadow(0 0 0 rgba(255,244,214,0)) brightness(1); transform: scale(1); }
  30%  { filter: drop-shadow(0 0 16px rgba(255,244,214,0.95)) brightness(1.35); transform: scale(1.1); }
  100% { filter: drop-shadow(0 0 var(--badge-lueur-taille) var(--badge-lueur)) brightness(1); transform: scale(1); }
}

/* ---------- Statistiques (base + bonus de niveau) ---------- */
.fp-stats {
  display: flex !important;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px !important;
}
.fp-stat {
  flex: 1 1 220px;
  background: var(--fp-bg-etal);
  border: 1px solid var(--fp-border-color);
  border-radius: 4px;
  padding: 10px 14px;
}
.fp-stat-label {
  display: block !important;
  font-family: var(--fp-font-title);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--fp-text-muted);
  margin-bottom: 4px !important;
}
.fp-stat[data-type="pv"] .fp-stat-label { color: var(--fp-stat-pv); }
.fp-stat[data-type="dps"] .fp-stat-label { color: var(--fp-stat-dps); }
.fp-stat-total {
  font-family: var(--fp-font-title);
  font-size: 1.4rem;
  color: var(--fp-text-main);
}
.fp-stat-detail {
  display: block !important;
  font-size: 0.78rem;
  color: var(--fp-text-muted);
  margin-top: 4px !important;
}
.fp-pv-base,
.fp-dps-base { color: var(--fp-text-main); font-weight: 600; }
.fp-bonus,
.fp-bonus-competences,
.fp-bonus-equipement { color: var(--fp-accent-gold); font-weight: 600; }

/* ---------- Équipement porté (affichage seul, ça s'équipe à la Boutique) ---------- */
.fp-equipement { margin-bottom: 16px !important; }
.fp-equip-liste { display: flex !important; flex-direction: column; gap: 6px; }
.fp-equip-item {
  display: flex !important;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  background: var(--fp-bg-etal);
  border: 1px solid var(--fp-border-color);
  border-radius: 4px;
  padding: 7px 12px;
  font-size: 0.85rem;
}
.fp-equip-slot { color: var(--fp-text-muted); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.5px; }
.fp-equip-nom { color: var(--fp-text-main); }
.fp-equip-bonus { font-weight: 600; }
.fp-equip-bonus.stat-pv { color: var(--fp-stat-pv); }
.fp-equip-bonus.stat-dps { color: var(--fp-stat-dps); }
.fp-equip-vide { font-size: 0.85rem; font-style: italic; color: var(--fp-text-muted); }

/* ---------- Titres de section ---------- */
.fp-section-titre {
  font-family: var(--fp-font-title);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--fp-accent-gold);
  margin: 20px 0 10px !important;
  padding-top: 16px;
  border-top: 1px solid var(--fp-border-color);
}

/* ---------- Archétype ---------- */
.fp-archetypes { display: flex !important; gap: 16px; margin-bottom: 10px !important; flex-wrap: wrap; }
.fp-archetype-icon {
  display: flex !important;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 96px;
  padding: 12px 8px;
  background: var(--fp-bg-etal);
  border: 1px solid var(--fp-border-color);
  border-radius: 6px;
  color: var(--fp-text-muted);
  cursor: pointer;
  transition: all 0.25s ease;
}
.fp-archetype-icon svg { width: 30px; height: 30px; display: block; }
.fp-archetype-icon .fp-archetype-nom {
  font-family: var(--fp-font-title);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.fp-archetype-icon:hover:not(.fp-non-choisi) { border-color: var(--fp-accent-red-clair); color: #f0e6d2; }
.fp-archetype-icon.fp-choisi {
  color: var(--fp-accent-gold);
  border-color: var(--fp-accent-gold);
  box-shadow: 0 0 12px rgba(194,160,87,0.35), inset 0 0 10px rgba(194,160,87,0.1);
  cursor: default;
}
.fp-archetype-icon.fp-non-choisi { opacity: 0.35; cursor: not-allowed; }
.fp-archetype-icon .fp-archetype-cadenas { font-size: 0.65rem; color: var(--fp-text-muted); margin-top: -2px; }

/* ---------- Compétences ---------- */
.fp-competences { display: flex !important; flex-direction: column; gap: 12px; }
.fp-competences-vide { font-size: 0.85rem; font-style: italic; color: var(--fp-text-muted); }
.fp-competence {
  background: var(--fp-bg-etal);
  border: 1px solid var(--fp-border-color);
  border-radius: 4px;
  padding: 12px 14px;
}
.fp-competence-header {
  display: flex !important;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px !important;
}
.fp-competence-nom { font-family: var(--fp-font-title); color: var(--fp-accent-gold); font-size: 1rem; }
.fp-competence-categorie {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 7px;
  border-radius: 3px;
  border: 1px solid;
}
.fp-competence-categorie[data-categorie="physique"] { color: var(--fp-stat-dps); border-color: var(--fp-stat-dps); }
.fp-competence-categorie[data-categorie="pouvoir"] { color: var(--fp-stat-pouvoir); border-color: var(--fp-stat-pouvoir); }
.fp-competence-pips { display: flex !important; gap: 4px; margin: 6px 0 !important; }
.fp-pip { width: 14px; height: 14px; border-radius: 2px; border: 1px solid var(--fp-border-color); background: var(--fp-bg-bois-clair); }
.fp-pip-acquis { background: var(--fp-accent-gold); border-color: var(--fp-accent-gold); }
.fp-pip-verrouille { background: repeating-linear-gradient(45deg, #241a13, #241a13 2px, #150f0b 2px, #150f0b 4px); opacity: 0.6; }
.fp-competence-lore { font-size: 0.8rem; font-style: italic; color: var(--fp-text-main); margin-bottom: 8px !important; line-height: 1.4; }
.fp-competence-actions { display: flex !important; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 4px !important; }
.fp-competence-manque { font-size: 0.72rem; color: var(--fp-accent-red-clair); }
.fp-competence-plafond { font-size: 0.72rem; color: var(--fp-text-muted); }

/* ---------- Réinitialisation de la spécialité ---------- */
.fp-reset-bloc { margin-top: 20px !important; padding-top: 14px; border-top: 1px solid var(--fp-border-color); }
.fp-reset-texte { font-size: 0.78rem; color: var(--fp-text-muted); margin-bottom: 8px !important; line-height: 1.4; }

/* ---------- Boutons ---------- */
.fp-actions {
  display: flex !important;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px !important;
}
.fp-btn {
  font-family: var(--fp-font-title);
  font-size: 0.8rem;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  padding: 9px 16px;
  border-radius: 3px;
  border: 1px solid var(--fp-border-color);
  background: var(--fp-bg-etal);
  color: var(--fp-text-main);
  cursor: pointer;
  transition: all 0.2s ease;
}
.fp-btn:hover:not(:disabled) {
  border-color: var(--fp-accent-red-clair);
  color: #f0e6d2;
}
.fp-btn-acheter {
  background: var(--fp-accent-red);
  border-color: var(--fp-accent-red-clair);
  color: #f0e6d2;
}
.fp-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.fp-manque {
  font-size: 0.78rem;
  color: var(--fp-accent-red-clair);
  margin-bottom: 8px !important;
  min-height: 1.1em;
}

.fp-message {
  font-size: 0.85rem;
  font-style: italic;
  color: var(--fp-text-muted);
  min-height: 1.2em;
}
.fp-message.fp-ok { color: var(--fp-stat-pv); }
.fp-message.fp-erreur { color: var(--fp-accent-red-clair); }

.fp-lecture-seule {
  font-size: 0.85rem;
  color: var(--fp-text-muted);
  font-style: italic;
}
`;

function ficheInjecterStyle() {
  if (document.getElementById('fiche-style-injecte')) return;
  const style = document.createElement('style');
  style.id = 'fiche-style-injecte';
  style.textContent = FICHE_CSS;
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------
   Petits utilitaires
   ------------------------------------------------------------------ */

/* Détermine à QUEL PERSONNAGE appartient cette fiche, et son pseudo
   quand on peut l'avoir tout de suite — TROIS façons possibles, dans
   cet ordre de priorité :
   1. Un attribut "data-joueur" posé à la main sur le bloc
      .fiche-progression (voir fiche-contenu.html) : le staff y colle
      l'id ou l'URL du profil du joueur concerné au moment de créer
      son sujet. C'est la méthode à utiliser quand c'est le STAFF qui
      poste le sujet (donc qui en est l'auteur) — sans ça, la fiche
      s'identifierait au staff plutôt qu'au joueur.
   2. Sur une page de profil (".../u42"), comme au départ : l'id vient
      de l'URL, le pseudo du titre de la page ("Voir un profil - X").
   3. Sur un sujet de forum, à défaut des deux précédents : l'AUTEUR DU
      PREMIER MESSAGE du sujet — utile seulement si c'est vraiment le
      joueur lui-même qui a posté (rare si c'est le staff qui gère la
      création des sujets, voir la note de sécurité dans
      fiche-contenu.html à ce sujet). */
function ficheIdentifierPersonnage(racine) {
  const attribut = (racine.getAttribute('data-joueur') || '').trim();
  if (attribut) {
    const mUrl = attribut.match(/\/u(\d+)(?:[/?#]|$)/);
    const mNombre = attribut.match(/^(\d+)$/);
    const id = mUrl ? mUrl[1] : (mNombre ? mNombre[1] : null);
    if (id) return { id, pseudo: null }; // pseudo récupéré en tâche de fond, voir plus bas
  }

  const mUrl = location.pathname.match(/\/u(\d+)(?:[/?#]|$)/);
  if (mUrl) {
    const mTitre = document.title.match(/^Voir un profil - (.+)$/);
    return { id: mUrl[1], pseudo: mTitre ? mTitre[1].trim() : null };
  }

  const premierMessage = document.querySelector('.post');
  const lienAuteur = premierMessage
    ? premierMessage.querySelector('.post-tps-username a[href*="/u"]')
    : null;
  if (lienAuteur) {
    const m = (lienAuteur.getAttribute('href') || '').match(/\/u(\d+)(?:[/?#]|$)/);
    if (m) return { id: m[1], pseudo: lienAuteur.textContent.trim() };
  }

  return { id: null, pseudo: null };
}

/* Quand l'id vient de l'attribut data-joueur, on n'a pas le pseudo
   tout de suite (pas d'élément du DOM sous la main pour le lire) —
   on va le chercher en tâche de fond en récupérant la page de profil
   du joueur concerné, juste pour l'affichage lisible dans Firebase
   (aucun impact sur le fonctionnement si ça échoue). */
async function fichePseudoDepuisProfil(userId) {
  try {
    const res = await fetch('/u' + userId);
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<title>\s*Voir un profil - (.+?)\s*<\/title>/);
    return m ? m[1].trim() : null;
  } catch (e) {
    return null;
  }
}

/* L'id du joueur actuellement CONNECTÉ (celui qui regarde la page,
   pas forcément le propriétaire de la fiche) : repéré via le lien
   "Voir mon profil" du menu du forum, présent sur toutes les pages —
   même technique que monnaie-script.js. */
function ficheMonIdConnecte() {
  const liens = document.querySelectorAll('a[href*="/u"]');
  for (const a of liens) {
    if (a.textContent.trim().toLowerCase() === 'voir mon profil') {
      const m = (a.getAttribute('href') || '').match(/\/u(\d+)(?:[/?#]|$)/);
      if (m) return m[1];
    }
  }
  return null;
}

/* Vrai seulement si la personne qui regarde la page est bien la
   propriétaire de CETTE fiche (celle d'id "userId") :
   - Sur une page de profil, Forumactif n'affiche le lien "Éditer mon
     profil" (mode=editprofile) que sur son propre profil.
   - Sur un sujet de forum, ce lien n'existe pas : on compare plutôt
     l'id du joueur connecté avec celui du personnage de la fiche. */
function ficheEstProprietaire(userId) {
  if (document.querySelector('a[href*="mode=editprofile"]')) return true;
  const monId = ficheMonIdConnecte();
  return !!(monId && userId && monId === userId);
}

async function ficheChargerDonnees(userId) {
  if (!FICHE_FIREBASE_URL || FICHE_FIREBASE_URL.indexOf('COLLE-ICI') !== -1) {
    throw new Error('FIREBASE_NON_CONFIGURE');
  }
  const res = await fetch(FICHE_FIREBASE_URL + '/personnages/' + userId + '.json');
  if (!res.ok) throw new Error('Erreur réseau (' + res.status + ')');
  const data = await res.json();
  return {
    niveau: (data && data.niveau) || 1,
    pvBase: (data && typeof data.pvBase === 'number') ? data.pvBase : FICHE_PV_BASE_DEFAUT,
    dpsBase: (data && typeof data.dpsBase === 'number') ? data.dpsBase : FICHE_DPS_BASE_DEFAUT,
    /* "solde" est désormais un vrai porte-monnaie géré par nous (voir
       monnaie-script.js, qui l'alimente à chaque message posté dans
       une zone de RP) : on le dépense directement à chaque achat de
       niveau, ce n'est plus un calcul "total gagné - coût cumulé". */
    solde: (data && typeof data.solde === 'number') ? data.solde : 0,
    pseudo: (data && typeof data.pseudo === 'string') ? data.pseudo : null,
    /* Race : attribuée à la main par le staff dans Firebase, jamais
       modifiée ici — juste lue pour l'affichage. */
    race: (data && typeof data.race === 'string') ? data.race : '',
    /* Archétype : 'guerrier' | 'mage' | null (jamais choisi). */
    archetype: (data && (data.archetype === 'guerrier' || data.archetype === 'mage')) ? data.archetype : null,
    /* { [competenceId]: niveau (1 à 6) } — vide si aucune compétence. */
    competences: (data && data.competences && typeof data.competences === 'object') ? data.competences : {},
    /* { casque, epaulettes, torse, pantalon, bottes, arme1, arme2 } -> id d'objet | absent. */
    equipement: (data && data.equipement && typeof data.equipement === 'object') ? data.equipement : {}
  };
}

async function ficheSauvegarder(userId, partiel) {
  const res = await fetch(FICHE_FIREBASE_URL + '/personnages/' + userId + '.json', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partiel)
  });
  if (!res.ok) throw new Error('Erreur réseau (' + res.status + ')');
}

/* ------------------------------------------------------------------
   Mise en place d'une instance de fiche
   ------------------------------------------------------------------ */
function initFicheInstance(racine) {
  const identification = ficheIdentifierPersonnage(racine);
  const userId = identification.id;
  const proprietaire = ficheEstProprietaire(userId);

  const badge = racine.querySelector('.fp-badge');
  const badgeImg = racine.querySelector('.fp-badge-img');
  const niveauNum = racine.querySelector('.fp-niveau-num');
  const soldeVal = racine.querySelector('.fp-solde-val');
  const archetypeActuelEl = racine.querySelector('.fp-archetype-actuelle');
  const ligneRace = racine.querySelector('.fp-ligne-race');
  const raceActuelleEl = racine.querySelector('.fp-race-actuelle');
  const pvTotalEl = racine.querySelector('[data-type="pv"] .fp-stat-total');
  const dpsTotalEl = racine.querySelector('[data-type="dps"] .fp-stat-total');
  const pvBonusEl = racine.querySelector('[data-type="pv"] .fp-bonus');
  const dpsBonusEl = racine.querySelector('[data-type="dps"] .fp-bonus');
  const bonusCompetencesEl = racine.querySelector('.fp-bonus-competences');
  const bonusEquipementPvEl = racine.querySelector('.fp-bonus-equipement-pv');
  const bonusEquipementDpsEl = racine.querySelector('.fp-bonus-equipement-dps');
  const pvBaseEl = racine.querySelector('.fp-pv-base');
  const dpsBaseEl = racine.querySelector('.fp-dps-base');
  const equipListeEl = racine.querySelector('.fp-equip-liste');
  const btnAcheter = racine.querySelector('.fp-btn-acheter');
  const coutSuivantEl = racine.querySelector('.fp-cout-suivant');
  const labelNormal = racine.querySelector('.fp-label-normal');
  const labelMax = racine.querySelector('.fp-label-max');
  const manqueEl = racine.querySelector('.fp-manque');
  const messageEl = racine.querySelector('.fp-message');
  const archetypeIcones = Array.from(racine.querySelectorAll('.fp-archetype-icon'));
  const conteneurCompetences = racine.querySelector('.fp-competences');
  const btnReset = racine.querySelector('.fp-btn-reset');
  const manqueResetEl = racine.querySelector('.fp-manque-reset');
  const zonesEdition = racine.querySelectorAll('.fp-edition');

  if (!userId) {
    if (messageEl) messageEl.textContent = "Impossible de déterminer le personnage (ni page de profil, ni sujet avec un premier message identifiable).";
    return;
  }

  /* Le filet de sécurité tout en bas de ce fichier (DOMContentLoaded +
     'load' + deux setTimeout) peut rappeler initFicheInstance()
     plusieurs fois sur le MÊME élément .fiche-progression déjà
     initialisé. Rafraîchir l'affichage à chaque rappel est voulu (ça
     garde les chiffres à jour), mais reposer une deuxième fois les
     écouteurs de clic sur les boutons d'action (niveau, archétype,
     réinitialisation) ne l'est PAS : deux écouteurs indépendants sur
     le même bouton se déclenchent tous les deux sur un seul clic, ce
     qui dépenserait les éclats du joueur plusieurs fois pour un seul
     achat. Les trois blocs d'écouteurs plus bas sont donc protégés par
     ce garde-fou, posé une seule fois par élément. */
  const ecouteursDejaPoses = racine.dataset.ficheEcouteursPoses === '1';
  racine.dataset.ficheEcouteursPoses = '1';

  // Un visiteur (pas le propriétaire) ne voit pas les boutons d'action
  // (niveau, archétype, réinitialisation) : juste le résultat, en
  // lecture seule. Les compétences déjà possédées restent visibles
  // (sans bouton "faire évoluer"), voir rafraichirCompetences().
  if (!proprietaire) zonesEdition.forEach((el) => el.remove());

  let etat = { niveau: 1, pvBase: 0, dpsBase: 0, solde: 0, archetype: null, race: '', competences: {}, equipement: {} };

  function afficherMessage(texte, type) {
    if (!messageEl) return;
    messageEl.textContent = texte;
    messageEl.className = 'fp-message' + (type ? ' fp-' + type : '');
  }

  // Catégorie "principale" pour l'archétype actuel (l'autre catégorie
  // est "secondaire", plafonnée) -> niveau max autorisé pour une
  // catégorie de compétence donnée. Sans archétype choisi, rien n'est
  // autorisé (mais ça ne devrait jamais arriver ici : on ne peut
  // posséder une compétence qu'après avoir choisi un archétype, la
  // Boutique des compétences l'exige déjà à l'acquisition).
  function maxNiveauAutorise(categorie) {
    if (!etat.archetype) return 0;
    const principale = etat.archetype === 'guerrier' ? 'physique' : 'pouvoir';
    return categorie === principale ? COMPETENCE_NIVEAU_MAX : COMPETENCE_PLAFOND_SECONDAIRE;
  }

  function totalBonusCompetencesDps() {
    return COMPETENCES.reduce((total, comp) => {
      const niveau = (etat.competences && etat.competences[comp.id]) || 0;
      return total + niveau * COMPETENCE_BONUS_DPS_PAR_NIVEAU;
    }, 0);
  }

  // Additionne les bonus de TOUT l'équipement porté. Une arme à deux
  // mains occupe arme1 ET arme2 avec le MÊME id : on ne compte alors
  // son bonus qu'une seule fois (sinon le dps serait doublé).
  function totalBonusEquipement() {
    let bonusPv = 0, bonusDps = 0;
    const equip = etat.equipement || {};
    let armeDeuxMainsDejaCompte = null;
    FICHE_SLOTS_EQUIPEMENT.forEach((slot) => {
      const itemId = equip[slot];
      if (!itemId) return;
      const item = ITEMS_EQUIPEMENT[itemId];
      if (!item) return;
      if (item.deuxMains) {
        if (armeDeuxMainsDejaCompte === itemId) return;
        armeDeuxMainsDejaCompte = itemId;
      }
      if (item.bonusStat === 'pv') bonusPv += item.bonusValeur;
      else if (item.bonusStat === 'dps') bonusDps += item.bonusValeur;
    });
    return { pv: bonusPv, dps: bonusDps };
  }

  function renduPips(niveauActuel, maxAutorise) {
    let html = '';
    for (let i = 1; i <= COMPETENCE_NIVEAU_MAX; i++) {
      let cls = 'fp-pip';
      if (i <= niveauActuel) cls += ' fp-pip-acquis';
      else if (i > maxAutorise) cls += ' fp-pip-verrouille';
      html += '<span class="' + cls + '" title="Niveau ' + i + '"></span>';
    }
    return html;
  }

  function rafraichirEquipement() {
    if (!equipListeEl) return;
    const equip = etat.equipement || {};
    const lignes = [];
    let armeDeuxMainsDejaAffichee = null;
    FICHE_SLOTS_EQUIPEMENT.forEach((slot) => {
      const itemId = equip[slot];
      if (!itemId) return;
      const item = ITEMS_EQUIPEMENT[itemId];
      if (item && item.deuxMains) {
        if (armeDeuxMainsDejaAffichee === itemId) return;
        armeDeuxMainsDejaAffichee = itemId;
      }
      const nom = item ? item.nom : itemId;
      const suffixe = (item && item.deuxMains) ? ' (à deux mains)' : '';
      const statClasse = item ? item.bonusStat : '';
      const bonusTexte = item ? ('+' + item.bonusValeur + ' ' + item.bonusStat.toUpperCase()) : '';
      lignes.push(
        '<div class="fp-equip-item">' +
          '<span><span class="fp-equip-slot">' + (FICHE_NOMS_SLOTS[slot] || slot) + '</span><br>' +
          '<span class="fp-equip-nom">' + nom + suffixe + '</span></span>' +
          '<span class="fp-equip-bonus stat-' + statClasse + '">' + bonusTexte + '</span>' +
        '</div>'
      );
    });
    equipListeEl.innerHTML = lignes.length
      ? lignes.join('')
      : '<p class="fp-equip-vide">Aucun équipement pour l\'instant — direction le Comptoir du Voyageur.</p>';
  }

  function rafraichirArchetype() {
    archetypeIcones.forEach((icone) => {
      const estCelui = etat.archetype === icone.dataset.archetype;
      icone.classList.toggle('fp-choisi', estCelui);
      icone.classList.toggle('fp-non-choisi', !!etat.archetype && !estCelui);
      const cadenas = icone.querySelector('.fp-archetype-cadenas');
      if (cadenas) cadenas.hidden = !estCelui;
      icone.disabled = !!etat.archetype;
    });
    if (archetypeActuelEl) {
      archetypeActuelEl.textContent = etat.archetype ? (etat.archetype === 'guerrier' ? 'Guerrier' : 'Mage') : 'Aucune';
    }
    if (ligneRace && raceActuelleEl) {
      if (etat.race) {
        raceActuelleEl.textContent = etat.race;
        ligneRace.hidden = false;
      } else {
        ligneRace.hidden = true;
      }
    }
    if (btnReset) {
      const soldeDisponible = etat.solde || 0;
      if (!etat.archetype) {
        btnReset.disabled = true;
        if (manqueResetEl) manqueResetEl.textContent = 'Aucune spécialité choisie, rien à réinitialiser.';
      } else {
        const assez = soldeDisponible >= FICHE_RESET_SPECIALITE_COUT;
        btnReset.disabled = !assez;
        if (manqueResetEl) {
          manqueResetEl.textContent = assez ? '' : ('Il te manque ' + (FICHE_RESET_SPECIALITE_COUT - soldeDisponible) + ' éclats.');
        }
      }
    }
  }

  // Cette fiche ne VEND plus de compétences (voir la note en tête de
  // fichier) : seules celles déjà possédées sont affichées, avec la
  // possibilité de les faire évoluer si on est le propriétaire.
  function rafraichirCompetences() {
    if (!conteneurCompetences) return;
    const possedees = COMPETENCES.filter((comp) => ((etat.competences && etat.competences[comp.id]) || 0) > 0);

    if (possedees.length === 0) {
      conteneurCompetences.innerHTML = '<p class="fp-competences-vide">' +
        (proprietaire
          ? 'Aucune compétence acquise pour l\'instant — rends-toi à la Boutique des compétences pour en équiper une.'
          : 'Aucune compétence acquise pour l\'instant.') +
        '</p>';
      return;
    }

    conteneurCompetences.innerHTML = '';
    const soldeDisponible = etat.solde || 0;

    possedees.forEach((comp) => {
      const niveauActuel = etat.competences[comp.id] || 0;
      const maxAutorise = maxNiveauAutorise(comp.categorie);

      let actionsHtml = '';
      if (proprietaire) {
        if (niveauActuel >= maxAutorise) {
          const texteBouton = maxAutorise >= COMPETENCE_NIVEAU_MAX ? 'Niveau maximum atteint' : 'Plafond secondaire atteint';
          actionsHtml =
            '<div class="fp-competence-actions"><button type="button" class="fp-btn fp-btn-acheter fp-btn-competence" disabled>' + texteBouton + '</button></div>' +
            (maxAutorise < COMPETENCE_NIVEAU_MAX
              ? '<div class="fp-competence-plafond">Compétence secondaire : plafonnée au niveau ' + COMPETENCE_PLAFOND_SECONDAIRE + '.</div>'
              : '');
        } else {
          const prochainNiveau = niveauActuel + 1;
          const cout = COUTS_COMPETENCE[prochainNiveau];
          const assezDeSolde = soldeDisponible >= cout;
          actionsHtml =
            '<div class="fp-competence-actions"><button type="button" class="fp-btn fp-btn-acheter fp-btn-competence"' + (assezDeSolde ? '' : ' disabled') + '>' +
            'Faire évoluer — niveau ' + prochainNiveau + ' (' + cout + ' éclats)</button></div>' +
            '<div class="fp-competence-manque">' + (assezDeSolde ? '' : ('Il te manque ' + (cout - soldeDisponible) + ' éclats.')) + '</div>';
        }
      }

      const carte = document.createElement('div');
      carte.className = 'fp-competence';
      carte.dataset.competenceId = comp.id;
      carte.innerHTML =
        '<div class="fp-competence-header">' +
          '<span class="fp-competence-nom">' + comp.nom + '</span>' +
          '<span class="fp-competence-categorie" data-categorie="' + comp.categorie + '">' + comp.categorie + '</span>' +
        '</div>' +
        '<div class="fp-competence-pips">' + renduPips(niveauActuel, maxAutorise) + '</div>' +
        '<div class="fp-competence-lore">Niveau ' + niveauActuel + ' — « ' + comp.niveaux[niveauActuel - 1] + ' »</div>' +
        actionsHtml;
      conteneurCompetences.appendChild(carte);

      if (proprietaire) {
        const btn = carte.querySelector('.fp-btn-competence');
        if (btn) btn.addEventListener('click', () => ameliorerCompetence(comp));
      }
    });
  }

  function rafraichirAffichage() {
    if (badge) badge.setAttribute('data-niveau', String(etat.niveau));
    if (badgeImg && FICHE_ICONES_BASE_URL && FICHE_ICONES_BASE_URL.indexOf('LIEN_DIRECT_VERS') === -1) {
      badgeImg.src = FICHE_ICONES_BASE_URL.replace(/\/$/, '') + '/niveau-' + etat.niveau + '.png';
    }
    if (niveauNum) niveauNum.textContent = String(etat.niveau);

    const bonusNiveauPv = (etat.niveau - 1) * FICHE_BONUS_PV_PAR_NIVEAU;
    const bonusNiveauDps = (etat.niveau - 1) * FICHE_BONUS_DPS_PAR_NIVEAU;
    const bonusCompetencesDps = totalBonusCompetencesDps();
    const bonusEquip = totalBonusEquipement();

    if (pvBonusEl) pvBonusEl.textContent = '+' + bonusNiveauPv;
    if (dpsBonusEl) dpsBonusEl.textContent = '+' + bonusNiveauDps;
    if (bonusCompetencesEl) bonusCompetencesEl.textContent = '+' + bonusCompetencesDps;
    if (bonusEquipementPvEl) bonusEquipementPvEl.textContent = '+' + bonusEquip.pv;
    if (bonusEquipementDpsEl) bonusEquipementDpsEl.textContent = '+' + bonusEquip.dps;
    if (pvTotalEl) pvTotalEl.textContent = String((etat.pvBase || 0) + bonusNiveauPv + bonusEquip.pv);
    if (dpsTotalEl) dpsTotalEl.textContent = String((etat.dpsBase || 0) + bonusNiveauDps + bonusCompetencesDps + bonusEquip.dps);
    if (pvBaseEl) pvBaseEl.textContent = String(etat.pvBase || 0);
    if (dpsBaseEl) dpsBaseEl.textContent = String(etat.dpsBase || 0);

    const soldeDisponible = etat.solde || 0;
    if (soldeVal) soldeVal.textContent = String(soldeDisponible);

    if (btnAcheter) {
      /* On bascule entre les deux libellés via "hidden" plutôt qu'en
         réécrivant le texte du bouton : remplacer tout le contenu par
         du texte brut détruirait définitivement le <span> qui affiche
         le coût, et il ne réapparaîtrait plus jamais ensuite (bug vu
         en testant le passage niveau max -> retour en arrière). */
      if (etat.niveau >= FICHE_NIVEAU_MAX) {
        if (labelNormal) labelNormal.hidden = true;
        if (labelMax) labelMax.hidden = false;
        btnAcheter.disabled = true;
        if (manqueEl) manqueEl.textContent = '';
      } else {
        const coutSuivant = FICHE_COUTS_NIVEAU[etat.niveau + 1];
        if (coutSuivantEl) coutSuivantEl.textContent = coutSuivant;
        if (labelNormal) labelNormal.hidden = false;
        if (labelMax) labelMax.hidden = true;
        const assezDeSolde = soldeDisponible >= coutSuivant;
        btnAcheter.disabled = !assezDeSolde;
        /* Un bouton désactivé ne déclenche jamais de clic, donc le
           message d'erreur du gestionnaire de clic ("pas assez
           d'éclats...") ne s'affiche jamais dans ce cas — d'où ce
           petit texte à part, toujours visible, qui explique la
           situation même sans avoir cliqué (bug remonté : le bouton
           grisé ne donnait aucune explication). */
        if (manqueEl) {
          manqueEl.textContent = assezDeSolde ? '' : ('Il te manque ' + (coutSuivant - soldeDisponible) + ' éclats pour ce niveau.');
        }
      }
    }
  }

  function rafraichirTout() {
    rafraichirAffichage();
    rafraichirEquipement();
    rafraichirArchetype();
    rafraichirCompetences();
  }

  ficheChargerDonnees(userId)
    .then((donnees) => {
      etat = donnees;
      rafraichirTout();
      // Garde le pseudo à jour dans Firebase, juste pour que ce soit
      // lisible d'un coup d'œil dans la console (aucun impact sur le
      // fonctionnement) : on n'écrit que si ça a changé.
      if (identification.pseudo) {
        if (identification.pseudo !== donnees.pseudo) {
          ficheSauvegarder(userId, { pseudo: identification.pseudo }).catch(() => {});
        }
      } else {
        // Cas "data-joueur" : pas de pseudo sous la main tout de
        // suite, on va le chercher en tâche de fond.
        fichePseudoDepuisProfil(userId).then((pseudo) => {
          if (pseudo && pseudo !== donnees.pseudo) {
            ficheSauvegarder(userId, { pseudo }).catch(() => {});
          }
        });
      }
    })
    .catch((err) => {
      if (err && err.message === 'FIREBASE_NON_CONFIGURE') {
        afficherMessage("Base non configurée : remplace FICHE_FIREBASE_URL en haut du script.", 'erreur');
      } else {
        afficherMessage("Impossible de charger la fiche pour le moment, réessaie plus tard.", 'erreur');
      }
      rafraichirTout();
    });

  if (btnAcheter && !ecouteursDejaPoses) {
    btnAcheter.addEventListener('click', async () => {
      /* Comme l'initialisation peut se déclencher plusieurs fois (voir
         le filet de sécurité en bas de fichier), plusieurs "instances"
         indépendantes peuvent écouter ce même bouton, chacune avec son
         propre "etat" en mémoire. Si on se basait sur cet "etat" local
         pour décider quoi écrire, deux instances légèrement désynchro-
         nisées pourraient se marcher dessus et faire redescendre le
         niveau sauvegardé au lieu de l'augmenter. Pour éviter ça, on
         relit TOUTES les données ACTUELLES directement depuis la base
         juste avant d'agir : chaque déclenchement (même redondant)
         part alors de la même vérité et aboutit au même résultat
         correct. */
      btnAcheter.disabled = true;
      let donneesActuelles;
      try {
        donneesActuelles = await ficheChargerDonnees(userId);
      } catch (e) {
        afficherMessage('Impossible de vérifier ton niveau actuel, réessaie.', 'erreur');
        btnAcheter.disabled = false;
        return;
      }
      const niveauActuel = donneesActuelles.niveau;
      const soldeActuel = donneesActuelles.solde || 0;

      if (niveauActuel >= FICHE_NIVEAU_MAX) {
        etat = donneesActuelles;
        rafraichirTout();
        return;
      }

      const prochainNiveau = niveauActuel + 1;
      const cout = FICHE_COUTS_NIVEAU[prochainNiveau];

      if (soldeActuel < cout) {
        afficherMessage('Pas assez d\'éclats : il en faut ' + cout + ', solde disponible ' + soldeActuel + '.', 'erreur');
        etat = donneesActuelles;
        rafraichirTout();
        return;
      }

      /* On dépense vraiment le solde ici (ce n'était pas possible avec
         le compteur natif d'éclats, qu'on ne peut pas modifier depuis
         le navigateur du joueur) : le porte-monnaie descend de "cout"
         au moment même de l'achat. */
      const nouveauSolde = soldeActuel - cout;

      try {
        await ficheSauvegarder(userId, { niveau: prochainNiveau, solde: nouveauSolde });
        etat = donneesActuelles;
        etat.niveau = prochainNiveau;
        etat.solde = nouveauSolde;
        rafraichirTout();
        afficherMessage('Niveau ' + prochainNiveau + ' débloqué !', 'ok');
        if (badgeImg) {
          badgeImg.classList.remove('fp-levelup');
          void badgeImg.offsetWidth;
          badgeImg.classList.add('fp-levelup');
        }
      } catch (e) {
        afficherMessage("Échec de l'achat, réessaie.", 'erreur');
        rafraichirTout();
      }
    });
  }

  // ---- Choix d'archétype (verrouillage définitif au clic) ----
  if (!ecouteursDejaPoses) archetypeIcones.forEach((icone) => {
    icone.addEventListener('click', async () => {
      if (etat.archetype) return; // déjà verrouillé (bouton de toute façon désactivé)
      const choix = icone.dataset.archetype;
      archetypeIcones.forEach((i) => { i.disabled = true; });
      try {
        const donneesActuelles = await ficheChargerDonnees(userId);
        if (donneesActuelles.archetype) {
          // Déjà choisi entre-temps (ex: deux onglets ouverts à la fois).
          etat = donneesActuelles;
          afficherMessage('Ta spécialité a déjà été choisie entre-temps : ' + (donneesActuelles.archetype === 'guerrier' ? 'Guerrier' : 'Mage') + '.', '');
          return;
        }
        await ficheSauvegarder(userId, { archetype: choix });
        etat = donneesActuelles;
        etat.archetype = choix;
        afficherMessage('Spécialité verrouillée : ' + (choix === 'guerrier' ? 'Guerrier' : 'Mage') + '. Ce choix est définitif (sauf réinitialisation).', 'ok');
      } catch (e) {
        afficherMessage("Échec de l'enregistrement, réessaie.", 'erreur');
      } finally {
        rafraichirTout();
      }
    });
  });

  // ---- Évolution d'une compétence déjà possédée ----
  // (L'acquisition initiale, niveau 0 -> 1, se fait UNIQUEMENT à la
  // Boutique des compétences, jamais ici — voir la note en tête de
  // fichier.)
  async function ameliorerCompetence(comp) {
    const carte = conteneurCompetences ? conteneurCompetences.querySelector('[data-competence-id="' + comp.id + '"]') : null;
    const btn = carte ? carte.querySelector('.fp-btn-competence') : null;
    if (btn) btn.disabled = true;

    let donneesActuelles;
    try {
      donneesActuelles = await ficheChargerDonnees(userId);
    } catch (e) {
      afficherMessage('Impossible de vérifier tes données actuelles, réessaie.', 'erreur');
      if (btn) btn.disabled = false;
      return;
    }

    const niveauActuel = (donneesActuelles.competences && donneesActuelles.competences[comp.id]) || 0;
    const archetypeActuel = donneesActuelles.archetype;
    const principale = archetypeActuel === 'guerrier' ? 'physique' : 'pouvoir';
    const maxAutorise = archetypeActuel ? (comp.categorie === principale ? COMPETENCE_NIVEAU_MAX : COMPETENCE_PLAFOND_SECONDAIRE) : 0;

    if (niveauActuel === 0 || niveauActuel >= maxAutorise) {
      // Rien à faire (déjà au max, ou plus possédée du tout — ne
      // devrait normalement pas arriver) : on se contente de refléter
      // l'état réel.
      etat = donneesActuelles;
      rafraichirTout();
      return;
    }

    const prochainNiveau = niveauActuel + 1;
    const cout = COUTS_COMPETENCE[prochainNiveau];
    const soldeActuel = donneesActuelles.solde || 0;

    if (soldeActuel < cout) {
      afficherMessage("Pas assez d'éclats pour faire évoluer " + comp.nom + ".", 'erreur');
      etat = donneesActuelles;
      rafraichirTout();
      return;
    }

    const nouveauSolde = soldeActuel - cout;
    try {
      const partiel = { solde: nouveauSolde };
      // Notation "chemin/avec/slash" : ne touche QUE cette compétence,
      // sans effacer les autres compétences déjà possédées (voir la
      // même remarque dans boutique-script.js pour l'équipement).
      partiel['competences/' + comp.id] = prochainNiveau;
      await ficheSauvegarder(userId, partiel);
      etat = donneesActuelles;
      etat.solde = nouveauSolde;
      etat.competences = Object.assign({}, donneesActuelles.competences);
      etat.competences[comp.id] = prochainNiveau;
      rafraichirTout();
      afficherMessage(comp.nom + ' améliorée — niveau ' + prochainNiveau + ' !', 'ok');
    } catch (e) {
      afficherMessage("Échec de la mise à jour, réessaie.", 'erreur');
      rafraichirTout();
    }
  }

  // ---- Réinitialisation de la spécialité (payante, irréversible) ----
  if (btnReset && !ecouteursDejaPoses) {
    btnReset.addEventListener('click', async () => {
      btnReset.disabled = true;
      try {
        const donneesActuelles = await ficheChargerDonnees(userId);
        if (!donneesActuelles.archetype) {
          etat = donneesActuelles;
          return;
        }
        const soldeActuel = donneesActuelles.solde || 0;
        if (soldeActuel < FICHE_RESET_SPECIALITE_COUT) {
          afficherMessage('Pas assez d\'éclats pour réinitialiser (' + FICHE_RESET_SPECIALITE_COUT + ' éclats requis).', 'erreur');
          etat = donneesActuelles;
          return;
        }
        const nouveauSolde = soldeActuel - FICHE_RESET_SPECIALITE_COUT;
        // "null" efface le champ entièrement côté Firebase (au lieu de
        // le laisser à une valeur invalide) : archétype ET compétences
        // repartent à zéro d'un coup.
        await ficheSauvegarder(userId, { solde: nouveauSolde, archetype: null, competences: null });
        etat = donneesActuelles;
        etat.solde = nouveauSolde;
        etat.archetype = null;
        etat.competences = {};
        afficherMessage('Spécialité réinitialisée : archétype et compétences perdus (' + FICHE_RESET_SPECIALITE_COUT + ' éclats dépensés).', 'ok');
      } catch (e) {
        afficherMessage("Échec de la réinitialisation, réessaie.", 'erreur');
      } finally {
        rafraichirTout();
      }
    });
  }
}

/* ------------------------------------------------------------------
   Construction automatique dans campo18 (page de profil)
   ------------------------------------------------------------------
   Forumactif ÉCHAPPE toujours le contenu des champs de profil
   personnalisés à l'affichage (testé en direct : même en "Zone de
   texte", le champ affiche <div>...</div> en toutes lettres au lieu
   de l'interpréter — il n'existe pas d'option "Type d'affichage" HTML
   pour ces champs, seulement Texte / Icône / Icône + Texte). Donc
   coller du HTML dans campo18 ne marchera JAMAIS, quel que soit le
   champ ou son type.

   Solution : ne rien coller du tout dans campo18. On construit le
   widget nous-mêmes, en JS, directement dans le conteneur du champ,
   à chaque fois qu'on se trouve sur une page de profil (/u123...).
   Le champ peut rester vide (ou garder un petit texte quelconque,
   totalement ignoré) : ce script remplace son contenu affiché par le
   widget à chaque chargement de page. */
const FICHE_SQUELETTE = `
  <div class="fp-header">
    <div class="fp-badge" data-niveau="1"><img class="fp-badge-img" alt="Bouclier de niveau"></div>
    <div class="fp-niveau-info">
      <div class="fp-niveau-label">Niveau <span class="fp-niveau-num">1</span></div>
      <div class="fp-solde">Solde disponible : <span class="fp-solde-val">…</span> éclats</div>
      <div class="fp-solde fp-ligne-specialite">Spécialité : <span class="fp-archetype-actuelle">Aucune</span></div>
      <div class="fp-solde fp-ligne-race" hidden>Race : <span class="fp-race-actuelle"></span></div>
    </div>
  </div>

  <div class="fp-stats">
    <div class="fp-stat" data-type="pv">
      <span class="fp-stat-label">Points de vie</span>
      <span class="fp-stat-total">0</span>
      <span class="fp-stat-detail">
        Base : <span class="fp-pv-base">220</span> (bonus de niveau : <span class="fp-bonus">+0</span>, bonus d'équipement : <span class="fp-bonus-equipement fp-bonus-equipement-pv">+0</span>)
      </span>
    </div>
    <div class="fp-stat" data-type="dps">
      <span class="fp-stat-label">Dégâts</span>
      <span class="fp-stat-total">0</span>
      <span class="fp-stat-detail">
        Base : <span class="fp-dps-base">110</span> (bonus de niveau : <span class="fp-bonus">+0</span>, bonus de compétences : <span class="fp-bonus-competences">+0</span>, bonus d'équipement : <span class="fp-bonus-equipement fp-bonus-equipement-dps">+0</span>)
      </span>
    </div>
  </div>

  <div class="fp-equipement">
    <div class="fp-section-titre">Équipement</div>
    <div class="fp-equip-liste"></div>
  </div>

  <div class="fp-actions fp-edition">
    <button type="button" class="fp-btn fp-btn-acheter">
      <span class="fp-label-normal">Passer niveau suivant (<span class="fp-cout-suivant">50</span> éclats)</span>
      <span class="fp-label-max" hidden>Niveau maximum atteint</span>
    </button>
  </div>
  <div class="fp-manque fp-edition"></div>

  <div class="fp-section-titre fp-edition">Spécialité</div>
  <div class="fp-archetypes fp-edition">
    <button type="button" class="fp-archetype-icon" data-archetype="guerrier">
      <svg viewBox="0 0 40 40"><line x1="10" y1="30" x2="28" y2="12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><line x1="19" y1="21" x2="13" y2="27" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><line x1="10" y1="30" x2="6" y2="34" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="28" cy="12" r="2" fill="currentColor"/></svg>
      <span class="fp-archetype-nom">Guerrier</span>
      <span class="fp-archetype-cadenas" hidden>verrouillé</span>
    </button>
    <button type="button" class="fp-archetype-icon" data-archetype="mage">
      <svg viewBox="0 0 40 40"><line x1="20" y1="9" x2="20" y2="34" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="20" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="20" cy="8" r="1.5" fill="currentColor"/></svg>
      <span class="fp-archetype-nom">Mage</span>
      <span class="fp-archetype-cadenas" hidden>verrouillé</span>
    </button>
  </div>
  <div class="fp-manque fp-manque-archetype fp-edition"></div>

  <div class="fp-section-titre">Compétences</div>
  <div class="fp-competences"></div>

  <div class="fp-reset-bloc fp-edition">
    <div class="fp-reset-texte">
      Réinitialiser la spécialité déverrouille à nouveau les icônes Guerrier / Mage,
      mais efface définitivement toutes les compétences déjà acquises, sans aucun
      remboursement des éclats dépensés dedans.
    </div>
    <button type="button" class="fp-btn fp-btn-reset">Réinitialiser la spécialité (${FICHE_RESET_SPECIALITE_COUT} éclats)</button>
    <div class="fp-manque fp-manque-reset"></div>
  </div>

  <div class="fp-message"></div>
`;

function ficheInjecterDansProfil() {
  if (!location.pathname.match(/\/u\d+(?:[/?#]|$)/)) return;
  const conteneur = document.querySelector('.campo18 .field_uneditable') || document.querySelector('.campo18');
  if (!conteneur) return;
  if (conteneur.querySelector('.fiche-progression')) return; // déjà construit

  const racine = document.createElement('div');
  racine.className = 'fiche-progression';
  racine.innerHTML = FICHE_SQUELETTE;
  conteneur.innerHTML = '';
  conteneur.appendChild(racine);
}

function initFiche() {
  ficheInjecterStyle();
  ficheInjecterDansProfil();
  document.querySelectorAll('.fiche-progression').forEach(initFicheInstance);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFiche);
} else {
  initFiche();
}
window.addEventListener('load', initFiche);
setTimeout(initFiche, 1000);
setTimeout(initFiche, 3000);
