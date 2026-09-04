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
    
    // Fix collapsed line breaks (e.g. "L2O)En" -> "L2O)\nEn")
    normalized = normalized.replace(/\)([A-ZÁÉÍÓÚÑ])/g, ')\n$1');
    // Fix collapsed colon headings e.g. "Óptimos:En lugar" -> "Óptimos:\nEn lugar"
    normalized = normalized.replace(/([:;])([A-ZÁÉÍÓÚÑ])/g, '$1\n$2');
    
    // Split by double newlines first to keep paragraph structure
    const paragraphs = normalized.split(/\n\n+/);
    
    const cleanedParagraphs = paragraphs.map(para => {
        let lines = para.split('\n');
        let cleanedLines = [];
        
        for (let i = 0; i < lines.length; i++) {
            let currentLine = lines[i].trim();
            if (currentLine === '') continue;
            
            if (cleanedLines.length === 0) {
                cleanedLines.push(currentLine);
                continue;
            }
            
            let prevLine = cleanedLines[cleanedLines.length - 1];
            
            // Detect if current line starts with a list marker or heading:
            // Bullet points (-, *, •, o, +, etc.), numbered list (1., 2., a., b., (1), etc.) or heading (#)
            let isCurrentList = /^[-*•o+>#]\s+/.test(currentLine) || /^\(?\d+[\.\)]\s+/.test(currentLine) || /^[a-zA-Z][\.\)]\s+/.test(currentLine);
            
            // Detect if previous line was a numbered item or heading (e.g. "1. Enfoque...")
            let prevWasListOrHeading = /^[-*•o+>#]\s+/.test(prevLine) || /^\(?\d+[\.\)]\s+/.test(prevLine) || /^[a-zA-Z][\.\)]\s+/.test(prevLine);
            
            // Detect if current line starts with a speaker label (name: text)
            let isSpeakerLine = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{0,20}:/.test(currentLine);
            
            // Detect if previous line ends with sentence-terminating punctuation (period, colon, question, exclamation)
            // Note: Do NOT treat closing parentheses ) or brackets ] as end-of-sentence, because academic stats often wrap lines after (H0) or (p = 0.01)
            let prevEndsWithPunctuation = /[.!?:;\u201D\u2019»«—–]$/.test(prevLine);
            
            // Detect if previous line is very short and ends like a heading/label, not just soft-wrapped text
            let prevIsShort = prevLine.replace(/<[^>]+>/g, '').length < 40 && prevEndsWithPunctuation;
            
            if (isCurrentList || isSpeakerLine || prevWasListOrHeading || prevEndsWithPunctuation || prevIsShort) {
                // Keep as separate line!
                cleanedLines.push(currentLine);
            } else {
                // Only join if previous line ended with a hyphen (word wrapping) or continuous wrapped sentence
                if (prevLine.endsWith('-')) {
                    cleanedLines[cleanedLines.length - 1] = prevLine.slice(0, -1) + currentLine;
                } else {
                    cleanedLines[cleanedLines.length - 1] = prevLine + ' ' + currentLine;
                }
            }
        }
        
        return cleanedLines.join('\n');
    });
    
    // Rejoin paragraphs with double newlines
    return cleanedParagraphs.filter(p => p.trim() !== '').join('\n\n');
}

/**
 * Sanitize HTML from clipboard: keep only safe formatting tags.
 * Strips scripts, styles, images, and other dangerous elements.
 * Preserves: b, strong, i, em, u, br, p, div, span, sub, sup
 */

export function sanitizeClipboardHtml(html) {
    if (!html) return '';

    // Normalize Windows line breaks
    let s = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Remove comments, head, script, style, meta, link
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    s = s.replace(/<(script|style|meta|link|head|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '');
    s = s.replace(/<(img|iframe|object|embed|form|input|textarea|select|button)[^>]*>/gi, '');

    // Strip KaTeX / MathML duplicate annotation layers:
    // When copying from ChatGPT / KaTeX / MathJax, <span class="katex-mathml"> and <annotation> contain hidden TeX annotations
    // which duplicate the visible text in <span class="katex-html">.
    s = s.replace(/<span\b[^>]*class=["'][^"']*katex-mathml[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, '');
    s = s.replace(/<annotation\b[^>]*>[\s\S]*?<\/annotation>/gi, '');
    s = s.replace(/<math\b[^>]*>[\s\S]*?<\/math>/gi, '');

    // Replace headings: ensure clean line breaks and bold
    s = s.replace(/<h[1-6][^>]*>/gi, '<br><br><b>');
    s = s.replace(/<\/h[1-6]>/gi, '</b><br>');

    // Replace list items: if already starts with number, just <br>, otherwise bullet
    s = s.replace(/<li[^>]*>\s*(?=\(?\d+[\.\)])/gi, '<br>');
    s = s.replace(/<li[^>]*>/gi, '<br>• ');
    s = s.replace(/<\/li>/gi, '');

    // Block elements: div and p
    s = s.replace(/<\/p>/gi, '<br><br>');
    s = s.replace(/<p[^>]*>/gi, '');
    s = s.replace(/<\/div>/gi, '<br>');
    s = s.replace(/<div[^>]*>/gi, '');
    s = s.replace(/<\/tr>/gi, '<br>');
    s = s.replace(/<tr[^>]*>/gi, '');
    s = s.replace(/<td[^>]*>/gi, ' ');
    s = s.replace(/<\/td>/gi, ' ');
    s = s.replace(/<blockquote[^>]*>/gi, '<br>');
    s = s.replace(/<\/blockquote>/gi, '<br>');

    // Convert strong -> b, em -> i
    s = s.replace(/<strong\b[^>]*>/gi, '<b>');
    s = s.replace(/<\/strong>/gi, '</b>');
    s = s.replace(/<em\b[^>]*>/gi, '<i>');
    s = s.replace(/<\/em>/gi, '</i>');

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

    // Normalize whitespace around <br> to avoid spurious double blank lines
    s = s.replace(/(\s*<br\s*\/?>[\s\n]*)+/gi, (match) => {
        const count = (match.match(/<br/gi) || []).length;
        const newlines = (match.match(/\n/g) || []).length;
        return (count >= 2 || newlines >= 2) ? '<br><br>' : '<br>';
    });
    s = s.replace(/^(<br\s*\/?>\s*)+/gi, '').replace(/(<br\s*\/?>\s*)+$/gi, '');

    return s.trim();
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
