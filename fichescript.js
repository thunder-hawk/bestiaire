/* ==========================================================
   FICHE DE PERSONNAGE — système de niveaux (1 à 10)
   À coller dans le champ personnalisé "campo18" (Stats) du profil,
   avec le <link> vers fiche-style.css et le <script> vers ce fichier
   juste à côté (mêmes principes que la boutique : jsDelivr + ?v=).
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
   Petits utilitaires
   ------------------------------------------------------------------ */

/* Récupère l'identifiant numérique du profil affiché depuis l'URL
   (".../u1", ".../u42" ...) : c'est ce qui permet au script de savoir
   automatiquement de quel personnage il s'agit, sans rien à
   configurer à la main dans le collage HTML de chaque joueur. */
function ficheIdDepuisUrl() {
  const m = location.pathname.match(/\/u(\d+)(?:[/?#]|$)/);
  return m ? m[1] : null;
}

/* Vrai seulement si la personne qui regarde la page est bien la
   propriétaire de ce profil : Forumactif n'affiche le lien "Éditer
   mon profil" (mode=editprofile) que sur son propre profil. On s'en
   sert pour n'afficher les boutons d'achat qu'au bon joueur. */
function ficheEstProprietaire() {
  return !!document.querySelector('a[href*="mode=editprofile"]');
}

/* Le pseudo du personnage DONT ON REGARDE LE PROFIL (pas forcément
   celui qui regarde) : sur une page /u..., Forumactif met le titre de
   la page sous la forme "Voir un profil - Pseudo" — c'est plus fiable
   que d'aller chercher un élément précis du thème, qui peut changer. */
function fichePseudoDepuisTitre() {
  const m = document.title.match(/^Voir un profil - (.+)$/);
  return m ? m[1].trim() : null;
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
    pseudo: (data && typeof data.pseudo === 'string') ? data.pseudo : null
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
  const userId = ficheIdDepuisUrl();
  const proprietaire = ficheEstProprietaire();

  const badge = racine.querySelector('.fp-badge');
  const niveauNum = racine.querySelector('.fp-niveau-num');
  const soldeVal = racine.querySelector('.fp-solde-val');
  const pvTotalEl = racine.querySelector('[data-type="pv"] .fp-stat-total');
  const dpsTotalEl = racine.querySelector('[data-type="dps"] .fp-stat-total');
  const pvBonusEl = racine.querySelector('[data-type="pv"] .fp-bonus');
  const dpsBonusEl = racine.querySelector('[data-type="dps"] .fp-bonus');
  const pvInput = racine.querySelector('.fp-input-pv');
  const dpsInput = racine.querySelector('.fp-input-dps');
  const btnSauver = racine.querySelector('.fp-btn-sauver');
  const btnAcheter = racine.querySelector('.fp-btn-acheter');
  const coutSuivantEl = racine.querySelector('.fp-cout-suivant');
  const labelNormal = racine.querySelector('.fp-label-normal');
  const labelMax = racine.querySelector('.fp-label-max');
  const manqueEl = racine.querySelector('.fp-manque');
  const messageEl = racine.querySelector('.fp-message');
  const zonesEdition = racine.querySelectorAll('.fp-edition');

  if (!userId) {
    if (messageEl) messageEl.textContent = "Impossible de déterminer le personnage (page non reconnue).";
    return;
  }

  // Un visiteur (pas le propriétaire) ne voit ni les champs de saisie
  // ni les boutons d'achat : juste le résultat, en lecture seule.
  if (!proprietaire) zonesEdition.forEach((el) => el.remove());

  let etat = { niveau: 1, pvBase: 0, dpsBase: 0 };

  function afficherMessage(texte, type) {
    if (!messageEl) return;
    messageEl.textContent = texte;
    messageEl.className = 'fp-message' + (type ? ' fp-' + type : '');
  }

  function rafraichirAffichage() {
    if (badge) badge.setAttribute('data-niveau', String(etat.niveau));
    if (niveauNum) niveauNum.textContent = String(etat.niveau);

    const bonusPv = (etat.niveau - 1) * FICHE_BONUS_PV_PAR_NIVEAU;
    const bonusDps = (etat.niveau - 1) * FICHE_BONUS_DPS_PAR_NIVEAU;
    if (pvBonusEl) pvBonusEl.textContent = '+' + bonusPv;
    if (dpsBonusEl) dpsBonusEl.textContent = '+' + bonusDps;
    if (pvTotalEl) pvTotalEl.textContent = String((etat.pvBase || 0) + bonusPv);
    if (dpsTotalEl) dpsTotalEl.textContent = String((etat.dpsBase || 0) + bonusDps);
    if (pvInput) pvInput.value = etat.pvBase || 0;
    if (dpsInput) dpsInput.value = etat.dpsBase || 0;

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

  ficheChargerDonnees(userId)
    .then((donnees) => {
      etat = donnees;
      rafraichirAffichage();
      // Garde le pseudo à jour dans Firebase, juste pour que ce soit
      // lisible d'un coup d'œil dans la console (aucun impact sur le
      // fonctionnement) : on n'écrit que si ça a changé.
      const pseudoActuel = fichePseudoDepuisTitre();
      if (pseudoActuel && pseudoActuel !== donnees.pseudo) {
        ficheSauvegarder(userId, { pseudo: pseudoActuel }).catch(() => {});
      }
    })
    .catch((err) => {
      if (err && err.message === 'FIREBASE_NON_CONFIGURE') {
        afficherMessage("Base non configurée : remplace FICHE_FIREBASE_URL en haut du script.", 'erreur');
      } else {
        afficherMessage("Impossible de charger la fiche pour le moment, réessaie plus tard.", 'erreur');
      }
      rafraichirAffichage();
    });

  if (btnSauver) {
    btnSauver.addEventListener('click', async () => {
      const pv = Math.max(0, parseInt(pvInput.value, 10) || 0);
      const dps = Math.max(0, parseInt(dpsInput.value, 10) || 0);
      btnSauver.disabled = true;
      try {
        await ficheSauvegarder(userId, { pvBase: pv, dpsBase: dps });
        etat.pvBase = pv;
        etat.dpsBase = dps;
        rafraichirAffichage();
        afficherMessage('Stats de base enregistrées.', 'ok');
      } catch (e) {
        afficherMessage("Échec de l'enregistrement, réessaie.", 'erreur');
      } finally {
        btnSauver.disabled = false;
      }
    });
  }

  if (btnAcheter) {
    btnAcheter.addEventListener('click', async () => {
      /* Comme l'initialisation peut se déclencher plusieurs fois (voir
         le filet de sécurité en bas de fichier), plusieurs "instances"
         indépendantes peuvent écouter ce même bouton, chacune avec son
         propre "etat" en mémoire. Si on se basait sur cet "etat" local
         pour décider quoi écrire, deux instances légèrement désynchro-
         nisées pourraient se marcher dessus et faire redescendre le
         niveau sauvegardé au lieu de l'augmenter. Pour éviter ça, on
         relit le niveau ACTUEL directement depuis la base juste avant
         d'agir : chaque déclenchement (même redondant) part alors de
         la même vérité et aboutit au même résultat correct. */
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
        etat.niveau = niveauActuel;
        etat.solde = soldeActuel;
        rafraichirAffichage();
        return;
      }

      const prochainNiveau = niveauActuel + 1;
      const cout = FICHE_COUTS_NIVEAU[prochainNiveau];

      if (soldeActuel < cout) {
        afficherMessage('Pas assez d\'éclats : il en faut ' + cout + ', solde disponible ' + soldeActuel + '.', 'erreur');
        etat.niveau = niveauActuel;
        etat.solde = soldeActuel;
        rafraichirAffichage();
        return;
      }

      /* On dépense vraiment le solde ici (ce n'était pas possible avec
         le compteur natif d'éclats, qu'on ne peut pas modifier depuis
         le navigateur du joueur) : le porte-monnaie descend de "cout"
         au moment même de l'achat. */
      const nouveauSolde = soldeActuel - cout;

      try {
        await ficheSauvegarder(userId, { niveau: prochainNiveau, solde: nouveauSolde });
        etat.niveau = prochainNiveau;
        etat.solde = nouveauSolde;
        rafraichirAffichage();
        afficherMessage('Niveau ' + prochainNiveau + ' débloqué !', 'ok');
        if (badge) {
          badge.classList.remove('fp-levelup');
          void badge.offsetWidth;
          badge.classList.add('fp-levelup');
        }
      } catch (e) {
        afficherMessage("Échec de l'achat, réessaie.", 'erreur');
        rafraichirAffichage();
      }
    });
  }
}

function initFiche() {
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
