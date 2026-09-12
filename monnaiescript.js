/* ==========================================================
   MONNAIE MAISON — "Éclats" gérés entièrement par ce script
   (on abandonne le compteur natif du module "don de points").

   ⚠️ IMPORTANT : contrairement à fiche-script.js (collé dans le champ
   de profil campo18, donc actif seulement sur les pages /u...), CE
   fichier doit tourner sur TOUTES LES PAGES DU FORUM. Colle-le avec
   monnaie-style.css dans :
     ACP > Modules > "HTML et JAVASCRIPT" > Gérer les codes HTML
     > Nouveau code > position "Partout"
   (voir monnaie-injection.html pour le code exact à coller).

   Ce que fait ce script sur chaque page :
   1. Il repère le joueur connecté (lien "Voir mon profil" du menu du
      forum) et affiche son solde via un médaillon fixe en bas à
      gauche de l'écran (clic = affiche "X éclats").
   2. En tâche de fond, il regarde si le joueur a posté de nouveaux
      messages depuis la dernière vérification, DANS UNE ZONE DE JEU
      autorisée (liste MONNAIE_FORUMS_ELIGIBLES ci-dessous), et crédite
      le porte-monnaie en conséquence.
   3. Le solde vit dans Firebase, au même endroit que la fiche de
      personnage : /personnages/{id}/solde — modifiable à la main
      depuis la console Firebase en cas de souci (correction, ajout
      exceptionnel de points, etc.).
   ========================================================== */

const MONNAIE_FIREBASE_URL = "https://pathofdawn-fiches-default-rtdb.europe-west1.firebasedatabase.app";

/* Combien d'éclats gagnés par message posté dans une zone éligible.
   Modifiable à tout moment : ça ne change que les GAINS futurs, pas
   les soldes déjà accumulés. */
const MONNAIE_ECLATS_PAR_MESSAGE = 10;

/* Identifiants de forums ("fXX" dans l'URL) où poster fait gagner des
   éclats : les 5 zones de jeu + tous leurs sous-forums. Un sous-forum
   compte l'id DIRECT du sous-forum (pas celui de la catégorie), donc
   si tu crées un nouveau sous-forum de jeu plus tard, ajoute son id
   ici (regarde dans l'URL du forum : "/f27-..." → 27).
     5  = Ez'Altas, Terre des Eldars (catégorie)
      9  = Capitale du Royaume
      10 = Secteur Frontalier
      19 = Forêt d'Ir-Mëlven
     6  = Île de Cleyf (catégorie)
      27 = Palais des Claveaux
      28 = La cité
      29 = Côte et environs
     8  = Les Pics Foudroyants (catégorie)
      12 = Capitale du Royaume
      13 = Plateau rocheux
      20 = Secteur Frontalier
     11 = Royaume de Karagor (catégorie)
      17 = Capitale du Royaume
      21 = Faubourg et alentours
      22 = Forêt d'Ir-Mëlven
     16 = Désolation du Maelström (catégorie)
      18 = Epicentre du Maelström
      23 = Ruines du passé
      24 = Grand Nord
   (Volontairement absents : Administration, Corbeille, Univers et
   connaissances, Présentation des voyageurs, Evolution des héros —
   confirmé avec toi que ces zones ne doivent pas faire gagner d'éclats.) */
const MONNAIE_FORUMS_ELIGIBLES = [
  5, 9, 10, 19,
  6, 27, 28, 29,
  8, 12, 13, 20,
  11, 17, 21, 22,
  16, 18, 23, 24
];

/* Sécurité : combien de pages de "messages postés par ce joueur" on
   accepte de parcourir en une seule synchronisation (25 messages par
   page). Largement suffisant même après plusieurs jours d'absence ;
   ça évite juste qu'un cas extrême ne mette à rebours en boucle. */
const MONNAIE_MAX_PAGES_SYNC = 4;

/* On ne resynchronise pas à CHAQUE page vue (ce serait beaucoup
   d'appels réseau pour rien) : un joueur qui navigue de page en page
   déclenche au plus une vérification toutes les X minutes. */
const MONNAIE_INTERVALLE_SYNC_MINUTES = 3;

/* ------------------------------------------------------------------
   Petits utilitaires
   ------------------------------------------------------------------ */

/* Le lien "Voir mon profil" n'existe (avec ce texte) que dans le menu
   du forum pour le compte actuellement connecté, sur TOUTES les
   pages du site — contrairement à "mode=editprofile" qui ne repère la
   propriété que sur la page /u du personnage concerné. */
function monnaieMonIdJoueur() {
  const liens = document.querySelectorAll('a[href*="/u"]');
  for (const a of liens) {
    if (a.textContent.trim().toLowerCase() === 'voir mon profil') {
      const m = (a.getAttribute('href') || '').match(/\/u(\d+)(?:[/?#]|$)/);
      if (m) return m[1];
    }
  }
  return null;
}

async function monnaieChargerPersonnage(userId) {
  const res = await fetch(MONNAIE_FIREBASE_URL + '/personnages/' + userId + '.json');
  if (!res.ok) throw new Error('Erreur réseau (' + res.status + ')');
  const data = await res.json();
  return {
    solde: (data && typeof data.solde === 'number') ? data.solde : 0,
    dernierPostId: (data && typeof data.dernierPostId === 'number') ? data.dernierPostId : 0
  };
}

async function monnaieSauvegarderPersonnage(userId, partiel) {
  const res = await fetch(MONNAIE_FIREBASE_URL + '/personnages/' + userId + '.json', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partiel)
  });
  if (!res.ok) throw new Error('Erreur réseau (' + res.status + ')');
}

/* Va chercher UNE page des messages postés par ce joueur
   ("/spa/u{id}" puis "/spa/u{id}/25", "/spa/u{id}/50", ...) et
   renvoie la liste des messages trouvés, du plus récent au plus
   ancien, avec pour chacun : son id unique de message (le "#123" à la
   fin du lien vers le sujet) et l'id du forum où il a été posté. */
async function monnaieRecupererPage(userId, offset) {
  const chemin = '/spa/u' + userId + (offset ? '/' + offset : '');
  const res = await fetch(chemin);
  if (!res.ok) throw new Error('Erreur réseau (' + res.status + ')');
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const containers = doc.querySelectorAll('.search-post-container');
  const messages = [];
  containers.forEach((c) => {
    let forumId = null;
    let postId = null;
    c.querySelectorAll('a').forEach((a) => {
      const href = a.getAttribute('href') || '';
      const chemin = href.split('?')[0].split('#')[0];
      const mForum = chemin.match(/^\/f(\d+)-/);
      if (mForum && forumId === null) forumId = parseInt(mForum[1], 10);
      // L'identifiant unique du message est le fragment ("#133") sur
      // le lien qui pointe vers le sujet — on l'accepte même s'il y a
      // une chaîne de requête entre le chemin et le "#" (peu probable
      // ici, mais on ne prend pas de risque).
      const mPost = /^\/t\d+-/.test(chemin) && href.match(/#(\d+)(?:$|[?&])/);
      if (mPost) postId = parseInt(mPost[1], 10);
    });
    if (forumId !== null && postId !== null) {
      messages.push({ forumId, postId });
    }
  });
  return messages;
}

/* Parcourt les messages du joueur, du plus récent vers le plus
   ancien, jusqu'à retomber sur un message déjà connu (son id <= au
   dernier traité) ou à épuiser les pages autorisées. Renvoie combien
   de NOUVEAUX messages sont dans une zone éligible, et le plus grand
   id de message vu au passage (pour avancer le repère, même pour les
   messages hors zone éligible — sinon on les réexaminerait sans fin). */
async function monnaieCompterNouveauxMessagesEligibles(userId, dernierPostIdConnu) {
  let nouveauxEligibles = 0;
  let plusGrandIdVu = dernierPostIdConnu;

  for (let page = 0; page < MONNAIE_MAX_PAGES_SYNC; page++) {
    let messages;
    try {
      messages = await monnaieRecupererPage(userId, page * 25);
    } catch (e) {
      break; // en cas de souci réseau, on garde ce qu'on a déjà trouvé
    }
    if (!messages.length) break;

    let onContinue = true;
    for (const msg of messages) {
      if (msg.postId <= dernierPostIdConnu) { onContinue = false; break; }
      if (msg.postId > plusGrandIdVu) plusGrandIdVu = msg.postId;
      if (MONNAIE_FORUMS_ELIGIBLES.includes(msg.forumId)) nouveauxEligibles++;
    }
    if (!onContinue) break;
  }

  return { nouveauxEligibles, plusGrandIdVu };
}

/* ------------------------------------------------------------------
   Synchronisation (accrual) — appelée au chargement de chaque page,
   mais réellement exécutée au plus une fois toutes les
   MONNAIE_INTERVALLE_SYNC_MINUTES minutes par navigateur.
   ------------------------------------------------------------------ */
async function monnaieSynchroniser(userId) {
  const cle = 'monnaie_derniere_sync_' + userId;
  const maintenant = Date.now();
  try {
    const derniere = parseInt(localStorage.getItem(cle) || '0', 10);
    if (maintenant - derniere < MONNAIE_INTERVALLE_SYNC_MINUTES * 60 * 1000) {
      return; // trop tôt, on ne resynchronise pas à chaque page vue
    }
    localStorage.setItem(cle, String(maintenant));
  } catch (e) {
    // navigateur sans localStorage (mode privé strict...) : on continue
    // quand même, on synchronisera juste un peu plus souvent.
  }

  let personnage;
  try {
    personnage = await monnaieChargerPersonnage(userId);
  } catch (e) {
    return;
  }

  let resultat;
  try {
    resultat = await monnaieCompterNouveauxMessagesEligibles(userId, personnage.dernierPostId);
  } catch (e) {
    return;
  }

  if (resultat.plusGrandIdVu > personnage.dernierPostId) {
    const gain = resultat.nouveauxEligibles * MONNAIE_ECLATS_PAR_MESSAGE;
    try {
      await monnaieSauvegarderPersonnage(userId, {
        solde: personnage.solde + gain,
        dernierPostId: resultat.plusGrandIdVu
      });
      if (gain > 0) monnaieRafraichirIcone(userId);
    } catch (e) {
      // on retentera à la prochaine page vue
    }
  }
}

/* ------------------------------------------------------------------
   Médaillon de solde, en bas à gauche de l'écran
   ------------------------------------------------------------------ */
let monnaieEtatIcone = { solde: null };

function monnaieConstruireIcone() {
  if (document.querySelector('.monnaie-widget')) return document.querySelector('.monnaie-widget');

  const widget = document.createElement('div');
  widget.className = 'monnaie-widget';
  widget.innerHTML =
    '<button type="button" class="monnaie-medaillon" aria-label="Voir mon solde d\'éclats">' +
      '<span class="monnaie-medaillon-icone">✦</span>' +
    '</button>' +
    '<div class="monnaie-bulle" hidden></div>';
  document.body.appendChild(widget);

  const bouton = widget.querySelector('.monnaie-medaillon');
  const bulle = widget.querySelector('.monnaie-bulle');
  bouton.addEventListener('click', (e) => {
    e.stopPropagation();
    bulle.hidden = !bulle.hidden;
  });
  document.addEventListener('click', () => { bulle.hidden = true; });

  return widget;
}

function monnaieRafraichirIconeAffichage(widget) {
  const bulle = widget.querySelector('.monnaie-bulle');
  if (monnaieEtatIcone.solde === null) {
    bulle.textContent = 'Chargement...';
  } else {
    bulle.textContent = monnaieEtatIcone.solde + (monnaieEtatIcone.solde === 1 ? ' éclat' : ' éclats');
  }
}

async function monnaieRafraichirIcone(userId) {
  const widget = monnaieConstruireIcone();
  try {
    const personnage = await monnaieChargerPersonnage(userId);
    monnaieEtatIcone.solde = personnage.solde;
  } catch (e) {
    monnaieEtatIcone.solde = monnaieEtatIcone.solde; // on garde la dernière valeur connue
  }
  monnaieRafraichirIconeAffichage(widget);
}

/* ------------------------------------------------------------------
   Point d'entrée
   ------------------------------------------------------------------ */
function initMonnaie() {
  const userId = monnaieMonIdJoueur();
  if (!userId) return; // visiteur non connecté : pas de solde à afficher

  monnaieRafraichirIcone(userId);
  monnaieSynchroniser(userId).then(() => {
    // si la synchro a rapporté des éclats, l'icône a déjà été
    // rafraîchie par monnaieSynchroniser() elle-même.
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMonnaie);
} else {
  initMonnaie();
}
window.addEventListener('load', initMonnaie);
/* Filet de sécurité : certains thèmes Forumactif injectent le menu
   utilisateur (donc le lien "Voir mon profil") un peu après le
   DOMContentLoaded/load classiques — on retente donc une fois de
   plus un peu après, comme pour fiche-script.js. */
setTimeout(initMonnaie, 1500);
setTimeout(initMonnaie, 3500);
