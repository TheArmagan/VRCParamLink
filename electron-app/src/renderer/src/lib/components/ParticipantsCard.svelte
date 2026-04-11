<script lang="ts">
  import { Crown, Users } from "@lucide/svelte";
  import type { Participant } from "../../../../../../shared/src/index.ts";
  import { Badge } from "$lib/components/ui/badge/index.js";

  let {
    participants = [],
    ownerSessionId = null,
    selfSessionId = null,
  }: {
    participants?: Participant[];
    ownerSessionId?: string | null;
    selfSessionId?: string | null;
  } = $props();
</script>

<div class="grid gap-1.5">
  <div
    class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
  >
    <Users class="size-3.5" />
    Participants ({participants.length})
  </div>

  {#if participants.length === 0}
    <div
      class="rounded-md border border-border bg-muted/50 px-2.5 py-2 text-center text-xs text-muted-foreground"
    >
      No participants yet.
    </div>
  {:else}
    <div class="flex flex-wrap gap-1.5">
      {#each participants as participant (participant.sessionId)}
        <div
          class="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs"
        >
          <span class="font-medium text-foreground"
            >{participant.displayName}</span
          >
          {#if participant.sessionId === selfSessionId}
            <span class="text-muted-foreground">(You)</span>
          {/if}
          {#if participant.sessionId === ownerSessionId}
            <Crown class="size-3 text-amber-400" />
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
