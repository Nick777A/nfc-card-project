const LANGUAGES = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' }
];

const DEFAULT_LANG = 'ru';

const DICTIONARY = {
  saveContact: {
    ru: 'Сохранить контакт в 1 клик',
    en: 'Save contact in 1 tap',
    fr: 'Enregistrer le contact en 1 clic',
    de: 'Kontakt mit 1 Klick speichern',
    es: 'Guardar contacto en 1 clic',
    it: 'Salva contatto in 1 clic'
  },
  phoneLabel: {
    ru: 'Телефон', en: 'Phone', fr: 'Téléphone', de: 'Telefon', es: 'Teléfono', it: 'Telefono'
  },
  emailLabel: {
    ru: 'Email', en: 'Email', fr: 'Email', de: 'E-Mail', es: 'Correo', it: 'Email'
  },
  linkLabel: {
    ru: 'Ссылка', en: 'Link', fr: 'Lien', de: 'Link', es: 'Enlace', it: 'Link'
  },
  wifiNetwork: {
    ru: 'Сеть Wi‑Fi', en: 'Wi‑Fi network', fr: 'Réseau Wi‑Fi', de: 'WLAN-Netzwerk', es: 'Red Wi‑Fi', it: 'Rete Wi‑Fi'
  },
  wifiPassword: {
    ru: 'Пароль', en: 'Password', fr: 'Mot de passe', de: 'Passwort', es: 'Contraseña', it: 'Password'
  },
  wifiHint: {
    ru: 'Если телефон не подключился автоматически при поднесении карты, введите эти данные в настройках Wi‑Fi вручную.',
    en: "If your phone didn't connect automatically when you tapped the card, enter these details manually in Wi‑Fi settings.",
    fr: "Si votre téléphone ne s'est pas connecté automatiquement, entrez ces informations manuellement dans les paramètres Wi‑Fi.",
    de: 'Falls sich Ihr Telefon nicht automatisch verbunden hat, geben Sie diese Daten manuell in den WLAN-Einstellungen ein.',
    es: 'Si tu teléfono no se conectó automáticamente, introduce estos datos manualmente en los ajustes de Wi‑Fi.',
    it: 'Se il telefono non si è connesso automaticamente, inserisci questi dati manualmente nelle impostazioni Wi‑Fi.'
  },
  qrFallbackLabel: {
    ru: 'Не получилось через NFC?',
    en: "NFC didn't work?",
    fr: "Le NFC n'a pas fonctionné ?",
    de: 'NFC hat nicht funktioniert?',
    es: '¿No funcionó el NFC?',
    it: "L'NFC non ha funzionato?"
  },
  qrFallbackHint: {
    ru: 'Покажите этот QR-код собеседнику со своего экрана — он откроет ту же карточку камерой телефона.',
    en: 'Show this QR code on your screen — they can scan it with their camera to open the same card.',
    fr: "Montrez ce code QR sur votre écran — il pourra l'ouvrir en le scannant avec son appareil photo.",
    de: 'Zeigen Sie diesen QR-Code auf Ihrem Bildschirm — er kann ihn mit der Kamera scannen, um dieselbe Karte zu öffnen.',
    es: 'Muestra este código QR en tu pantalla — podrá escanearlo con la cámara para abrir la misma tarjeta.',
    it: 'Mostra questo codice QR sul tuo schermo — potrà scansionarlo con la fotocamera per aprire la stessa scheda.'
  },
  disabledTitle: {
    ru: 'Карточка временно отключена',
    en: 'This card is temporarily disabled',
    fr: 'Cette carte est temporairement désactivée',
    de: 'Diese Karte ist vorübergehend deaktiviert',
    es: 'Esta tarjeta está temporalmente desactivada',
    it: 'Questa scheda è temporaneamente disattivata'
  },
  disabledHint: {
    ru: 'Владелец приостановил эту карточку. Обратитесь к тому, кто её выдал.',
    en: 'The owner has paused this card. Please contact whoever gave it to you.',
    fr: "Le propriétaire a mis cette carte en pause. Contactez la personne qui vous l'a remise.",
    de: 'Der Besitzer hat diese Karte pausiert. Bitte wenden Sie sich an die Person, die sie Ihnen gegeben hat.',
    es: 'El propietario ha pausado esta tarjeta. Contacta con quien te la dio.',
    it: 'Il proprietario ha messo in pausa questa scheda. Contatta chi te l\'ha data.'
  },
  notFoundTitle: {
    ru: 'Карточка не найдена',
    en: 'Card not found',
    fr: 'Carte introuvable',
    de: 'Karte nicht gefunden',
    es: 'Tarjeta no encontrada',
    it: 'Scheda non trovata'
  },
  notFoundHint: {
    ru: 'Эта ссылка недействительна или карточка была удалена.',
    en: 'This link is invalid or the card has been deleted.',
    fr: "Ce lien n'est pas valide ou la carte a été supprimée.",
    de: 'Dieser Link ist ungültig oder die Karte wurde gelöscht.',
    es: 'Este enlace no es válido o la tarjeta ha sido eliminada.',
    it: 'Questo link non è valido o la scheda è stata eliminata.'
  }
};

function translate(lang, key) {
  const entry = DICTIONARY[key];
  if (!entry) return key;
  return entry[lang] || entry[DEFAULT_LANG];
}

function resolveLang(req, res) {
  const supported = LANGUAGES.map((l) => l.code);
  const fromQuery = (req.query.lang || '').toString();
  if (supported.includes(fromQuery)) {
    res.cookie('lang', fromQuery, { maxAge: 365 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    return fromQuery;
  }
  const fromCookie = (req.cookies && req.cookies.lang) || '';
  if (supported.includes(fromCookie)) return fromCookie;
  return DEFAULT_LANG;
}

module.exports = { LANGUAGES, DEFAULT_LANG, translate, resolveLang };
