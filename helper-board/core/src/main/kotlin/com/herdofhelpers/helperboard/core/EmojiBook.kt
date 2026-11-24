package com.herdofhelpers.helperboard.core

/** One emoji with its name and the feelings or words people search for. */
data class EmojiInfo(val char: String, val name: String, val tags: List<String>, val group: EmojiGroup) {
    private val words: List<String> = (name.split(' ') + tags).map { it.lowercase() }
    /** Every word typed must start one of this emoji's words ("hap" finds happy). */
    fun matches(query: String): Boolean {
        val q = query.lowercase().split(' ').filter { it.isNotBlank() }
        return q.isNotEmpty() && q.all { part -> words.any { it.startsWith(part) } }
    }
    fun nameMatches(query: String) = name.lowercase().split(' ').any { it.startsWith(query.lowercase().trim()) }
}

enum class EmojiGroup(val icon: String, val label: String) {
    FEELINGS("😀", "Feelings"), PEOPLE("👋", "People"), ANIMALS("🐘", "Animals"), FOOD("🍕", "Food"),
    PLACES("🚗", "Places"), THINGS("💡", "Things"), SYMBOLS("❤️", "Symbols"),
}

/**
 * Helper Board's emoji list, kept on the phone: a big window by group, and search by name or feeling
 * (raven575, 11-20). Each line: emoji | name | search words.
 */
object EmojiBook {
    private val DATA = mapOf(
        EmojiGroup.FEELINGS to """
😀|grinning face|happy smile glad joy
😃|big smile|happy joy excited glad
😄|smiling eyes|happy joy laugh glad
😁|beaming|happy proud grin
😆|laughing|happy laugh lol funny
😅|sweat smile|relief nervous phew awkward
😂|tears of joy|laugh lol funny crying
🤣|rolling on the floor|laugh lol funny hilarious
🙂|slight smile|okay fine content
🙃|upside down|silly sarcastic joking
😉|wink|flirt joking hint
😊|blush|happy shy warm grateful
😇|halo|innocent angel good
🥰|hearts face|love adore crush affection
😍|heart eyes|love adore crush wow
🤩|star struck|wow amazed excited
😘|blowing a kiss|love kiss bye
😋|yum|tasty delicious hungry
😛|tongue out|silly playful joking
😜|winking tongue|silly crazy playful
🤪|zany|crazy silly wild
🤗|hug|hugs warm thanks comfort
🤭|hand over mouth|oops giggle secret
🤫|shush|quiet secret hush
🤔|thinking|hmm wonder question
🤐|zipper mouth|secret quiet
😐|neutral|meh blank
😑|expressionless|meh annoyed unimpressed
😶|no mouth|speechless silent
😏|smirk|smug sly
😒|unamused|annoyed meh bored
🙄|eye roll|annoyed whatever
😬|grimace|awkward oops nervous yikes
😌|relieved|calm peaceful content
😔|pensive|sad down thoughtful
😪|sleepy|tired
🤤|drooling|hungry want
😴|sleeping|tired sleep zzz bored
😷|mask|sick ill cold
🤒|thermometer|sick ill fever
🤢|nauseated|sick gross ill
🤮|vomiting|sick gross
🥵|hot face|hot heat sweating
🥶|cold face|cold freezing
🥴|woozy|dizzy drunk tipsy
😵|dizzy face|dizzy shocked
🤯|mind blown|shocked wow amazed
🥳|party face|celebrate birthday party happy
😎|sunglasses|cool confident
🤓|nerd|smart geek
🧐|monocle|curious inspect
😕|confused|unsure puzzled
😟|worried|concerned nervous anxious
🙁|slight frown|sad down
☹️|frown|sad unhappy
😮|open mouth|wow surprised
😲|astonished|shocked surprised wow
🥺|pleading|please sad puppy eyes
😦|frowning open mouth|shocked worried
😧|anguished|worried upset
😨|fearful|scared afraid
😰|anxious sweat|worried nervous scared
😥|sad but relieved|disappointed phew
😢|crying|sad tear upset
😭|loud crying|sad sob upset
😱|screaming|scared shocked fear
😖|confounded|frustrated upset
😣|persevering|struggling frustrated
😞|disappointed|sad let down
😓|downcast sweat|tired stressed
😩|weary|tired exhausted fed up
😫|tired face|exhausted tired fed up
🥱|yawn|tired bored sleepy
😤|steam from nose|frustrated determined angry
😡|pouting|angry mad furious
😠|angry face|angry mad annoyed
🤬|cursing|angry swearing furious
😈|smiling devil|mischief naughty
💀|skull|dead lol dying
💩|poop|silly gross
🤡|clown|silly joke
👻|ghost|boo spooky halloween
🤖|robot|bot machine
""",
        EmojiGroup.PEOPLE to """
👋|waving hand|hi hello bye wave
🤚|raised hand|stop wait hi
✋|hand|stop high five
👌|ok hand|okay perfect fine
🤌|pinched fingers|what italian
✌️|victory|peace
🤞|crossed fingers|luck hope wish
🤟|love you hand|love
🤘|horns|rock metal
🤙|call me|call phone shaka
👈|point left|left
👉|point right|right
👆|point up|up above
👇|point down|down below
☝️|index up|one wait point
👍|thumbs up|yes okay good like agree
👎|thumbs down|no bad dislike disagree
✊|raised fist|power solidarity
👊|fist bump|punch bro
👏|clapping|applause congrats bravo
🙌|raised hands|yay celebrate praise
👐|open hands|hug
🤲|palms up|please offer
🤝|handshake|deal agree meet
🙏|folded hands|please thanks pray grateful hope
✍️|writing hand|write note
💪|flexed biceps|strong strength gym proud
🧠|brain|smart think memory
👀|eyes|look watching see
👂|ear|listen hear
🗣️|speaking head|talk speak voice
👶|baby|child newborn
🧒|child|kid
👩|woman|lady
👨|man|guy
🧓|older person|elder grandparent
👪|family|parents kids home
💏|kiss|couple love romance
💑|couple with heart|love romance
🤷|shrug|whatever dunno idk
🤦|facepalm|ugh oops disbelief
🙋|raising hand|me question hi
🙇|bowing|sorry thanks respect
🏃|running|run hurry exercise
🚶|walking|walk
""",
        EmojiGroup.ANIMALS to """
🐘|elephant|cornerstone herd memory
🦒|giraffe|milestone tall
🐢|turtle|shutout slow tortoise
🦝|raccoon|ghost
🦉|owl|glyph wise night
🐙|octopus|pidge
🦎|lizard|chameleon flipside
🦓|zebra|checkers
🦅|eagle|falcon airlock bird
🐱|cat|kitty pet meow
🐶|dog|puppy pet woof
🐭|mouse|
🐰|rabbit|bunny
🦊|fox|
🐻|bear|
🐼|panda|inkwell
🐨|koala|
🐯|tiger|
🦁|lion|
🐮|cow|
🐷|pig|
🐸|frog|
🐵|monkey|
🐒|monkey|wrench
🐔|chicken|
🐧|penguin|
🐦|bird|
🦋|butterfly|
🐝|bee|busy honey
🐞|ladybug|
🐢|turtle|
🐍|snake|
🐬|dolphin|
🐳|whale|
🐟|fish|
🦄|unicorn|magic
🌸|cherry blossom|flower spring
🌹|rose|flower love romance
🌻|sunflower|flower happy summer
🌷|tulip|flower spring
🌲|tree|evergreen forest
🍀|four leaf clover|luck lucky
🍁|maple leaf|autumn fall
🌵|cactus|desert
""",
        EmojiGroup.FOOD to """
☕|coffee|tea hot drink morning
🍵|tea|green tea drink
🧃|juice box|drink
🥤|cup with straw|soda drink
🍺|beer|drink cheers
🍷|wine|drink cheers
🥂|clinking glasses|cheers celebrate toast
🍕|pizza|food dinner
🍔|burger|food dinner
🍟|fries|food
🌭|hot dog|food
🌮|taco|food
🌯|burrito|food
🍝|spaghetti|pasta food dinner
🍜|noodles|ramen soup
🍣|sushi|food
🍳|cooking|egg breakfast
🥞|pancakes|breakfast
🥗|salad|healthy food
🍞|bread|food
🧀|cheese|food
🍎|apple|fruit
🍌|banana|fruit
🍓|strawberry|fruit
🍉|watermelon|fruit summer
🍇|grapes|fruit
🍰|cake|dessert sweet
🎂|birthday cake|birthday party celebrate
🧁|cupcake|dessert sweet
🍪|cookie|dessert sweet
🍫|chocolate|sweet
🍿|popcorn|movie snack
🍽️|plate|dinner eat meal
""",
        EmojiGroup.PLACES to """
🏠|house|home
🏡|home with garden|home house
🏢|office building|work
🏥|hospital|doctor health sick
🏫|school|class learn
⛪|church|
🏪|store|shop
🚗|car|drive driving ride
🚕|taxi|ride
🚌|bus|ride transit
🚲|bicycle|bike ride
✈️|airplane|flight travel trip
🚀|rocket|launch fast space
⛽|fuel pump|gas
🚦|traffic light|traffic wait
🗺️|map|travel directions
🏖️|beach|vacation summer
⛰️|mountain|hike outdoors
🌙|moon|night sleep
☀️|sun|sunny day weather
⛅|sun behind cloud|weather
🌧️|rain|weather rainy
⛈️|storm|weather thunder
❄️|snowflake|snow cold winter
🌈|rainbow|pride hope
🔥|fire|hot lit awesome
🌊|wave|ocean sea water
""",
        EmojiGroup.THINGS to """
📱|phone|mobile cell
💻|laptop|computer work
⌨️|keyboard|type
🖨️|printer|print
📞|telephone|call phone
📧|email|mail
✉️|envelope|mail letter
📅|calendar|date schedule appointment
⏰|alarm clock|time wake reminder
⌛|hourglass|time wait
💡|light bulb|idea
🔋|battery|charge power
🔌|plug|charge power
🔑|key|password lock
🔒|lock|private secure
💊|pill|medicine meds health
💉|syringe|shot vaccine
🩺|stethoscope|doctor health
🛒|cart|shopping groceries
🎁|gift|present birthday
🎈|balloon|party birthday
🎉|party popper|celebrate congrats party
🎊|confetti|celebrate party
🏆|trophy|win winner award
🥇|gold medal|first win
⚽|soccer|ball sport
🏀|basketball|sport
🎮|video game|game play
🎵|music note|music song
🎧|headphones|music listen
📷|camera|photo picture
🎬|clapper|movie film
📚|books|read study
📝|memo|note write
✏️|pencil|write
📌|pushpin|pin location
💼|briefcase|work job business
💰|money bag|money cash rich
💵|dollar|money cash pay
🧾|receipt|bill pay
🗑️|wastebasket|trash delete
🧹|broom|clean
""",
        EmojiGroup.SYMBOLS to """
❤️|red heart|love
🧡|orange heart|love
💛|yellow heart|love friendship
💚|green heart|love
💙|blue heart|love
💜|purple heart|love
🖤|black heart|love dark
🤍|white heart|love
💔|broken heart|sad heartbreak
💕|two hearts|love
💖|sparkling heart|love
💯|hundred|perfect agree yes
✨|sparkles|magic new shiny
⭐|star|favorite
🌟|glowing star|great shine
💥|collision|boom
💤|zzz|sleep tired
✅|check|done yes complete
☑️|check box|done
✔️|check mark|done yes
❌|cross mark|no wrong cancel
❗|exclamation|important
❓|question|ask what
⚠️|warning|careful caution
🚫|prohibited|no forbidden
⛔|no entry|stop
🆗|ok button|okay
🆘|sos|help emergency
➕|plus|add
➖|minus|subtract
🔁|repeat|again loop
🔔|bell|notification reminder
🔕|bell off|mute quiet
♻️|recycle|reuse
🏳️‍🌈|rainbow flag|pride
""",
    )

    val ALL: List<EmojiInfo> = DATA.flatMap { (group, text) ->
        text.trim().lines().map { it.split('|') }.filter { it.size >= 2 }.map { p ->
            EmojiInfo(p[0], p[1], p.getOrNull(2).orEmpty().split(' ').filter { it.isNotBlank() }, group)
        }
    }.distinctBy { it.char }

    fun inGroup(group: EmojiGroup): List<EmojiInfo> = ALL.filter { it.group == group }

    /** Search by name or feeling. Name matches come first, then feeling and other words. */
    fun search(query: String): List<EmojiInfo> {
        if (query.isBlank()) return emptyList()
        val hits = ALL.filter { it.matches(query) }
        return hits.filter { it.nameMatches(query) } + hits.filterNot { it.nameMatches(query) }
    }

    const val MIN_RECENT = 4
    const val MAX_RECENT = 12
    const val DEFAULT_RECENT = 8
}
