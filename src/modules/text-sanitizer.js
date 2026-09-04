/**
 * Text Sanitizer and Formatter Module
 */

export function extractFormattedText(container) {
    if (!container) return '';
    const clone = container.cloneNode(true);

    // Normalize strong -> b, em -> i
    clone.querySelectorAll('strong').forEach(el => {
        const b = document.createElement('b');
        b.innerHTML = el.innerHTML;
        el.replaceWith(b);
    });
    clone.querySelectorAll('em').forEach(el => {
        const i = document.createElement('i');
        i.innerHTML = el.innerHTML;
        el.replaceWith(i);
    });

    // Convert line break elements into \n
    clone.querySelectorAll('.tf-line-empty').forEach(el => el.replaceWith('\n'));
    clone.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
    clone.querySelectorAll('.tf-line, p, div').forEach(el => {
        el.append('\n');
    });

    let text = clone.innerHTML || clone.innerText || '';

    // Remove span wrapper tags (.tf-sentence etc.) but preserve inner content
    text = text.replace(/<span[^>]*>/gi, '').replace(/<\/span>/gi, '');
    // Remove div/p wrapper tags
    text = text.replace(/<\/?(div|p)[^>]*>/gi, '');
    // Normalize newlines
    text = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
    return text;
}

export function renderMarkdownFormatting(text) {
    if (!text) return '';
    // Markdown headers: # Heading -> <b>Heading</b>
    text = text.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');
    // Bold + Italic: ***text***
    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<b><i>$1</i></b>');
    // Bold: **text** or __text__
    text = text.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    text = text.replace(/__([^_]+)__/g, '<b>$1</b>');
    // Italic: *text* (not surrounded by other *)
    text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<i>$1</i>');
    // Italic: _text_ (word-boundary safe)
    text = text.replace(/(?<![a-zA-Z0-9_])_([^_]+)_(?![a-zA-Z0-9_])/g, '<i>$1</i>');
    return text;
}

export function cleanOcrAndScanText(text) {
    if (!text) return '';
    
    // Normalize newlines to \n
    let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Normalize unicode soft hyphens & non-breaking spaces
    normalized = normalized.replace(/\u00AD/g, '-').replace(/\u00A0/g, ' ');
    
    // Fix collapsed line breaks (e.g. "L2O)En" -> "L2O)\nEn")
    normalized = normalized.replace(/\)([A-ZÁÉÍÓÚÑ])/g, ')\n$1');
    // Fix collapsed colon headings e.g. "Óptimos:En lugar" -> "Óptimos:\nEn lugar"
    normalized = normalized.replace(/([:;])([A-ZÁÉÍÓÚÑ])/g, '$1\n$2');
    
    // Split by 2 or more newlines into distinct paragraph blocks
    const rawParagraphs = normalized.split(/\n\s*\n+/);
    
    const cleanedParagraphs = rawParagraphs.map(para => {
        const rawLines = para.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (rawLines.length === 0) return '';
        
        let merged = [];
        
        for (let i = 0; i < rawLines.length; i++) {
            let current = rawLines[i];
            
            if (merged.length === 0) {
                merged.push(current);
                continue;
            }
            
            let prev = merged[merged.length - 1];
            
            // Check if current line is a distinct structural item that MUST start a new line:
            // 1. Bullet point: -, *, •, +, >, etc.
            const isBullet = /^[-*•+>]\s+/.test(current);
            // 2. Numbered list: 1., 1), (1), a., a), (a), 1.1, etc.
            const isNumberedList = /^(\(?\d+[\.\)]|\(?[a-zA-Z][\.\)]|\d+(\.\d+)+[\.\)]?)\s+/.test(current);
            // 3. Speaker / Dialogue: 'Name:', 'Speaker 1:', 'Q:', 'A:' (ensure not URL like http:)
            const isSpeaker = /^[A-ZÁÉÍÓÚÑa-záéíóúñ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]{0,25}:(?!\/)\s*/.test(current);
            // 4. Markdown Header: # Header
            const isHeader = /^#{1,6}\s+/.test(current);
            // 5. Short standalone title/heading (e.g. CAPITULO I, RESUMEN, ABSTRACT, 1. INTRODUCCION)
            const isPrevShortHeading = prev.length < 50 && (/^[A-Z0-9\sÁÉÍÓÚÑ\-:]{3,50}$/.test(prev) || /^(cap[ií]tulo|secci[oó]n|resumen|abstract|introducci[oó]n|conclusi[oó]n|m[eé]todo)/i.test(prev)) && !/[,;]$/.test(prev);
            
            if (isBullet || isNumberedList || isSpeaker || isHeader || isPrevShortHeading) {
                // Keep as separate line within paragraph block
                merged.push(current);
            } else {
                // Soft line break inside paragraph -> Unify!
                // Handle hyphenation at line break (e.g. 'meto-\ndológico' -> 'metodológico')
                if (prev.endsWith('-') && /^[a-záéíóúñ]/i.test(current)) {
                    merged[merged.length - 1] = prev.slice(0, -1) + current;
                } else {
                    merged[merged.length - 1] = prev + ' ' + current;
                }
            }
        }
        
        return merged.join('\n');
    });
    
    // Rejoin paragraphs with double newlines
    return cleanedParagraphs.filter(p => p.trim() !== '').join('\n\n');
}

/**
 * Sanitize HTML from clipboard: keep only safe formatting tags.
 * Strips scripts, styles, images, and other dangerous elements.
 * Unifies soft-wrapped lines inside paragraphs while preserving bold, italic, and lists.
 */
export function sanitizeClipboardHtml(html) {
    if (!html) return '';

    // Extract fragment between <!--StartFragment--> and <!--EndFragment--> if present
    if (html.includes('<!--StartFragment-->')) {
        const startMarker = '<!--StartFragment-->';
        const start = html.indexOf(startMarker) + startMarker.length;
        const end = html.indexOf('<!--EndFragment-->');
        if (end > start) {
            html = html.substring(start, end);
        }
    }

    // Normalize Windows line breaks
    let s = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Remove comments, head, script, style, meta, link, xml, office tags
    s = s.replace(/<!DOCTYPE[^>]*>/gi, '');
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    s = s.replace(/<\/?(html|body|head|meta|link|xml)[^>]*>/gi, '');
    s = s.replace(/<(script|style|meta|link|head|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '');
    s = s.replace(/<(img|iframe|object|embed|form|input|textarea|select|button)[^>]*>/gi, '');
    s = s.replace(/<o:p>[\s\S]*?<\/o:p>/gi, '');
    s = s.replace(/<\/?o:p[^>]*>/gi, '');

    // Strip KaTeX / MathML duplicate annotation layers:
    s = s.replace(/<span\b[^>]*class=["'][^"']*katex-mathml[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, '');
    s = s.replace(/<annotation\b[^>]*>[\s\S]*?<\/annotation>/gi, '');
    s = s.replace(/<math\b[^>]*>[\s\S]*?<\/math>/gi, '');

    // Replace headings: ensure clean line breaks and bold
    s = s.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n\n<b>$1</b>\n\n');

    // Replace list items: if already starts with number, just \n, otherwise bullet
    s = s.replace(/<li[^>]*>\s*(?=\(?\d+[\.\)])/gi, '\n');
    s = s.replace(/<li[^>]*>/gi, '\n• ');
    s = s.replace(/<\/li>/gi, '');

    // Block elements: div and p -> paragraph breaks (\n\n)
    s = s.replace(/<\/p>/gi, '\n\n');
    s = s.replace(/<p[^>]*>/gi, '');
    s = s.replace(/<\/div>/gi, '\n');
    s = s.replace(/<div[^>]*>/gi, '');
    s = s.replace(/<\/tr>/gi, '\n');
    s = s.replace(/<tr[^>]*>/gi, '');
    s = s.replace(/<td[^>]*>/gi, ' ');
    s = s.replace(/<\/td>/gi, ' ');
    s = s.replace(/<blockquote[^>]*>/gi, '\n\n');
    s = s.replace(/<\/blockquote>/gi, '\n\n');

    // Convert strong -> b, em -> i
    s = s.replace(/<strong\b[^>]*>/gi, '<b>').replace(/<\/strong>/gi, '</b>');
    s = s.replace(/<em\b[^>]*>/gi, '<i>').replace(/<\/em>/gi, '</i>');

    // Remove empty spans or unneeded spans
    s = s.replace(/<span[^>]*>\s*<\/span>/gi, '');
    s = s.replace(/<\/?span[^>]*>/gi, '');

    // Protect mathematical/statistical comparisons like '< 0,001', '<= 0.05', '<0.01' or '> 0.05' from being stripped as tags
    s = s.replace(/<(?=[\s\d=])/g, '&lt;');
    s = s.replace(/>(?=[\s\d=])/g, '&gt;');

    // Strip any other unwanted tags, preserving only safe inline tags
    s = s.replace(new RegExp('<(?!/?(b|i|u|sub|sup|br)\\b)[^>]+>', 'gi'), '');

    // Restore protected mathematical entities
    s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>');

    // Clean attributes on remaining tags
    s = s.replace(/<(b|i|u|sub|sup|br)\b[^>]*>/gi, (match, tag) => {
        if (tag.toLowerCase() === 'br') return '<br>';
        return `<${tag.toLowerCase()}>`;
    });

    // Normalize double <br> or more to \n\n, single <br> and adjoining whitespace to single \n
    s = s.replace(/(?:\s*<br\s*\/?>\s*){2,}/gi, '\n\n');
    s = s.replace(/\s*<br\s*\/?>\s*/gi, '\n');

    // Collapse excess newlines: 3 or more \n into \n\n
    s = s.replace(/\n{3,}/g, '\n\n');

    // Split by 2 or more newlines into distinct paragraphs and run smart unwrapping
    const rawParagraphs = s.split(/\n\s*\n+/);

    const cleanedParagraphs = rawParagraphs.map(para => {
        const rawLines = para.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (rawLines.length === 0) return '';

        let merged = [];
        for (let i = 0; i < rawLines.length; i++) {
            let current = rawLines[i];
            if (merged.length === 0) {
                merged.push(current);
                continue;
            }

            let prev = merged[merged.length - 1];

            const plainCurrent = current.replace(/<[^>]+>/g, '').trim();
            const plainPrev = prev.replace(/<[^>]+>/g, '').trim();

            const isBullet = /^[-*•+>]\s+/.test(plainCurrent);
            const isNumberedList = /^(\(?\d+[\.\)]|\(?[a-zA-Z][\.\)]|\d+(\.\d+)+[\.\)]?)\s+/.test(plainCurrent);
            const isSpeaker = /^[A-ZÁÉÍÓÚÑa-záéíóúñ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]{0,25}:(?!\/)\s*/.test(plainCurrent);
            const isHeader = /^#{1,6}\s+/.test(plainCurrent) || /^<b>[^<]{2,60}<\/b>$/.test(current.trim());
            const isPrevShortHeading = plainPrev.length < 50 && (/^[A-Z0-9\sÁÉÍÓÚÑ\-:]{3,50}$/.test(plainPrev) || /^(cap[ií]tulo|secci[oó]n|resumen|abstract|introducci[oó]n|conclusi[oó]n|m[eé]todo)/i.test(plainPrev)) && !/[,;]$/.test(plainPrev);

            if (isBullet || isNumberedList || isSpeaker || isHeader || isPrevShortHeading) {
                merged.push(current);
            } else {
                // Soft line break inside paragraph -> Unify!
                if (plainPrev.endsWith('-') && /^[a-záéíóúñ]/i.test(plainCurrent)) {
                    merged[merged.length - 1] = prev.replace(/-(<\/?[a-z]+>)*$/, '$1') + current;
                } else {
                    merged[merged.length - 1] = prev + ' ' + current;
                }
            }
        }
        return merged.join('<br>');
    });

    return cleanedParagraphs.filter(p => p.trim() !== '').join('<br><br>').trim();
}

export function convertSlackShortcodes(text) {
    if (!text) return text;
    
    // Country flag shortcodes :flag-xx: → 🇽🇽
    text = text.replace(/:flag-([a-z]{2}):/gi, (match, code) => {
        const upper = code.toUpperCase();
        // Convert country code to regional indicator symbols
        const char1 = String.fromCodePoint(0x1F1E6 + upper.charCodeAt(0) - 65);
        const char2 = String.fromCodePoint(0x1F1E6 + upper.charCodeAt(1) - 65);
        return char1 + char2;
    });
    
    // Common Slack emoji shortcodes
    const emojiMap = {
        // Faces & People
        ':smile:': '😄', ':grinning:': '😀', ':laughing:': '😆', ':blush:': '😊',
        ':smiley:': '😃', ':relaxed:': '☺️', ':smirk:': '😏', ':heart_eyes:': '😍',
        ':kissing_heart:': '😘', ':kissing:': '😗', ':wink:': '😉', ':stuck_out_tongue_winking_eye:': '😜',
        ':stuck_out_tongue:': '😛', ':flushed:': '😳', ':grin:': '😁', ':pensive:': '😔',
        ':relieved:': '😌', ':unamused:': '😒', ':disappointed:': '😞', ':persevere:': '😣',
        ':cry:': '😢', ':joy:': '😂', ':sob:': '😭', ':scream:': '😱',
        ':confused:': '😕', ':open_mouth:': '😮', ':hushed:': '😯', ':sweat_smile:': '😅',
        ':sweat:': '😓', ':weary:': '😩', ':tired_face:': '😫', ':angry:': '😠',
        ':rage:': '😡', ':triumph:': '😤', ':mask:': '😷', ':sunglasses:': '😎',
        ':sleeping:': '😴', ':dizzy_face:': '😵', ':astonished:': '😲', ':worried:': '😟',
        ':fearful:': '😨', ':cold_sweat:': '😰', ':innocent:': '😇', ':thinking_face:': '🤔',
        ':thinking:': '🤔', ':face_with_rolling_eyes:': '🙄', ':zipper_mouth_face:': '🤐',
        ':nerd_face:': '🤓', ':rofl:': '🤣', ':hugging_face:': '🤗',
        ':clown_face:': '🤡', ':cowboy:': '🤠', ':nauseated_face:': '🤢', ':sneezing_face:': '🤧',
        ':star_struck:': '🤩', ':zany_face:': '🤪', ':shushing_face:': '🤫', ':exploding_head:': '🤯',
        ':pleading_face:': '🥺', ':yawning_face:': '🥱', ':partying_face:': '🥳',
        ':skull:': '💀', ':ghost:': '👻', ':alien:': '👽', ':robot_face:': '🤖',
        ':poop:': '💩', ':hankey:': '💩',
        
        // Gestures & Body
        ':wave:': '👋', ':raised_hands:': '🙌', ':clap:': '👏', ':pray:': '🙏',
        ':thumbsup:': '👍', ':+1:': '👍', ':thumbsdown:': '👎', ':-1:': '👎',
        ':punch:': '👊', ':fist:': '✊', ':v:': '✌️', ':ok_hand:': '👌',
        ':raised_hand:': '✋', ':open_hands:': '👐', ':muscle:': '💪',
        ':point_up:': '☝️', ':point_down:': '👇', ':point_left:': '👈', ':point_right:': '👉',
        ':middle_finger:': '🖕', ':hand:': '✋', ':metal:': '🤘',
        ':call_me_hand:': '🤙', ':handshake:': '🤝', ':crossed_fingers:': '🤞',
        ':love_you_gesture:': '🤟', ':palms_up_together:': '🤲',
        ':eyes:': '👀', ':eye:': '👁️', ':tongue:': '👅', ':lips:': '👄',
        ':brain:': '🧠',
        
        // Hearts & Symbols
        ':heart:': '❤️', ':yellow_heart:': '💛', ':green_heart:': '💚',
        ':blue_heart:': '💙', ':purple_heart:': '💜', ':broken_heart:': '💔',
        ':heartpulse:': '💗', ':heartbeat:': '💓', ':sparkling_heart:': '💖',
        ':cupid:': '💘', ':gift_heart:': '💝', ':revolving_hearts:': '💞',
        ':two_hearts:': '💕', ':heart_decoration:': '💟', ':black_heart:': '🖤',
        ':orange_heart:': '🧡', ':white_heart:': '🤍', ':brown_heart:': '🤎',
        ':fire:': '🔥', ':100:': '💯', ':star:': '⭐', ':star2:': '🌟',
        ':sparkles:': '✨', ':dizzy:': '💫', ':boom:': '💥', ':collision:': '💥',
        ':zap:': '⚡', ':snowflake:': '❄️',
        ':sunny:': '☀️', ':cloud:': '☁️', ':umbrella:': '☂️', ':rainbow:': '🌈',
        ':droplet:': '💧', ':ocean:': '🌊',
        
        // Objects & Activities
        ':tada:': '🎉', ':confetti_ball:': '🎊', ':balloon:': '🎈', ':party_popper:': '🎉',
        ':gift:': '🎁', ':trophy:': '🏆', ':medal:': '🏅', ':crown:': '👑',
        ':gem:': '💎', ':ring:': '💍', ':moneybag:': '💰', ':dollar:': '💵',
        ':bulb:': '💡', ':flashlight:': '🔦', ':wrench:': '🔧', ':hammer:': '🔨',
        ':nut_and_bolt:': '🔩', ':gear:': '⚙️', ':link:': '🔗', ':chains:': '⛓️',
        ':key:': '🔑', ':lock:': '🔒', ':unlock:': '🔓',
        ':bell:': '🔔', ':no_bell:': '🔕', ':loudspeaker:': '📢', ':mega:': '📣',
        ':phone:': '☎️', ':iphone:': '📱', ':computer:': '💻', ':desktop_computer:': '🖥️',
        ':keyboard:': '⌨️', ':email:': '📧', ':envelope:': '✉️', ':inbox_tray:': '📥',
        ':outbox_tray:': '📤', ':package:': '📦', ':mailbox:': '📫',
        ':memo:': '📝', ':pencil:': '✏️', ':pencil2:': '✏️', ':pen:': '🖊️',
        ':paperclip:': '📎', ':scissors:': '✂️', ':round_pushpin:': '📍',
        ':book:': '📖', ':books:': '📚', ':bookmark:': '🔖',
        ':newspaper:': '📰', ':calendar:': '📅', ':date:': '📅',
        ':chart_with_upwards_trend:': '📈', ':chart_with_downwards_trend:': '📉',
        ':bar_chart:': '📊', ':clipboard:': '📋', ':pushpin:': '📌',
        ':rocket:': '🚀', ':airplane:': '✈️', ':car:': '🚗', ':taxi:': '🚕',
        ':bus:': '🚌', ':train:': '🚆', ':ship:': '🚢', ':bike:': '🚲',
        ':camera:': '📷', ':movie_camera:': '🎬', ':tv:': '📺', ':radio:': '📻',
        ':musical_note:': '🎵', ':notes:': '🎶', ':microphone:': '🎤', ':headphones:': '🎧',
        ':guitar:': '🎸', ':trumpet:': '🎺', ':violin:': '🎻', ':drum:': '🥁',
        ':art:': '🎨', ':paintbrush:': '🖌️',
        ':soccer:': '⚽', ':basketball:': '🏀', ':football:': '🏈', ':baseball:': '⚾',
        ':tennis:': '🎾', ':volleyball:': '🏐', ':golf:': '⛳', ':ping_pong:': '🏓',
        ':dart:': '🎯', ':8ball:': '🎱',
        
        // Food & Drink
        ':pizza:': '🍕', ':hamburger:': '🍔', ':fries:': '🍟', ':hotdog:': '🌭',
        ':taco:': '🌮', ':burrito:': '🌯', ':sushi:': '🍣', ':ramen:': '🍜',
        ':coffee:': '☕', ':tea:': '🍵', ':beer:': '🍺', ':beers:': '🍻',
        ':wine_glass:': '🍷', ':cocktail:': '🍸', ':tropical_drink:': '🍹',
        ':apple:': '🍎', ':green_apple:': '🍏', ':banana:': '🍌', ':grapes:': '🍇',
        ':strawberry:': '🍓', ':watermelon:': '🍉', ':lemon:': '🍋', ':peach:': '🍑',
        ':avocado:': '🥑', ':eggplant:': '🍆', ':tomato:': '🍅', ':corn:': '🌽',
        ':cake:': '🍰', ':birthday:': '🎂', ':cookie:': '🍪', ':chocolate_bar:': '🍫',
        ':candy:': '🍬', ':ice_cream:': '🍦', ':doughnut:': '🍩',
        
        // Animals & Nature
        ':dog:': '🐶', ':cat:': '🐱', ':mouse:': '🐭', ':hamster:': '🐹',
        ':rabbit:': '🐰', ':bear:': '🐻', ':panda_face:': '🐼', ':koala:': '🐨',
        ':tiger:': '🐯', ':lion_face:': '🦁', ':lion:': '🦁', ':cow:': '🐮',
        ':pig:': '🐷', ':frog:': '🐸', ':monkey_face:': '🐵', ':see_no_evil:': '🙈',
        ':hear_no_evil:': '🙉', ':speak_no_evil:': '🙊', ':chicken:': '🐔',
        ':penguin:': '🐧', ':bird:': '🐦', ':eagle:': '🦅', ':duck:': '🦆',
        ':owl:': '🦉', ':bat:': '🦇', ':wolf:': '🐺', ':fox_face:': '🦊',
        ':butterfly:': '🦋', ':bug:': '🐛', ':ant:': '🐜', ':bee:': '🐝',
        ':ladybug:': '🐞', ':spider:': '🕷️', ':turtle:': '🐢', ':snake:': '🐍',
        ':dragon:': '🐉', ':dinosaur:': '🦕', ':unicorn:': '🦄',
        ':whale:': '🐳', ':dolphin:': '🐬', ':fish:': '🐟', ':tropical_fish:': '🐠',
        ':octopus:': '🐙', ':crab:': '🦀', ':shrimp:': '🦐', ':squid:': '🦑',
        ':rose:': '🌹', ':sunflower:': '🌻', ':hibiscus:': '🌺', ':tulip:': '🌷',
        ':cherry_blossom:': '🌸', ':bouquet:': '💐', ':seedling:': '🌱',
        ':evergreen_tree:': '🌲', ':deciduous_tree:': '🌳', ':palm_tree:': '🌴',
        ':cactus:': '🌵', ':four_leaf_clover:': '🍀', ':mushroom:': '🍄',
        ':fallen_leaf:': '🍂', ':leaves:': '🍃', ':maple_leaf:': '🍁',
        
        // Miscellaneous
        ':checkered_flag:': '🏁', ':triangular_flag_on_post:': '🚩',
        ':crossed_flags:': '🎌', ':white_flag:': '🏳️', ':rainbow_flag:': '🏳️‍🌈',
        ':pirate_flag:': '🏴‍☠️',
        ':warning:': '⚠️', ':no_entry:': '⛔', ':x:': '❌', ':o:': '⭕',
        ':white_check_mark:': '✅', ':heavy_check_mark:': '✔️',
        ':heavy_plus_sign:': '➕', ':heavy_minus_sign:': '➖',
        ':heavy_multiplication_x:': '✖️', ':heavy_division_sign:': '➗',
        ':exclamation:': '❗', ':question:': '❓', ':grey_exclamation:': '❕',
        ':grey_question:': '❔',
        ':arrow_right:': '➡️', ':arrow_left:': '⬅️', ':arrow_up:': '⬆️', ':arrow_down:': '⬇️',
        ':recycle:': '♻️', ':copyright:': '©️', ':registered:': '®️', ':tm:': '™️',
        ':information_source:': 'ℹ️', ':abc:': '🔤', ':abcd:': '🔡',
        ':1234:': '🔢', ':symbols:': '🔣', ':a:': '🅰️', ':b:': '🅱️',
        ':ab:': '🆎', ':cl:': '🆑', ':sos:': '🆘', ':id:': '🆔',
        ':new:': '🆕', ':ng:': '🆖', ':ok:': '🆗', ':cool:': '🆒',
        ':free:': '🆓', ':up:': '🆙', ':vs:': '🆚',
        ':clock1:': '🕐', ':clock2:': '🕑', ':clock3:': '🕒', ':clock4:': '🕓',
        ':hourglass:': '⌛', ':watch:': '⌚', ':alarm_clock:': '⏰',
        ':earth_americas:': '🌎', ':earth_africa:': '🌍', ':earth_asia:': '🌏',
        ':globe_with_meridians:': '🌐', ':world_map:': '🗺️',
        ':mag:': '🔍', ':mag_right:': '🔎',
        ':speech_balloon:': '💬', ':thought_balloon:': '💭',
    };
    
    // Replace all known shortcodes
    text = text.replace(/:([a-zA-Z0-9_+-]+):/g, (match) => {
        return emojiMap[match] || match;
    });
    
    return text;
}

/**
 * Convert LaTeX math notation to Unicode equivalents.
 * Handles: $\tau_d$ → τ_d, $\alpha$ → α, subscripts, superscripts, fractions.
 */

export function wrapSentences(text) {
    if (!text) return '';
    // Normalize newlines: convert <br> to \n while stripping adjoining whitespace
    let cleanText = text.replace(/[\t ]*<br\s*\/?>[\t ]*/gi, '\n');
    cleanText = cleanText.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n');
    const lines = cleanText.split('\n');
    let globalIndex = 0;

    return lines.map(line => {
        const trimmed = line.trim();
        if (trimmed === '') {
            return '<div class="tf-line tf-line-empty"></div>';
        }

        const plainLength = line.replace(/<[^>]+>/g, '').length;
        // List numbers (e.g. "1. "), headers, or short lines (< 90 chars) should be kept as 1 sentence unit
        if (plainLength < 90 || /^<[^>]+>\s*\d+[\.\)]/i.test(line) || /^\d+[\.\)]/.test(trimmed)) {
            return `<div class="tf-line"><span class="tf-sentence" data-index="${globalIndex++}">${line}</span></div>`;
        }

        // For paragraphs, split by sentence endings (. ! ?) only when followed by space and capital letter,
        // while ignoring numbered lists (e.g. "1. ")
        const sentenceRegex = /(?<=[.!?])(?<!\b\d[.!?])(?<!\b[A-Za-z][.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡<])/;
        const parts = line.split(sentenceRegex);

        // Verify HTML tag balance: if any part has unclosed tags, don't split to avoid breaking DOM
        let canSplit = true;
        for (const part of parts) {
            const openB = (part.match(/<b\b[^>]*>/gi) || []).length;
            const closeB = (part.match(/<\/b>/gi) || []).length;
            const openI = (part.match(/<i\b[^>]*>/gi) || []).length;
            const closeI = (part.match(/<\/i>/gi) || []).length;
            if (openB !== closeB || openI !== closeI) {
                canSplit = false;
                break;
            }
        }

        if (canSplit && parts.length > 1) {
            const content = parts.map(s => `<span class="tf-sentence" data-index="${globalIndex++}">${s}</span>`).join(' ');
            return `<div class="tf-line">${content}</div>`;
        } else {
            return `<div class="tf-line"><span class="tf-sentence" data-index="${globalIndex++}">${line}</span></div>`;
        }
    }).join('');
}
