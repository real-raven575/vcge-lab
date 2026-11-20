package com.herdofhelpers.helperboard.core

/**
 * Take cleanup rules (raven575, 2026-11-20): a take stays at least [RetentionSettings.keepDays] after it was last
 * touched, then moves to Trash; Trash empties after [RetentionSettings.trashDays]. Heavy users can set a storage cap.
 * A take the user pressed Keep on is never removed automatically, and the cap never removes a take younger than
 * [RetentionSettings.protectNewerThanMs], so a fresh take can't vanish before the user has seen it.
 */
data class TakeMeta(
    val id: String,
    val createdAtMs: Long,
    val sizeBytes: Long,
    val kept: Boolean = false,
    val trashedAtMs: Long? = null,
    val lastTouchedMs: Long = createdAtMs,
)

data class RetentionSettings(
    val keepDays: Int = 7,
    val trashDays: Int = 14,
    val storageCapBytes: Long? = null,
    val protectNewerThanMs: Long = Retention.DAY_MS,
)

sealed interface RetentionAction {
    val id: String
    data class MoveToTrash(override val id: String) : RetentionAction
    data class Purge(override val id: String) : RetentionAction
}

object Retention {
    const val DAY_MS = 86_400_000L

    fun plan(takes: List<TakeMeta>, nowMs: Long, settings: RetentionSettings = RetentionSettings()): List<RetentionAction> {
        val actions = mutableListOf<RetentionAction>()
        val purged = mutableSetOf<String>()
        val trashedNow = mutableSetOf<String>()

        for (t in takes) {
            if (t.kept) continue
            val trashedAt = t.trashedAtMs
            if (trashedAt != null) {
                if (nowMs - trashedAt >= settings.trashDays * DAY_MS) {
                    actions += RetentionAction.Purge(t.id); purged += t.id
                }
            } else if (nowMs - t.lastTouchedMs >= settings.keepDays * DAY_MS) {
                actions += RetentionAction.MoveToTrash(t.id); trashedNow += t.id
            }
        }

        val cap = settings.storageCapBytes ?: return actions
        var total = takes.filter { it.id !in purged }.sumOf { it.sizeBytes }
        if (total <= cap) return actions

        // Over the cap: empty Trash first (oldest first), then the oldest untouched takes. Never kept or fresh takes.
        val candidates = takes
            .filter { !it.kept && it.id !in purged && nowMs - it.createdAtMs >= settings.protectNewerThanMs }
            .sortedWith(
                compareBy<TakeMeta>({ if (it.trashedAtMs != null || it.id in trashedNow) 0 else 1 })
                    .thenBy { it.trashedAtMs ?: it.lastTouchedMs }
            )
        for (t in candidates) {
            if (total <= cap) break
            actions.removeAll { it is RetentionAction.MoveToTrash && it.id == t.id }
            actions += RetentionAction.Purge(t.id)
            total -= t.sizeBytes
        }
        return actions
    }
}
