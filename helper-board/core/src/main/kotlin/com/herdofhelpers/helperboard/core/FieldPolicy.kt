package com.herdofhelpers.helperboard.core

/**
 * What the keyboard may remember in the text box it is typing into. Password boxes, and boxes whose app asks for no
 * personalized learning (incognito tabs and similar), are private: no word learning and no saved voice takes, unless
 * the user has turned on "Save in private boxes" (off by default). The numbers are Android's own InputType and
 * EditorInfo constants, copied here so the rule can be tested without a phone.
 */
data class FieldPolicy(val learnWords: Boolean, val saveTakes: Boolean, val isPrivate: Boolean, val isWebOrEmail: Boolean) {
    companion object {
        private const val TYPE_MASK_CLASS = 0x0000000f
        private const val TYPE_MASK_VARIATION = 0x00000ff0
        private const val TYPE_CLASS_TEXT = 0x00000001
        private const val TYPE_CLASS_NUMBER = 0x00000002
        private const val TEXT_VARIATION_URI = 0x00000010
        private const val TEXT_VARIATION_EMAIL_ADDRESS = 0x00000020
        private const val TEXT_VARIATION_PASSWORD = 0x00000080
        private const val TEXT_VARIATION_VISIBLE_PASSWORD = 0x00000090
        private const val TEXT_VARIATION_WEB_EMAIL_ADDRESS = 0x000000d0
        private const val TEXT_VARIATION_WEB_PASSWORD = 0x000000e0
        private const val NUMBER_VARIATION_PASSWORD = 0x00000010
        const val IME_FLAG_NO_PERSONALIZED_LEARNING = 0x01000000

        fun isPassword(inputType: Int): Boolean {
            val cls = inputType and TYPE_MASK_CLASS
            val variation = inputType and TYPE_MASK_VARIATION
            return when (cls) {
                TYPE_CLASS_TEXT -> variation == TEXT_VARIATION_PASSWORD ||
                    variation == TEXT_VARIATION_VISIBLE_PASSWORD ||
                    variation == TEXT_VARIATION_WEB_PASSWORD
                TYPE_CLASS_NUMBER -> variation == NUMBER_VARIATION_PASSWORD
                else -> false
            }
        }

        fun from(inputType: Int, imeOptions: Int, allowPrivateSaving: Boolean = false): FieldPolicy {
            val private = isPassword(inputType) || (imeOptions and IME_FLAG_NO_PERSONALIZED_LEARNING) != 0
            val variation = inputType and TYPE_MASK_VARIATION
            val webOrEmail = (inputType and TYPE_MASK_CLASS) == TYPE_CLASS_TEXT && variation in setOf(
                TEXT_VARIATION_URI, TEXT_VARIATION_EMAIL_ADDRESS, TEXT_VARIATION_WEB_EMAIL_ADDRESS
            )
            val allowed = !private || allowPrivateSaving
            return FieldPolicy(learnWords = allowed, saveTakes = allowed, isPrivate = private, isWebOrEmail = webOrEmail)
        }
    }
}
