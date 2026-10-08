import { isLocale, type Locale } from "@/lib/i18n";

/**
 * Bot copy, kept separate from the UI dictionary so the Telegram surface can be
 * extended without touching page strings. Same interpolation rules: {n}, {s}.
 */

type BotDict = Record<string, string>;

const en: BotDict = {
  "bot.help":
    "Commands:\n" +
    "/status — live board\n" +
    "/subscribe — pick services to follow\n" +
    "/unsubscribe — stop following a service\n" +
    "/mysubs — what you follow now\n" +
    "/report <service> <what happened> — tell us it is failing\n" +
    "/stop — disconnect this chat\n\n" +
    "Example: /report irctc Tatkal search spins forever",
  "bot.notLinked":
    "This chat is not linked to an account yet.\n\n" +
    "Open the website → Settings → Connect Telegram, then press START here.",
  "bot.needUsername":
    "Your Telegram account has no @username. In Telegram open Settings, set a " +
    "Username, register it on the website, then press START again.",
  "bot.handleMismatch":
    "This Telegram account is @{got}, but the website account was registered " +
    "with @{want}. Open the Connect link from your own account, or correct the " +
    "username in Settings.",
  "bot.handleTaken":
    "@{got} is already registered to another account on the website.",
  "bot.linked":
    "Connected to Is It Down, India?{h}\n\n" +
    "You'll get a message here the moment a service you follow turns amber or red, " +
    "and again when it recovers.\n\nSend /help for commands.",
  "bot.pickService": "Pick a service:",
  "bot.pickUnsub": "Pick a service to stop following:",
  "bot.pickReport": "Which service is failing for you?",
  "bot.subAdded": "✅ Following {s}. Alerts will arrive here.",
  "bot.subRemoved": "🔕 Stopped following {s}.",
  "bot.alreadySub": "You already follow {s}.",
  "bot.notSubscribed": "You weren't following {s}.",
  "bot.noSubs":
    "You don't follow any services yet.\n\nSend /subscribe to pick some.",
  "bot.subsList": "You follow:\n{list}",
  "bot.reportThanks":
    "Thanks — reported for {s}.{n}\n\nEnough reports from your area flip the public board red, even if the site answers fine.",
  "bot.duplicateReport": "You already reported {s} recently — no need to repeat it.",
  "bot.unknownService":
    "I couldn't match “{q}” to a service.\n\nTry /subscribe to see the list, or use a name like IRCTC, HDFC, GST, PhonePe.",
  "bot.needService": "Which service? For example: /subscribe irctc",
  "bot.statusTitle": "Live board · {up}/{total} clear",
  "bot.allClear": "All {total} services are responding normally.",
  "bot.chooseAction": "Choose an action:",
  "bot.alertDegraded": "STATUS: DEGRADED",
  "bot.alertDown": "STATUS: DOWN",
  "bot.alertRecovered": "STATUS: RECOVERED",
  "bot.uptime": "uptime {u}% · p50 {p}ms",
  "bot.crowd": "{n} crowd reports",
  "bot.seeBoard": "Open the status board",
};

const hi: BotDict = {
  "bot.help":
    "कमांड:\n" +
    "/status — लाइव बोर्ड\n" +
    "/subscribe — किन सेवाओं के अलर्ट चाहिए चुनें\n" +
    "/unsubscribe — किसी सेवा के अलर्ट बंद करें\n" +
    "/mysubs — अभी किनसे जुड़े हैं\n" +
    "/report <सेवा> <क्या हुआ> — फेल होने की सूचना दें\n" +
    "/stop — इस चैट को हटाएँ",
  "bot.notLinked":
    "यह चैट अभी किसी खाते से जुड़ा नहीं है।\n\n" +
    "वेबसाइट → सेटिंग्स → Telegram जोड़ें, फिर यहाँ START दबाएँ।",
  "bot.linked": "Is It Down, India? से जुड़ गया{h}\n\nआपकी सेवाएँ पीली या लाल होते ही यहाँ संदेश आएगा।",
  "bot.pickService": "कोई सेवा चुनें:",
  "bot.pickUnsub": "किस सेवा के अलर्ट बंद करने हैं चुनें:",
  "bot.pickReport": "कौन-सी सेवा फेल हो रही है?",
  "bot.subAdded": "✅ {s} की निगरानी शुरू।",
  "bot.subRemoved": "🔕 {s} की निगरानी बंद।",
  "bot.alreadySub": "आप पहले से {s} पर हैं।",
  "bot.notSubscribed": "आप {s} पर नहीं थे।",
  "bot.noSubs": "आप अभी कोई सेवा नहीं फॉलो करते।\n\n/subscribe भेजें।",
  "bot.subsList": "आप इन पर हैं:\n{list}",
  "bot.reportThanks": "धन्यवाद — {s} के लिए रिपोर्ट दर्ज।{n}",
  "bot.duplicateReport": "आपने हाल में {s} की रिपोर्ट दी है।",
  "bot.unknownService": "“{q}” से कोई सेवा नहीं मिली।\n\n/subsubscribe भेजें या IRCTC, HDFC, GST जैसा नाम लिखें।",
  "bot.needService": "कौन-सी सेवा? जैसे: /subscribe irctc",
  "bot.statusTitle": "लाइव बोर्ड · {total} में से {up} साफ़",
  "bot.allClear": "सभी {total} सेवाएँ सामान्य चल रही हैं।",
  "bot.chooseAction": "कोई क्रिया चुनें:",
  "bot.alertDegraded": "स्थिति: धीमा",
  "bot.alertDown": "स्थिति: बंद",
  "bot.alertRecovered": "स्थिति: ठीक",
  "bot.uptime": "अपटाइम {u}% · p50 {p}ms",
  "bot.crowd": "{n} रिपोर्ट",
  "bot.seeBoard": "स्टेटस बोर्ड खोलें",
};

const mr: BotDict = {
  "bot.help":
    "कमांड:\n/status — लाइव्ह बोर्ड\n/subscribe — सेवा निवडा\n/unsubscribe — सेवा बंद करा\n" +
    "/mysubs — सध्या कोणत्या\n/report <सेवा> <काय झाले> — तक्रार नोंदवा\n/stop — ही चॅट काढा",
  "bot.notLinked": "ही चॅट अजून खात्याशी जोडलेली नाही.\n\nवेबसाइट → सेटिंग्ज → Telegram जोडा, नंतर येथे START दाबा.",
  "bot.linked": "Is It Down, India? शी जोडले{h}",
  "bot.pickService": "सेवा निवडा:",
  "bot.pickUnsub": "कोणती सेवा बंद करायची निवडा:",
  "bot.pickReport": "कोणती सेवा अपयशी आहे?",
  "bot.subAdded": "✅ {s} पाळत आहोत.",
  "bot.subRemoved": "🔕 {s} बंद केले.",
  "bot.alreadySub": "तुम्ही आधीच {s} वर आहात.",
  "bot.notSubscribed": "तुम्ही {s} वर नव्हता.",
  "bot.noSubs": "अद्याप कोणतीही सेवा नाही.\n\n/subscribe पाठवा.",
  "bot.subsList": "तुम्ही यावर आहात:\n{list}",
  "bot.reportThanks": "धन्यवाद — {s} साठी नोंदवले.{n}",
  "bot.duplicateReport": "तुम्ही नुकतेच {s} ची तक्रार केली आहे.",
  "bot.unknownService": "“{q}” जुळणारी सेवा नाही.\n\n/subscribe पाठवा.",
  "bot.needService": "कोणती सेवा? उदा: /subscribe irctc",
  "bot.statusTitle": "लाइव्ह बोर्ड · {total} पैकी {up} स्वच्छ",
  "bot.allClear": "सर्व {total} सेवा सामान्य चालू आहेत.",
  "bot.chooseAction": "कृती निवडा:",
  "bot.alertDegraded": "स्थिती: मंदावले",
  "bot.alertDown": "स्थिती: बंद",
  "bot.alertRecovered": "स्थिती: ठीक",
  "bot.uptime": "अपटाइम {u}% · p50 {p}ms",
  "bot.crowd": "{n} तक्रारी",
  "bot.seeBoard": "स्टेटस बोर्ड उघडा",
};

const ta: BotDict = {
  "bot.help":
    "கட்டளைகள்:\n/status — நேரலை பலகை\n/subscribe — சேவைகளைத் தேர்ந்தெடுங்கள்\n" +
    "/unsubscribe — சேவையை நிறுத்துங்கள்\n/mysubs — தற்போது என்ன\n/report <சேவை> <என்ன நடந்தது> — தோல்வியைத் தெரிவியுங்கள்\n/stop — இந்த உரையை நீக்கு",
  "bot.notLinked": "இந்த உரை கணக்குடன் இணைக்கப்படவில்லை.\n\nஇணையதளம் → அமைப்புகள் → Telegram இணை, பின்னர் இங்கே START அழுத்துங்கள்.",
  "bot.linked": "Is It Down, India? உடன் இணைக்கப்பட்டது{h}",
  "bot.pickService": "ஒரு சேவையைத் தேர்ந்தெடுங்கள்:",
  "bot.pickUnsub": "எந்தச் சேவையை நிறுத்த வேண்டும் தேர்ந்தெடுங்கள்:",
  "bot.pickReport": "எந்தச் சேவை தோல்வியாக உள்ளது?",
  "bot.subAdded": "✅ {s} ஐப் பின்தொடர்கிறோம்.",
  "bot.subRemoved": "🔕 {s} நிறுத்தப்பட்டது.",
  "bot.alreadySub": "நீங்கள் ஏற்கனவே {s} மீதுள்ளீர்கள்.",
  "bot.notSubscribed": "நீங்கள் {s} மீது இல்லை.",
  "bot.noSubs": "இன்னும் சேவைகள் இல்லை.\n\n/subscribe அனுப்புங்கள்.",
  "bot.subsList": "நீங்கள் இவற்றில் உள்ளீர்கள்:\n{list}",
  "bot.reportThanks": "நன்றி — {s} பதிவு செய்யப்பட்டது.{n}",
  "bot.duplicateReport": "நீங்கள் அண்மையில் {s} புகார் அளித்துள்ளீர்கள்.",
  "bot.unknownService": "“{q}” சேவை காணப்படவில்லை.\n\n/subscribe அனுப்புங்கள்.",
  "bot.needService": "எந்தச் சேவை? உදா: /subscribe irctc",
  "bot.statusTitle": "நேரலை பலகை · {total} இல் {up} தெளிவு",
  "bot.allClear": "அனைத்து {total} சேவைகளும் சரியாக செயல்படுகின்றன.",
  "bot.chooseAction": "ஒரு செயலைத் தேர்ந்தெடுங்கள்:",
  "bot.alertDegraded": "நிலை: மெதுவு",
  "bot.alertDown": "நிலை: டவுன்",
  "bot.alertRecovered": "நிலை: மீட்பு",
  "bot.uptime": "இயக்கம் {u}% · p50 {p}ms",
  "bot.crowd": "{n} புகார்கள்",
  "bot.seeBoard": "நிலைப்பலகையைத் திற",
};

const DICTS: Record<Locale, BotDict> = { en, hi, mr, ta };

export function botT(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const dict = DICTS[isLocale(locale) ? locale : "en"] ?? en;
  let out = dict[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars))
      out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

export function botLocale(locale: unknown): Locale {
  return isLocale(locale) ? locale : "en";
}
