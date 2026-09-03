/**
 * Language Detector Module
 */

export function guessLangFromText(text) {
    if (!text || text.trim().length === 0) return null;
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    // 1. Japanese (Hiragana / Katakana)
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja';

    // 2. Chinese (Hanzi without Japanese Kana)
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)) return 'zh';

    // 3. Unique character cues
    if (/[¡¿ñ]/.test(lower)) return 'es';
    if (/[ß]/.test(lower)) return 'de';
    if (/[ãõ]/.test(lower)) return 'pt';
    if (/[œæ]/.test(lower)) return 'fr';

    // 4. Token-based word scoring
    const words = lower.match(/[\p{L}\p{N}]+/gu) || [];
    if (words.length === 0) return null;

    const dicts = {
        'es': new Set([
            'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'en', 'que', 'es', 
            'por', 'para', 'con', 'no', 'si', 'su', 'al', 'lo', 'como', 'más', 'mas', 'pero', 
            'sus', 'le', 'ya', 'o', 'fue', 'este', 'esta', 'estos', 'estas', 'esto', 'todo', 
            'toda', 'todos', 'todas', 'bien', 'bueno', 'buena', 'buenos', 'buenas', 'hola', 
            'gracias', 'favor', 'adios', 'adiós', 'usted', 'ustedes', 'nosotros', 'ellos', 'ellas', 
            'hacer', 'tener', 'estar', 'estoy', 'está', 'estan', 'están', 'muy', 'también', 
            'tambien', 'donde', 'dónde', 'cuando', 'cuándo', 'quien', 'quién', 'porque', 'porqué',
            'dia', 'día', 'dias', 'días', 'tarde', 'noche', 'tiempo', 'año', 'años', 'mundo', 'vida'
        ]),
        'en': new Set([
            'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 
            'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 
            'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 
            'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 
            'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 
            'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 
            'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 
            'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 
            'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 
            'us', 'hello', 'hi', 'please', 'thanks', 'thank', 'welcome', 'today', 'world'
        ]),
        'fr': new Set([
            'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'est', 'en', 'que', 'qui', 
            'dans', 'pour', 'pas', 'sur', 'ce', 'il', 'ils', 'elle', 'elles', 'avec', 'tout', 
            'faire', 'son', 'sa', 'ses', 'au', 'aux', 'par', 'mais', 'nous', 'vous', 'bonjour', 
            'merci', 'oui', 'non', 'comme', 'plus', 'bien', 'cette', 'ces', 'sont', 'mon', 'ton',
            'votre', 'notre', 'leur', 'leurs', 'temps', 'vie', 'monde'
        ]),
        'de': new Set([
            'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines', 'einem', 
            'einen', 'und', 'in', 'zu', 'mit', 'nicht', 'ist', 'von', 'sie', 'es', 'sich', 
            'auch', 'auf', 'für', 'an', 'er', 'hat', 'wir', 'ihr', 'hallo', 'danke', 'bitte', 
            'ja', 'nein', 'guten', 'tag', 'wie', 'wer', 'was', 'wo', 'warum', 'aber', 'wenn'
        ]),
        'pt': new Set([
            'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das', 
            'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com', 'não', 'nao', 'que', 'se', 
            'como', 'mais', 'mas', 'ele', 'ela', 'eles', 'elas', 'você', 'voce', 'olá', 'ola', 
            'obrigado', 'obrigada', 'sim', 'tudo', 'bem', 'bom', 'boa', 'dias', 'tarde', 'noite',
            'este', 'esta', 'isto', 'muito', 'também', 'tambem', 'onde', 'quando', 'quem'
        ]),
        'it': new Set([
            'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'in', 'con', 'su', 'per', 
            'tra', 'fra', 'di', 'a', 'da', 'che', 'non', 'si', 'sono', 'questo', 'questa', 
            'questi', 'queste', 'ciao', 'grazie', 'buongiorno', 'anche', 'come', 'cosa', 
            'dove', 'quando', 'perché', 'perche', 'tutto', 'molto', 'bene', 'giorno', 'sera'
        ])
    };

    const scores = { es: 0, en: 0, fr: 0, de: 0, pt: 0, it: 0 };
    for (const w of words) {
        for (const [lang, set] of Object.entries(dicts)) {
            if (set.has(w)) {
                scores[lang]++;
            }
        }
    }

    let maxScore = 0;
    let bestLang = null;
    for (const [lang, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            bestLang = lang;
        }
    }

    if (maxScore > 0) return bestLang;

    // 5. Fallback suffix / accented patterns
    if (/[áéíóú]/.test(lower)) {
        if (/[àèìòù]/.test(lower)) return 'it';
        if (/ção|ções|ndo|lhe/.test(lower)) return 'pt';
        return 'es';
    }
    if (/[äöü]/.test(lower)) return 'de';
    if (/[èêëàâùûç]/.test(lower)) return 'fr';
    if (lower.endsWith('tion') || lower.endsWith('ing') || lower.endsWith('ed')) return 'en';
    if (lower.endsWith('ción') || lower.endsWith('ando') || lower.endsWith('iendo')) return 'es';
    if (lower.endsWith('ung') || lower.endsWith('keit') || lower.endsWith('heit')) return 'de';
    if (lower.endsWith('ção') || lower.endsWith('agem')) return 'pt';

    return null;
}

export const languages = [
    { code: 'es', name: 'Español' },
    { code: 'en', name: 'Inglés' },
    { code: 'fr', name: 'Francés' },
    { code: 'de', name: 'Alemán' },
    { code: 'pt', name: 'Portugués' },
    { code: 'it', name: 'Italiano' },
    { code: 'ru', name: 'Ruso' },
    { code: 'zh', name: 'Chino' },
    { code: 'ja', name: 'Japonés' }
];
